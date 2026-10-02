import { setTimeout } from "node:timers/promises"
import type { Awsesh } from "./index"
import type { SSOLoginInfo, SSOSession } from "./types"

/** Presentation-independent operations for interactive clients. Never returns credentials or tokens. */
export function createWorkflow(awsesh: Awsesh) {
  const logins = new Map<string, SSOLoginInfo>()

  function validateName(name: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,127}$/.test(name)) {
      throw new Error("Session names must contain letters, numbers, spaces, dashes or underscores")
    }
  }

  function validateRegion(region: string) {
    if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) throw new Error("Invalid AWS region")
  }

  async function session(name: string) {
    validateName(name)
    const value = await awsesh.sessions.get(name)
    if (!value) throw new Error(`SSO session not found: ${name}`)
    return value
  }

  async function token(value: SSOSession) {
    const cached = await awsesh.tokens.get(value.startUrl)
    if (!cached) throw new Error("Sign in to this SSO session first")
    return cached.token
  }

  async function account(name: string, accountId: string) {
    const cache = await awsesh.accounts.get(name)
    const value = cache?.accounts.find((item) => item.accountId === accountId)
    if (!value) throw new Error("Account not found; refresh the account list")
    return value
  }

  async function snapshot(name?: string) {
    const sessions = await awsesh.sessions.list()
    const selected = name ? await session(name) : undefined
    const credentials = await awsesh.activeCredentials.list()
    const cache = selected ? await awsesh.accounts.get(selected.name) : undefined
    const roles = selected ? await awsesh.preferredRoles.getAll(selected.name) : {}
    const regions = selected ? await awsesh.preferredRegions.getAll(selected.name) : {}
    return {
      sessions: await Promise.all(sessions.map(async (value) => ({
        ...value,
        authenticated: !!await awsesh.tokens.get(value.startUrl),
      }))),
      session: selected?.name,
      accounts: await Promise.all((cache?.accounts ?? []).map(async (value) => ({
        ...value,
        preferredRole: value.roles.includes(roles[value.accountId]) ? roles[value.accountId] : undefined,
        region: regions[value.accountId] ?? selected?.defaultRegion,
        profiles: await awsesh.profileNames.getForAccount(selected?.name ?? "", value.name),
      }))),
      credentials,
      lastSelected: await awsesh.lastSelected.get(),
      lastAccount: selected ? await awsesh.lastAccountPerSession.get(selected.name) : undefined,
      lastSession: await awsesh.lastSession.get(),
      appearance: await awsesh.desktopAppearance.get(),
    }
  }

  return {
    snapshot,
    async setAppearance(appearance: string, name?: string) {
      if (appearance !== "system" && appearance !== "light" && appearance !== "dark") {
        throw new Error("Appearance must be system, light or dark")
      }
      await awsesh.desktopAppearance.save(appearance)
      return snapshot(name)
    },
    async selectSession(name: string, refresh = false) {
      const value = await session(name)
      const cache = await awsesh.accounts.get(name)
      if (refresh || !cache) {
        const accounts = await awsesh.sso.listAccounts(value, await token(value))
        await awsesh.accounts.save(name, { accounts, lastUpdated: Date.now() })
      }
      await awsesh.lastSession.save(name)
      return snapshot(name)
    },
    async saveSession(value: SSOSession, creating = false) {
      validateName(value.name)
      const url = new URL(value.startUrl)
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("SSO start URL must use HTTPS")
      validateRegion(value.ssoRegion)
      validateRegion(value.defaultRegion)
      if (creating && await awsesh.sessions.exists(value.name)) throw new Error("A session with this name already exists")
      await awsesh.sessions.save(value)
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
      const roles = await awsesh.sso.listRoles(value, await token(value), accountId)
      const cache = await awsesh.accounts.get(name)
      if (!cache) throw new Error("Account cache no longer exists")
      await awsesh.accounts.save(name, {
        ...cache,
        accounts: cache.accounts.map((item) => item.accountId === accountId ? { ...item, roles, rolesLoaded: true } : item),
      })
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
    async assumeRole(name: string, accountId: string, role: string) {
      const value = await session(name)
      const selected = await account(name, accountId)
      if (!selected.roles.includes(role)) throw new Error("Role is not available for this account")
      const credentials = await awsesh.sso.getCredentials(value, await token(value), accountId, role)
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
    async signOut(name: string) {
      const value = await session(name)
      logins.delete(name)
      await awsesh.clearSessionCredentials(name, true)
      await awsesh.tokens.remove(value.startUrl)
      return snapshot(name)
    },
  }
}
