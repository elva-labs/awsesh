export * from "./types"
export { AWSClient } from "./client"
export { Credentials } from "./credentials"
export { Sessions } from "./sessions"
export { Profiles, MANAGED_MARKER } from "./profiles"
export { Storage } from "./storage"
export { createWorkflow } from "./workflow"

import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { AWSClient } from "./client"
import { Credentials } from "./credentials"
import { Sessions } from "./sessions"
import { Profiles } from "./profiles"
import { Storage } from "./storage"
import { legacySessionKey, readJsonFile, sessionStorageKey } from "./filesystem"
import type {
  AwseshOptions,
  SSOSession,
  SSOLoginInfo,
  TokenCache,
  AccountCache,
  AccountLayout,
  RoleCredentials,
  LastSelected,
  LastSelectedPerSession,
  ActiveCredential,
  LastSetCredential,
  SetCredentialOptions,
  SetCredentialResult,
  Account,
  ManagedProfile,
  ProcessCredentials,
  ProfileSyncResult,
} from "./types"

interface TokenCacheStored {
  token: string
  expiresAt: string
  startUrl: string
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16)
}

interface CachedKeys {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: string
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000

function own<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined
}

export function createAwsesh(options: AwseshOptions) {
  const { configDir, dataDir, awsDir } = options

  const storage = Storage.create({ dir: `${dataDir}/storage` })
  const sessions = Sessions.create({ dir: `${configDir}/sessions` })

  // Resolved per-operation so a runtime toggle (e.g. WSL on/off) takes effect immediately
  async function getAwsDir(): Promise<string> {
    return options.resolveAwsDir ? await options.resolveAwsDir() : awsDir
  }

  async function accountCache(name: string) {
    const cache = await storage.read<AccountCache>(`accounts/${sessionStorageKey(name)}`)
    const legacy = legacySessionKey(name)
    if (cache || legacy === undefined) return cache
    const session = await readJsonFile<SSOSession>(`${configDir}/sessions/${legacy}.json`).catch(() => undefined)
    return session?.name === name ? storage.read<AccountCache>(`accounts/${legacy}`) : undefined
  }


  async function unmanagedNames(names: string[]): Promise<string[]> {
    let config = ""
    try {
      config = await fs.readFile(`${await getAwsDir()}/config`, "utf-8")
    } catch {}
    return Profiles.apply(config, names.map((name) => ({ name, command: "" }))).conflicts
  }

  async function credentialCommand() {
    return typeof options.credentialProcess === "function" ? await options.credentialProcess() : options.credentialProcess
  }

  async function forgetProfileKeys(prefix: string) {
    for (const key of await storage.list(prefix)) await storage.remove(`${prefix}/${key}`)
  }

  async function validToken(startUrl: string): Promise<TokenCache | undefined> {
    const data = await storage.read<TokenCacheStored>(`token/${hashUrl(startUrl)}`)
    if (!data) return undefined
    const expiresAt = new Date(data.expiresAt)
    if (expiresAt <= new Date()) return undefined
    return { token: data.token, expiresAt, startUrl: data.startUrl }
  }

  async function findAccount(session: SSOSession, account: string): Promise<Account | undefined> {
    const match = (accounts: Account[]) => accounts.find((value) => value.accountId === account)
      ?? accounts.find((value) => value.name === account)
      ?? accounts.find((value) => value.name.toLowerCase() === account.toLowerCase())
    const cached = match((await accountCache(session.name))?.accounts ?? [])
    if (cached) return cached
    const token = await validToken(session.startUrl)
    if (!token) return undefined
    return match(await sso.listAccounts(session, token.token))
  }

  async function loginToken(session: SSOSession): Promise<string> {
    const token = await validToken(session.startUrl)
    if (!token) throw new Error(`The SSO login for ${session.name} has expired. Run: sesh auth ${session.name}`)
    return token.token
  }

  async function validateProfile(profile: ManagedProfile) {
    Profiles.validateName(profile.name)
    if (!await sessions.exists(profile.session)) throw new Error(`SSO session not found: ${profile.session}`)
    if (!profile.account.trim() || !profile.role.trim()) throw new Error("A profile needs an account and a role")
    if (profile.region !== undefined && !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(profile.region)) throw new Error("Invalid AWS region")
  }


  const sso = {
    startLogin: (session: SSOSession) => {
      const client = new AWSClient(session.ssoRegion)
      return client.startSSOLogin(session.startUrl)
    },
    pollForToken: (session: SSOSession, loginInfo: SSOLoginInfo) => {
      const client = new AWSClient(session.ssoRegion)
      return client.pollForToken(loginInfo)
    },
    listAccounts: (session: SSOSession, token: string) => {
      const client = new AWSClient(session.ssoRegion)
      return client.listAccounts(token)
    },
    listRoles: (session: SSOSession, token: string, accountId: string) => {
      const client = new AWSClient(session.ssoRegion)
      return client.listAccountRoles(token, accountId)
    },
    getCredentials: (session: SSOSession, token: string, accountId: string, roleName: string) => {
      const client = new AWSClient(session.ssoRegion)
      return client.getRoleCredentials(token, accountId, roleName)
    },
    getDashboardUrl: (session: SSOSession) => {
      const client = new AWSClient(session.ssoRegion)
      return client.getDashboardURL(session.startUrl)
    },
    getAccountUrl: (session: SSOSession, accountId: string, _token: string, roleName: string) => {
      const client = new AWSClient(session.ssoRegion)
      return client.getAccountURL(accountId, session.startUrl, roleName)
    },
  }

  return {
    sessions: {
      list: () => sessions.list(),
      get: (name: string) => sessions.load(name),
      save: async (session: SSOSession, originalName?: string) => {
        if (originalName === undefined || originalName === session.name) {
          const cache = await accountCache(session.name)
          if (cache) await storage.write(`accounts/${sessionStorageKey(session.name)}`, cache)
          return sessions.save(session)
        }
        if (!await sessions.exists(originalName)) throw new Error(`SSO session not found: ${originalName}`)
        if (await sessions.exists(session.name)) throw new Error("A session with this name already exists")
        await sessions.save(session)
        const cache = await accountCache(originalName)
        if (cache) await storage.write(`accounts/${sessionStorageKey(session.name)}`, cache)
        for (const key of ["last-accounts", "last-profiles", "profile-names", "preferred-roles", "preferred-regions", "account-layout"]) {
          const values = await storage.read<Record<string, unknown>>(`preference/${key}`)
          if (!values || !Object.hasOwn(values, originalName)) continue
          const updated = { ...values, [session.name]: values[originalName] }
          delete updated[originalName]
          await storage.write(`preference/${key}`, updated)
        }
        for (const key of ["last-session", "last-selected"]) {
          const value = await storage.read<LastSelected>(`preference/${key}`)
          if (value?.session === originalName) await storage.write(`preference/${key}`, { ...value, session: session.name })
        }
        const active = await storage.read<ActiveCredential[]>("credentials/active")
        if (active) await storage.write("credentials/active", active.map((value) => value.sessionName === originalName ? { ...value, sessionName: session.name } : value))
        const previous = await storage.read<LastSetCredential>("credentials/last-set")
        if (previous?.sessionName === originalName) await storage.write("credentials/last-set", { ...previous, sessionName: session.name })
        const profiles = await Profiles.read(configDir)
        if (profiles.some((value) => value.session === originalName)) {
          await Profiles.write(configDir, profiles.map((value) => value.session === originalName ? { ...value, session: session.name } : value))
        }
        await sessions.remove(originalName)
        await storage.remove(`accounts/${sessionStorageKey(originalName)}`)
      },
      remove: (name: string) => sessions.remove(name),
      exists: (name: string) => sessions.exists(name),
      count: () => sessions.count(),
    },

    sso,

    tokens: {
      get: validToken,
      getWithExpired: async (startUrl: string): Promise<TokenCache | undefined> => {
        const hash = hashUrl(startUrl)
        const data = await storage.read<TokenCacheStored>(`token/${hash}`)
        if (!data) return undefined

        return {
          token: data.token,
          expiresAt: new Date(data.expiresAt),
          startUrl: data.startUrl,
        }
      },
      save: async (startUrl: string, token: string, expiresAt: Date): Promise<void> => {
        const hash = hashUrl(startUrl)
        await storage.write<TokenCacheStored>(`token/${hash}`, {
          token,
          expiresAt: expiresAt.toISOString(),
          startUrl,
        })
      },
      remove: async (startUrl: string): Promise<void> => {
        const hash = hashUrl(startUrl)
        await storage.remove(`token/${hash}`)
      },
      isValid: (cache: TokenCache): boolean => {
        return cache.expiresAt > new Date()
      },
    },

    accounts: {
      get: accountCache,
      save: (sessionName: string, cache: AccountCache) => storage.write(`accounts/${sessionStorageKey(sessionName)}`, cache),
    },

    lastSelected: {
      get: async (): Promise<LastSelected> => {
        const data = await storage.read<LastSelected>("preference/last-selected")
        return data ?? {}
      },
      save: async (selected: Partial<LastSelected>): Promise<void> => {
        await storage.update<LastSelected>("preference/last-selected", (existing) => ({
          ...existing,
          ...selected,
        }))
      },
    },

    lastSession: {
      get: async (): Promise<string | undefined> => {
        const data = await storage.read<{ session: string }>("preference/last-session")
        return data?.session
      },
      save: async (sessionName: string): Promise<void> => {
        await storage.write("preference/last-session", { session: sessionName })
      },
    },

    lastAccountPerSession: {
      get: async (sessionName: string): Promise<string | undefined> => {
        const data = await storage.read<LastSelectedPerSession>("preference/last-accounts")
        return own(data, sessionName)
      },
      save: async (sessionName: string, accountId: string): Promise<void> => {
        await storage.update<LastSelectedPerSession>("preference/last-accounts", (draft) => {
          return { ...draft, [sessionName]: accountId }
        })
      },
      getAll: async (): Promise<LastSelectedPerSession> => {
        const data = await storage.read<LastSelectedPerSession>("preference/last-accounts")
        return data ?? {}
      },
    },

    lastProfiles: {
      getAll: async (sessionName: string): Promise<Record<string, string>> => {
        const data = await storage.read<Record<string, Record<string, string>>>("preference/last-profiles")
        return own(data, sessionName) ?? {}
      },
    },

    profileNames: {
      get: async (sessionName: string, accountName: string, roleName: string): Promise<string | undefined> => {
        const data = await storage.read<Record<string, Record<string, Record<string, string>>>>(
          "preference/profile-names"
        )
        return own(own(own(data, sessionName), accountName), roleName)
      },
      save: async (sessionName: string, accountName: string, roleName: string, profileName: string): Promise<void> => {
        await storage.update<Record<string, Record<string, Record<string, string>>>>(
          "preference/profile-names",
          (draft) => {
            const accounts = own(draft, sessionName)
            return { ...draft, [sessionName]: { ...accounts, [accountName]: { ...own(accounts, accountName), [roleName]: profileName } } }
          }
        )
      },
      getForAccount: async (sessionName: string, accountName: string): Promise<Record<string, string>> => {
        const data = await storage.read<Record<string, Record<string, Record<string, string>>>>(
          "preference/profile-names"
        )
        return own(own(data, sessionName), accountName) ?? {}
      },
      remove: async (sessionName: string, accountName: string, roleName: string): Promise<void> => {
        await storage.update<Record<string, Record<string, Record<string, string>>>>(
          "preference/profile-names",
          (draft) => {
            if (own(own(own(draft, sessionName), accountName), roleName)) {
              delete draft[sessionName][accountName][roleName]
              if (Object.keys(draft[sessionName][accountName]).length === 0) {
                delete draft[sessionName][accountName]
              }
              if (Object.keys(draft[sessionName]).length === 0) {
                delete draft[sessionName]
              }
            }
            return draft
          }
        )
      },
    },

    preferredRoles: {
      get: async (sessionName: string, accountId: string): Promise<string | undefined> => {
        const data = await storage.read<Record<string, Record<string, string>>>("preference/preferred-roles")
        return own(own(data, sessionName), accountId)
      },
      save: async (sessionName: string, accountId: string, roleName: string): Promise<void> => {
        await storage.update<Record<string, Record<string, string>>>("preference/preferred-roles", (draft) => {
          return { ...draft, [sessionName]: { ...own(draft, sessionName), [accountId]: roleName } }
        })
      },
      getAll: async (sessionName: string): Promise<Record<string, string>> => {
        const data = await storage.read<Record<string, Record<string, string>>>("preference/preferred-roles")
        return own(data, sessionName) ?? {}
      },
    },

    preferredRegions: {
      get: async (sessionName: string, accountId: string): Promise<string | undefined> => {
        const data = await storage.read<Record<string, Record<string, string>>>("preference/preferred-regions")
        return own(own(data, sessionName), accountId)
      },
      save: async (sessionName: string, accountId: string, region: string): Promise<void> => {
        await storage.update<Record<string, Record<string, string>>>("preference/preferred-regions", (draft) => {
          return { ...draft, [sessionName]: { ...own(draft, sessionName), [accountId]: region } }
        })
      },
      getAll: async (sessionName: string): Promise<Record<string, string>> => {
        const data = await storage.read<Record<string, Record<string, string>>>("preference/preferred-regions")
        return own(data, sessionName) ?? {}
      },
    },

    accountLayout: {
      get: async (sessionName: string): Promise<AccountLayout> => {
        const data = await storage.read<Record<string, Partial<AccountLayout>>>("preference/account-layout")
        return { pinned: [], groups: {}, collapsed: [], ...own(data, sessionName) }
      },
      update: async (sessionName: string, fn: (layout: AccountLayout) => AccountLayout): Promise<void> => {
        await storage.update<Record<string, Partial<AccountLayout>>>("preference/account-layout", (draft) => {
          return { ...draft, [sessionName]: fn({ pinned: [], groups: {}, collapsed: [], ...own(draft, sessionName) }) }
        })
      },
    },

    /**
     * Profiles awsesh keeps in ~/.aws/config. Each runs `credential_process` against the cached SSO login,
     * so after one sign-in every tool that uses the profile gets fresh keys on its own.
     * Definitions live in `<configDir>/profiles.json`; call `sync()` after changing them.
     */
    profiles: {
      list: () => Profiles.read(configDir),
      get: async (name: string) => (await Profiles.read(configDir)).find((value) => value.name === name),
      /** Adds or replaces profiles by name */
      save: async (values: ManagedProfile[]): Promise<void> => {
        if (values.length > 0 && !await credentialCommand()) throw new Error("This client cannot serve AWS profiles")
        const names = new Set<string>()
        for (const value of values) {
          await validateProfile(value)
          if (names.has(value.name)) throw new Error(`Duplicate profile name: ${value.name}`)
          names.add(value.name)
        }
        const conflicts = await unmanagedNames(values.map((value) => value.name))
        if (conflicts.length > 0) {
          throw new Error(`The AWS config already has [profile ${conflicts[0]}], which awsesh does not manage. Pick another name.`)
        }
        const existing = (await Profiles.read(configDir)).filter((value) => !names.has(value.name))
        await Profiles.write(configDir, [...existing, ...values])
      },
      /** Names that ~/.aws/config already uses for a profile awsesh does not manage */
      unmanaged: (names: string[]) => unmanagedNames(names),
      remove: async (names: string[]): Promise<void> => {
        const existing = await Profiles.read(configDir)
        await Profiles.write(configDir, existing.filter((value) => !names.includes(value.name)))
      },
      /** Writes the managed profiles to ~/.aws/config, removing ones no longer defined. */
      sync: async (): Promise<ProfileSyncResult> => {
        const definitions = await Profiles.read(configDir)
        const command = await credentialCommand()
        if (!command && definitions.length > 0) throw new Error("This client cannot serve AWS profiles")
        const dir = await getAwsDir()
        const target = `${dir}/config`
        let content = ""
        try {
          content = await fs.readFile(target, "utf-8")
        } catch {}
        const result = Profiles.apply(content, definitions.map((value) => ({
          name: value.name,
          command: Profiles.quoteCommand([...(command ?? []), value.name]),
          region: value.region,
        })))
        if (result.content !== content) {
          await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(target, result.content)
        }
        const cleared = await Credentials.removeTemporary(dir, result.written)
        if (cleared.length > 0) {
          await storage.update<ActiveCredential[]>("credentials/active", (existing) =>
            Array.isArray(existing) ? existing.filter((c) => !cleared.includes(c.profileName)) : [])
        }
        return { written: result.written, removed: result.removed, conflicts: result.conflicts, cleared }
      },
      /** credential_process output for a managed profile. Never prompts; fails when the SSO login has expired. */
      credentials: async (name: string): Promise<ProcessCredentials> => {
        const profile = (await Profiles.read(configDir)).find((value) => value.name === name)
        if (!profile) throw new Error(`No awsesh profile named ${name}`)
        const session = await sessions.load(profile.session)
        if (!session) throw new Error(`SSO session not found: ${profile.session}`)
        const account = await findAccount(session, profile.account)
        if (!account) {
          await loginToken(session)
          throw new Error(`No account ${profile.account} in ${session.name}`)
        }
        const key = `profile-keys/${sessionStorageKey(session.name)}/${createHash("sha256").update(`${account.accountId}\0${profile.role}`).digest("hex")}`
        const cached = await storage.read<CachedKeys>(key)
        let keys = cached && Date.parse(cached.expiration) - Date.now() > REFRESH_MARGIN_MS ? cached : undefined
        if (!keys) {
          const fresh = await sso.getCredentials(session, await loginToken(session), account.accountId, profile.role)
          keys = {
            accessKeyId: fresh.accessKeyId,
            secretAccessKey: fresh.secretAccessKey,
            sessionToken: fresh.sessionToken,
            expiration: fresh.expiration.toISOString(),
          }
          await storage.write<CachedKeys>(key, keys)
        }
        return {
          Version: 1,
          AccessKeyId: keys.accessKeyId,
          SecretAccessKey: keys.secretAccessKey,
          SessionToken: keys.sessionToken,
          Expiration: keys.expiration,
        }
      },
    },

    /** @internal Low-level primitive. Prefer `setCredential()` for most use cases. */
    credentials: {
      write: async (profileName: string, creds: RoleCredentials, region?: string) => {
        await Credentials.write({
          awsDir: await getAwsDir(),
          profileName,
          credentials: creds,
          region,
        })
      },
      removeProfile: async (profileName: string) => {
        await Credentials.removeProfile({
          awsDir: await getAwsDir(),
          profileName,
        })
      },
      listProfiles: async () => {
        return Credentials.listProfiles(await getAwsDir())
      },
    },

    /** @internal Low-level primitive. Prefer `setCredential()` / `clearCredential()` for most use cases. */
    activeCredentials: {
      list: async (): Promise<ActiveCredential[]> => {
        const data = await storage.read<ActiveCredential[]>("credentials/active")
        if (!data || !Array.isArray(data)) return []
        const now = new Date()
        return data.filter((c) => new Date(c.expiration) > now)
      },
      save: async (credential: ActiveCredential): Promise<void> => {
        await storage.update<ActiveCredential[]>("credentials/active", (existing) => {
          const list = Array.isArray(existing) ? existing : []
          const now = new Date()
          const filtered = list
            .filter((c) => new Date(c.expiration) > now)
            .filter((c) => !(c.accountId === credential.accountId && c.roleName === credential.roleName))
            .map((c) => (credential.isDefault ? { ...c, isDefault: false } : c))
            .filter((c) => c.isDefault || c.profileName !== "default")
          return [...filtered, credential]
        })
      },
      getForAccount: async (accountId: string): Promise<ActiveCredential[]> => {
        const data = await storage.read<ActiveCredential[]>("credentials/active")
        if (!data || !Array.isArray(data)) return []
        const now = new Date()
        return data.filter((c) => c.accountId === accountId && new Date(c.expiration) > now)
      },
      cleanup: async (): Promise<void> => {
        await storage.update<ActiveCredential[]>("credentials/active", (existing) => {
          if (!existing || !Array.isArray(existing)) return []
          const now = new Date()
          return existing.filter((c) => new Date(c.expiration) > now)
        })
      },
      remove: async (accountId: string, roleName: string): Promise<void> => {
        await storage.update<ActiveCredential[]>("credentials/active", (existing) => {
          if (!existing || !Array.isArray(existing)) return []
          return existing.filter((c) => !(c.accountId === accountId && c.roleName === roleName))
        })
      },
    },

    /** @internal Low-level primitive. Prefer `setCredential()` / `clearCredential()` for most use cases. */
    lastSetCredential: {
      get: async (): Promise<LastSetCredential | undefined> => {
        return storage.read<LastSetCredential>("credentials/last-set")
      },
      save: async (credential: LastSetCredential): Promise<void> => {
        await storage.write("credentials/last-set", credential)
      },
      clear: async (): Promise<void> => {
        await storage.remove("credentials/last-set")
      },
    },

    /**
     * High-level API: Set credentials with all tracking automatically handled.
     * Writes to ~/.aws/credentials, updates activeCredentials, lastSetCredential, and lastSelected.
     * If no profileName is provided, looks up the configured profile for this session/account/role.
     */
    async setCredential(options: SetCredentialOptions): Promise<SetCredentialResult> {
      const {
        credentials,
        sessionName,
        accountId,
        accountName,
        roleName,
        region,
        profileName: customProfileName,
      } = options

      // Look up configured profile if none provided
      const configuredProfile = customProfileName === undefined
        ? await storage.read<Record<string, Record<string, Record<string, string>>>>("preference/profile-names")
            .then(data => own(own(own(data, sessionName), accountName), roleName))
        : undefined

      const profileName = customProfileName || configuredProfile || "default"
      const isDefault = !customProfileName && !configuredProfile

      // A managed profile already serves fresh keys through credential_process; static keys would shadow it and go stale
      const managedProfile = (await Profiles.read(configDir)).find((value) => value.name === profileName)
      if (managedProfile) {
        const sameRole = managedProfile.session === sessionName && managedProfile.role === roleName
          && (managedProfile.account === accountId || managedProfile.account === accountName)
        if (!sameRole) throw new Error(`${profileName} is a managed profile for ${managedProfile.session}/${managedProfile.account}/${managedProfile.role}`)
      }

      // 1. Write to ~/.aws/credentials
      if (!managedProfile) {
        await Credentials.write({
          awsDir: await getAwsDir(),
          profileName,
          credentials,
          region,
        })
      }

      // 2. Track active credential
      await storage.update<ActiveCredential[]>("credentials/active", (existing) => {
        const list = Array.isArray(existing) ? existing : []
        const now = new Date()
        const filtered = list
          .filter((c) => new Date(c.expiration) > now)
          .filter((c) => !(c.accountId === accountId && c.roleName === roleName))
          .map((c) => (isDefault ? { ...c, isDefault: false } : c))
          .filter((c) => c.isDefault || c.profileName !== "default")
        return [
          ...filtered,
          {
            profileName,
            accountId,
            accountName,
            roleName,
            sessionName,
            expiration: credentials.expiration.toISOString(),
            isDefault,
            region,
          },
        ]
      })

      // 3. Update last set credential (for whoami)
      await storage.write<LastSetCredential>("credentials/last-set", {
        profileName,
        accountId,
        accountName,
        roleName,
        sessionName,
        region,
        setAt: new Date().toISOString(),
      })

      await storage.update<Record<string, Record<string, string>>>("preference/last-profiles", (draft) => {
        return { ...draft, [sessionName]: { ...own(draft, sessionName), [accountId]: profileName } }
      })

      // 4. Update last selected (for UI defaults)
      await storage.update<LastSelected>("preference/last-selected", (existing) => ({
        ...existing,
        session: sessionName,
        account: accountName,
        role: roleName,
      }))

      return {
        profileName,
        expiration: credentials.expiration,
        isDefault,
      }
    },

    /**
     * High-level API: Clear a specific credential.
     * Removes from activeCredentials and clears lastSetCredential if it matches.
     */
    async clearCredential(accountId: string, roleName: string, removeProfile?: string): Promise<void> {
      // 1. Remove from active credentials tracking
      await storage.update<ActiveCredential[]>("credentials/active", (existing) => {
        if (!existing || !Array.isArray(existing)) return []
        return existing.filter((c) => !(c.accountId === accountId && c.roleName === roleName))
      })

      // 2. Clear lastSetCredential if it matches
      const lastSet = await storage.read<LastSetCredential>("credentials/last-set")
      if (lastSet && lastSet.accountId === accountId && lastSet.roleName === roleName) {
        await storage.remove("credentials/last-set")
      }

      // 3. Optionally remove from ~/.aws/credentials
      if (removeProfile) {
        await Credentials.removeProfile({ awsDir: await getAwsDir(), profileName: removeProfile })
      }
    },

    /**
     * High-level API: Clear all credentials for a session.
     * Removes all matching credentials and clears lastSetCredential if it matches.
     */
    async clearSessionCredentials(sessionName: string, removeProfiles?: boolean): Promise<void> {
      const active = await storage.read<ActiveCredential[]>("credentials/active")
      const sessionCreds = (active || []).filter((c) => c.sessionName === sessionName)

      // 1. Remove profiles from ~/.aws/credentials if requested
      if (removeProfiles) {
        for (const cred of sessionCreds) {
          await Credentials.removeProfile({ awsDir: await getAwsDir(), profileName: cred.profileName })
        }
      }

      await forgetProfileKeys(`profile-keys/${sessionStorageKey(sessionName)}`)

      // 2. Remove from active credentials tracking
      await storage.update<ActiveCredential[]>("credentials/active", (existing) => {
        if (!existing || !Array.isArray(existing)) return []
        return existing.filter((c) => c.sessionName !== sessionName)
      })

      // 3. Clear lastSetCredential if it matches
      const lastSet = await storage.read<LastSetCredential>("credentials/last-set")
      if (lastSet && lastSet.sessionName === sessionName) {
        await storage.remove("credentials/last-set")
      }
    },

    /**
     * High-level API: Clear all credentials.
     * Removes all tracked credentials and clears lastSetCredential.
     */
    async clearAllCredentials(removeProfiles?: boolean): Promise<void> {
      // 1. Remove profiles from ~/.aws/credentials if requested
      if (removeProfiles) {
        const active = await storage.read<ActiveCredential[]>("credentials/active")
        for (const cred of active || []) {
          await Credentials.removeProfile({ awsDir: await getAwsDir(), profileName: cred.profileName })
        }
      }

      await forgetProfileKeys("profile-keys")

      // 2. Clear active credentials tracking
      await storage.write<ActiveCredential[]>("credentials/active", [])

      // 3. Clear lastSetCredential
      await storage.remove("credentials/last-set")
    },
  }
}

export type Awsesh = ReturnType<typeof createAwsesh>
