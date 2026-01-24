export * from "./types"
export { AWSClient } from "./client"
export { Credentials } from "./credentials"
export { Sessions } from "./sessions"
export { Storage } from "./storage"

import { createHash } from "node:crypto"
import { AWSClient } from "./client"
import { Credentials } from "./credentials"
import { Sessions } from "./sessions"
import { Storage } from "./storage"
import type {
  AwseshOptions,
  SSOSession,
  SSOLoginInfo,
  TokenCache,
  AccountCache,
  RoleCredentials,
  LastSelected,
  LastSelectedPerSession,
  ActiveCredential,
  LastSetCredential,
  SetCredentialOptions,
  SetCredentialResult,
} from "./types"

interface TokenCacheStored {
  token: string
  expiresAt: string
  startUrl: string
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16)
}

export function createAwsesh(options: AwseshOptions) {
  const { configDir, dataDir, awsDir } = options

  const storage = Storage.create({ dir: `${dataDir}/storage` })
  const sessions = Sessions.create({ dir: `${configDir}/sessions` })

  return {
    sessions: {
      list: () => sessions.list(),
      get: (name: string) => sessions.load(name),
      save: (session: SSOSession) => sessions.save(session),
      remove: (name: string) => sessions.remove(name),
      exists: (name: string) => sessions.exists(name),
      count: () => sessions.count(),
    },

    sso: {
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
      getAccountUrl: (session: SSOSession, accountId: string, token: string, roleName: string) => {
        const client = new AWSClient(session.ssoRegion)
        return client.getAccountURL(accountId, token, session.startUrl, roleName)
      },
    },

    tokens: {
      get: async (startUrl: string): Promise<TokenCache | undefined> => {
        const hash = hashUrl(startUrl)
        const data = await storage.read<TokenCacheStored>(`token/${hash}`)
        if (!data) return undefined

        const expiresAt = new Date(data.expiresAt)
        if (expiresAt <= new Date()) return undefined

        return {
          token: data.token,
          expiresAt,
          startUrl: data.startUrl,
        }
      },
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
      get: (sessionName: string) => storage.read<AccountCache>(`accounts/${sessionName}`),
      save: (sessionName: string, cache: AccountCache) => storage.write(`accounts/${sessionName}`, cache),
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
        return data?.[sessionName]
      },
      save: async (sessionName: string, accountId: string): Promise<void> => {
        await storage.update<LastSelectedPerSession>("preference/last-accounts", (draft) => {
          draft[sessionName] = accountId
          return draft
        })
      },
      getAll: async (): Promise<LastSelectedPerSession> => {
        const data = await storage.read<LastSelectedPerSession>("preference/last-accounts")
        return data ?? {}
      },
    },

    profileNames: {
      get: async (sessionName: string, accountName: string, roleName: string): Promise<string | undefined> => {
        const data = await storage.read<Record<string, Record<string, Record<string, string>>>>(
          "preference/profile-names"
        )
        return data?.[sessionName]?.[accountName]?.[roleName]
      },
      save: async (sessionName: string, accountName: string, roleName: string, profileName: string): Promise<void> => {
        await storage.update<Record<string, Record<string, Record<string, string>>>>(
          "preference/profile-names",
          (draft) => {
            if (!draft[sessionName]) draft[sessionName] = {}
            if (!draft[sessionName][accountName]) draft[sessionName][accountName] = {}
            draft[sessionName][accountName][roleName] = profileName
            return draft
          }
        )
      },
      getForAccount: async (sessionName: string, accountName: string): Promise<Record<string, string>> => {
        const data = await storage.read<Record<string, Record<string, Record<string, string>>>>(
          "preference/profile-names"
        )
        return data?.[sessionName]?.[accountName] ?? {}
      },
      remove: async (sessionName: string, accountName: string, roleName: string): Promise<void> => {
        await storage.update<Record<string, Record<string, Record<string, string>>>>(
          "preference/profile-names",
          (draft) => {
            if (draft[sessionName]?.[accountName]?.[roleName]) {
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
        return data?.[sessionName]?.[accountId]
      },
      save: async (sessionName: string, accountId: string, roleName: string): Promise<void> => {
        await storage.update<Record<string, Record<string, string>>>("preference/preferred-roles", (draft) => {
          if (!draft[sessionName]) draft[sessionName] = {}
          draft[sessionName][accountId] = roleName
          return draft
        })
      },
      getAll: async (sessionName: string): Promise<Record<string, string>> => {
        const data = await storage.read<Record<string, Record<string, string>>>("preference/preferred-roles")
        return data?.[sessionName] ?? {}
      },
    },

    preferredRegions: {
      get: async (sessionName: string, accountId: string): Promise<string | undefined> => {
        const data = await storage.read<Record<string, Record<string, string>>>("preference/preferred-regions")
        return data?.[sessionName]?.[accountId]
      },
      save: async (sessionName: string, accountId: string, region: string): Promise<void> => {
        await storage.update<Record<string, Record<string, string>>>("preference/preferred-regions", (draft) => {
          if (!draft[sessionName]) draft[sessionName] = {}
          draft[sessionName][accountId] = region
          return draft
        })
      },
      getAll: async (sessionName: string): Promise<Record<string, string>> => {
        const data = await storage.read<Record<string, Record<string, string>>>("preference/preferred-regions")
        return data?.[sessionName] ?? {}
      },
    },

    /** @internal Low-level primitive. Prefer `setCredential()` for most use cases. */
    credentials: {
      write: async (profileName: string, creds: RoleCredentials, region?: string) => {
        await Credentials.write({
          awsDir,
          profileName,
          credentials: creds,
          region,
        })
      },
      removeProfile: async (profileName: string) => {
        await Credentials.removeProfile({
          awsDir,
          profileName,
        })
      },
      listProfiles: async () => {
        return Credentials.listProfiles(awsDir)
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
            .then(data => data?.[sessionName]?.[accountName]?.[roleName])
        : undefined

      const profileName = customProfileName || configuredProfile || "default"
      const isDefault = !customProfileName && !configuredProfile

      // 1. Write to ~/.aws/credentials
      await Credentials.write({
        awsDir,
        profileName,
        credentials,
        region,
      })

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
        await Credentials.removeProfile({ awsDir, profileName: removeProfile })
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
          await Credentials.removeProfile({ awsDir, profileName: cred.profileName })
        }
      }

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
          await Credentials.removeProfile({ awsDir, profileName: cred.profileName })
        }
      }

      // 2. Clear active credentials tracking
      await storage.write<ActiveCredential[]>("credentials/active", [])

      // 3. Clear lastSetCredential
      await storage.remove("credentials/last-set")
    },
  }
}

export type Awsesh = ReturnType<typeof createAwsesh>
