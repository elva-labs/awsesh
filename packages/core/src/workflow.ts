import { createHash } from "node:crypto"
import { setTimeout } from "node:timers/promises"
import type { Awsesh } from "./index"
import type { AccountCache, SSOLoginInfo, SSOSession, TokenCache } from "./types"

function roleScope(session: SSOSession, token: TokenCache) {
  return createHash("sha256").update(JSON.stringify([
    session.startUrl, session.ssoRegion, token.signInId ?? [token.token, token.expiresAt.toISOString()],
  ])).digest("hex")
}

function accountsForSignIn(cache: AccountCache | undefined, scope: string | undefined) {
  const accounts = cache?.accounts ?? []
  return scope && cache?.roleScope === scope
    ? accounts
    : accounts.map((account) => ({ ...account, roles: [], rolesLoaded: false }))
}

/** Presentation-independent operations for interactive clients. Never returns credentials or tokens. */
export function createWorkflow(awsesh: Awsesh) {
  const logins = new Map<string, SSOLoginInfo>()
  const accountRefreshes = new Map<string, Promise<AccountCache>>()

  function validateRegion(region: string) {
    if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) throw new Error("Invalid AWS region")
  }

  function validateGroup(group: string) {
    if (group !== group.trim() || !/^[^\p{C}]{1,64}$/u.test(group)) {
      throw new Error("Group names must be 1–64 characters without leading or trailing spaces")
    }
  }

  async function session(name: string) {
    const value = await awsesh.sessions.get(name)
    if (!value) throw new Error(`SSO session not found: ${name}`)
    return value
  }

  async function authorization(value: SSOSession) {
    const cached = await awsesh.tokens.get(value.startUrl)
    if (!cached) throw new Error("Sign in to this SSO session first")
    return cached
  }

  async function cachedAccounts(value: SSOSession) {
    const cache = await awsesh.accounts.get(value.name)
    if (!cache) return
    const token = await awsesh.tokens.get(value.startUrl)
    return { ...cache, accounts: accountsForSignIn(cache, token && roleScope(value, token)) }
  }

  async function account(name: string, accountId: string) {
    const cache = await cachedAccounts(await session(name))
    const value = cache?.accounts.find((item) => item.accountId === accountId)
    if (!value) throw new Error("Account not found; refresh the account list")
    return value
  }

  async function verifySignIn(value: SSOSession, scope: string) {
    const current = await awsesh.sessions.get(value.name)
    const token = current && await awsesh.tokens.get(current.startUrl)
    if (!current || !token || roleScope(current, token) !== scope) {
      throw new Error("SSO session changed during refresh")
    }
  }

  async function fetchAccounts(value: SSOSession, token: string, scope: string) {
    const accounts = await awsesh.sso.listAccounts(value, token)
    return awsesh.accounts.update(value.name, async (cache) => {
      await verifySignIn(value, scope)
      const cached = new Map(accountsForSignIn(cache, scope).map((item) => [item.accountId, item]))
      return {
        lastUpdated: Date.now(),
        roleScope: scope,
        accounts: accounts.map((item) => {
          const previous = cached.get(item.accountId)
          return previous?.rolesLoaded ? { ...item, roles: previous.roles, rolesLoaded: true } : item
        }),
      }
    })
  }

  async function refreshAccounts(name: string) {
    const value = await session(name)
    const token = await authorization(value)
    const scope = roleScope(value, token)
    const key = JSON.stringify([name, scope])
    const pending = accountRefreshes.get(key)
    if (pending) return pending
    const refresh = fetchAccounts(value, token.token, scope).finally(() => accountRefreshes.delete(key))
    accountRefreshes.set(key, refresh)
    return refresh
  }

  async function fetchRoles(value: SSOSession, accountId: string, signal?: AbortSignal) {
    const token = await authorization(value)
    const scope = roleScope(value, token)
    const roles = await awsesh.sso.listRoles(value, token.token, accountId, signal)
    await awsesh.accounts.update(value.name, async (cache) => {
      await verifySignIn(value, scope)
      signal?.throwIfAborted()
      if (!cache) throw new Error("Account cache no longer exists")
      return {
        ...cache,
        roleScope: scope,
        accounts: accountsForSignIn(cache, scope).map((item) =>
          item.accountId === accountId ? { ...item, roles, rolesLoaded: true } : item
        ),
      }
    })
    return roles
  }

  async function snapshot(name?: string) {
    const [sessions, selected, credentials, previous, lastSelected, lastSession] = await Promise.all([
      awsesh.sessions.list().then((sessions) => Promise.all(sessions.map(async (value) => ({
        ...value,
        authenticated: !!await awsesh.tokens.get(value.startUrl),
      })))),
      name ? session(name) : undefined,
      awsesh.activeCredentials.list(),
      awsesh.lastSetCredential.get(),
      awsesh.lastSelected.get(),
      awsesh.lastSession.get(),
    ])
    const preferences = selected && await Promise.all([
      cachedAccounts(selected),
      awsesh.preferredRoles.getAll(selected.name),
      awsesh.preferredRegions.getAll(selected.name),
      awsesh.lastProfiles.getAll(selected.name),
      awsesh.accountLayout.get(selected.name),
      awsesh.profileNames.getAll(selected.name),
      awsesh.lastAccountPerSession.get(selected.name),
    ])
    const [cache, roles, regions, profiles, layout, profileNames, lastAccount] = preferences ?? []
    const pinned = new Set(layout?.pinned)
    const credentialProfiles = new Map<string, string>()
    for (const credential of credentials) {
      if (credential.sessionName === selected?.name) credentialProfiles.set(credential.accountId, credential.profileName)
    }
    return {
      sessions,
      session: selected?.name,
      accounts: (cache?.accounts ?? []).map((value) => ({
        ...value,
        preferredRole: roles && value.roles.includes(roles[value.accountId]) ? roles[value.accountId] : undefined,
        region: regions?.[value.accountId] ?? selected?.defaultRegion,
        profiles: profileNames && Object.hasOwn(profileNames, value.name) ? profileNames[value.name] : {},
        lastProfile: profiles?.[value.accountId]
          ?? (previous?.sessionName === selected?.name && previous?.accountId === value.accountId ? previous.profileName : undefined)
          ?? credentialProfiles.get(value.accountId),
        pinned: pinned.has(value.accountId),
        group: layout?.groups[value.accountId],
      })),
      collapsedGroups: layout?.collapsed ?? [],
      credentials,
      lastSelected,
      lastAccount,
      lastSession,
    }
  }

  async function selectCachedSession(name: string) {
    await session(name)
    await awsesh.lastSession.save(name)
    return snapshot(name)
  }

  const layout = {
    async pinAccount(name: string, accountId: string, pinned: boolean) {
      await session(name)
      await account(name, accountId)
      return awsesh.accountLayout.updateAndGet(name, (layout) => ({
        ...layout,
        pinned: [...layout.pinned.filter((id) => id !== accountId), ...(pinned ? [accountId] : [])],
      }))
    },
    async setAccountGroup(name: string, accountId: string, group: string) {
      await session(name)
      await account(name, accountId)
      if (group) validateGroup(group)
      return awsesh.accountLayout.updateAndGet(name, (layout) => {
        const groups = { ...layout.groups }
        if (group) groups[accountId] = group
        else delete groups[accountId]
        return { ...layout, groups }
      })
    },
    async renameAccountGroup(name: string, group: string, renamed: string) {
      await session(name)
      validateGroup(renamed)
      return awsesh.accountLayout.updateAndGet(name, (layout) => ({
        ...layout,
        groups: Object.fromEntries(Object.entries(layout.groups).map(([id, value]) => [id, value === group ? renamed : value])),
        collapsed: [...new Set(layout.collapsed.map((value) => value === group ? renamed : value))],
      }))
    },
    async removeAccountGroup(name: string, group: string) {
      await session(name)
      return awsesh.accountLayout.updateAndGet(name, (layout) => ({
        ...layout,
        groups: Object.fromEntries(Object.entries(layout.groups).filter(([, value]) => value !== group)),
        collapsed: layout.collapsed.filter((value) => value !== group),
      }))
    },
    async collapseAccountGroup(name: string, group: string, collapsed: boolean) {
      await session(name)
      if (group) validateGroup(group)
      return awsesh.accountLayout.updateAndGet(name, (layout) => ({
        ...layout,
        collapsed: [...layout.collapsed.filter((value) => value !== group), ...(collapsed ? [group] : [])],
      }))
    },
  }

  return {
    snapshot,
    layout,
    refreshAccounts,
    cachedAccounts,
    fetchRoles,
    selectCachedSession,
    async selectSession(name: string, refresh = false) {
      if (refresh || !await awsesh.accounts.get(name)) await refreshAccounts(name)
      return selectCachedSession(name)
    },
    async saveSession(value: SSOSession, creating = false, originalName?: string) {
      const url = new URL(value.startUrl)
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("SSO start URL must use HTTPS")
      validateRegion(value.ssoRegion)
      validateRegion(value.defaultRegion)
      if (creating && await awsesh.sessions.exists(value.name)) throw new Error("A session with this name already exists")
      await awsesh.sessions.save(value, originalName)
      if (originalName !== undefined && originalName !== value.name) {
        const login = logins.get(originalName)
        if (login) logins.set(value.name, login)
        logins.delete(originalName)
      }
      return snapshot()
    },
    async removeSession(name: string) {
      await session(name)
      logins.delete(name)
      await awsesh.sessions.remove(name)
      return snapshot()
    },
    async startLogin(name: string) {
      const value = await session(name)
      const info = await awsesh.sso.startLogin(value)
      logins.set(name, info)
      return { url: info.verificationUriComplete || info.verificationUri, code: info.userCode }
    },
    async pollLogin(name: string) {
      const value = await session(name)
      const info = logins.get(name)
      if (!info) throw new Error("Start a new SSO login")
      if (info.expiresAt.getTime() <= Date.now()) {
        logins.delete(name)
        throw new Error("SSO authorization expired; sign in again")
      }
      await setTimeout(Math.max(1, info.interval) * 1000)
      const result = await awsesh.sso.pollForToken(value, info)
      if (!result) return { complete: false }
      await awsesh.tokens.save(value.startUrl, result.token, result.expiresAt)
      logins.delete(name)
      return { complete: true }
    },
    async cancelLogin(name: string) {
      logins.delete(name)
    },
    async loadRoles(name: string, accountId: string, refresh = false) {
      const value = await session(name)
      const selected = await account(name, accountId)
      if (selected.rolesLoaded && !refresh) return snapshot(name)
      await fetchRoles(value, accountId)
      return snapshot(name)
    },
    async preferRole(name: string, accountId: string, role: string) {
      await session(name)
      const value = await account(name, accountId)
      if (!value.roles.includes(role)) throw new Error("Role is not available for this account")
      await awsesh.preferredRoles.save(name, accountId, role)
      return snapshot(name)
    },
    async setRegion(name: string, accountId: string, region: string) {
      await session(name)
      await account(name, accountId)
      validateRegion(region)
      await awsesh.preferredRegions.save(name, accountId, region)
      return snapshot(name)
    },
    async setProfile(name: string, accountId: string, role: string, profile: string) {
      await session(name)
      const value = await account(name, accountId)
      if (!value.roles.includes(role)) throw new Error("Role is not available for this account")
      if (profile && !/^[a-zA-Z0-9_-]{1,128}$/.test(profile)) throw new Error("Invalid CLI profile name")
      if (profile) await awsesh.profileNames.save(name, value.name, role, profile)
      if (!profile) await awsesh.profileNames.remove(name, value.name, role)
      return snapshot(name)
    },
    async pinAccount(name: string, accountId: string, pinned: boolean) {
      await layout.pinAccount(name, accountId, pinned)
      return snapshot(name)
    },
    async setAccountGroup(name: string, accountId: string, group: string) {
      await layout.setAccountGroup(name, accountId, group)
      return snapshot(name)
    },
    async renameAccountGroup(name: string, group: string, renamed: string) {
      await layout.renameAccountGroup(name, group, renamed)
      return snapshot(name)
    },
    async removeAccountGroup(name: string, group: string) {
      await layout.removeAccountGroup(name, group)
      return snapshot(name)
    },
    async collapseAccountGroup(name: string, group: string, collapsed: boolean) {
      await layout.collapseAccountGroup(name, group, collapsed)
      return snapshot(name)
    },
    async assumeRole(name: string, accountId: string, role: string) {
      const value = await session(name)
      const token = await authorization(value)
      const selected = await account(name, accountId)
      if (!selected.roles.includes(role)) throw new Error("Role is not available for this account")
      const credentials = await awsesh.sso.getCredentials(value, token.token, accountId, role)
      const region = await awsesh.preferredRegions.get(name, accountId) ?? value.defaultRegion
      await awsesh.setCredential({ credentials, sessionName: name, accountId, accountName: selected.name, roleName: role, region })
      await awsesh.lastAccountPerSession.save(name, accountId)
      return snapshot(name)
    },
    async consoleUrl(name: string, accountId?: string, role?: string) {
      const value = await session(name)
      if (!accountId) return awsesh.sso.getDashboardUrl(value)
      const selected = await account(name, accountId)
      if (!role || !selected.roles.includes(role)) throw new Error("Select an available role first")
      return awsesh.sso.getAccountUrl(value, accountId, "", role)
    },
    async clearCredential(accountId: string, role: string, profile: string, name?: string) {
      const active = await awsesh.activeCredentials.list()
      if (!active.some((value) => value.accountId === accountId && value.roleName === role && value.profileName === profile)) {
        throw new Error("Active credential not found")
      }
      await awsesh.clearCredential(accountId, role, profile)
      return snapshot(name)
    },
    async clearAllCredentials(name?: string) {
      if (name) await session(name)
      await awsesh.clearAllCredentials(true)
      return snapshot(name)
    },
    async signOut(name: string) {
      const value = await session(name)
      logins.delete(name)
      await awsesh.clearSessionCredentials(name, true)
      await awsesh.tokens.remove(value.startUrl)
      return snapshot(name)
    },
  }
}
