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
      save: async (startUrl: string, token: string, expiresAt: Date): Promise<void> => {
        const hash = hashUrl(startUrl)
        await storage.write<TokenCacheStored>(`token/${hash}`, {
          token,
          expiresAt: expiresAt.toISOString(),
          startUrl,
        })
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
    },

    credentials: {
      write: async (profileName: string, creds: RoleCredentials, region?: string) => {
        await Credentials.write({
          awsDir,
          profileName,
          credentials: creds,
          region,
        })
      },
    },
  }
}

export type Awsesh = ReturnType<typeof createAwsesh>
