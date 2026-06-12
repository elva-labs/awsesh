import { createSignal } from "solid-js"
import { createSimpleContext } from "./helper"
import { useAwsesh } from "./awsesh"
import { Global } from "@/global"
import { Log } from "@/util/log"
import type { SSOSession, Account, SSOLoginInfo, ActiveCredential, TokenResult } from "@awsesh/core"
import { markCredentialsSet, captureEvalEnvironment } from "./session-state"

const log = Log.create({ service: "aws-context" })

export const { use: useAWS, provider: AWSProvider } = createSimpleContext({
  name: "AWS",
  init: () => {
    const awsesh = useAwsesh()

    const [sessions, setSessions] = createSignal<SSOSession[]>([])
    const [accounts, setAccounts] = createSignal<Account[]>([])
    const [loading, setLoading] = createSignal(false)
    const [refreshing, setRefreshing] = createSignal(false)
    const [refreshingRoles, setRefreshingRoles] = createSignal(false)
    const [error, setError] = createSignal<string | undefined>()
    const [currentSession, setCurrentSession] = createSignal<SSOSession | undefined>()
    const [tokenStatus, setTokenStatus] = createSignal<Record<string, boolean>>({})
    const [activeCredentials, setActiveCredentials] = createSignal<ActiveCredential[]>([])

    ;(async () => {
      try {
        const loadedSessions = await awsesh.sessions.list()
        setSessions(loadedSessions)
        
        const status: Record<string, boolean> = {}
        for (const session of loadedSessions) {
          const token = await awsesh.tokens.get(session.startUrl)
          status[session.startUrl] = token !== undefined && awsesh.tokens.isValid(token)
        }
        setTokenStatus(status)

        const creds = await awsesh.activeCredentials.list()
        setActiveCredentials(creds)
      } catch (e) {
        setError(`Failed to load sessions: ${e}`)
      }
    })()

    return {
      get sessions() {
        return sessions()
      },
      get accounts() {
        return accounts()
      },
      get loading() {
        return loading()
      },
      get refreshing() {
        return refreshing()
      },
      get refreshingRoles() {
        return refreshingRoles()
      },
      get error() {
        return error()
      },
      
      isSessionActive(startUrl: string): boolean {
        return tokenStatus()[startUrl] ?? false
      },

      getCredentialStatus(accountId: string): "default" | "active" | "inactive" {
        const creds = activeCredentials()
        const now = new Date()
        const accountCreds = creds.filter(
          (c) => c.accountId === accountId && new Date(c.expiration) > now
        )
        if (accountCreds.length === 0) return "inactive"
        if (accountCreds.some((c) => c.isDefault)) return "default"
        return "active"
      },

      async loadAccounts(session: SSOSession): Promise<void> {
        setLoading(true)
        setError(undefined)
        setCurrentSession(session)

        try {
          const cached = await awsesh.accounts.get(session.name)
          if (cached) {
            setAccounts(cached.accounts)
            setLoading(false)
            
            const isStale = Date.now() - cached.lastUpdated > 24 * 60 * 60 * 1000
            if (!isStale && cached.accounts.length <= Global.Limits.maxAccountsForRoleLoading) {
              this.preloadRoles(session, cached.accounts)
            }
            
            return
          }

          const token = await awsesh.tokens.get(session.startUrl)
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.")
          }

          const accountsList = await awsesh.sso.listAccounts(session, token.token)

          await awsesh.accounts.save(session.name, { accounts: accountsList, lastUpdated: Date.now() })
          setAccounts(accountsList)
          
          if (accountsList.length <= Global.Limits.maxAccountsForRoleLoading) {
            this.preloadRoles(session, accountsList)
          }
        } catch (e) {
          setError(`Failed to load accounts: ${e}`)
        } finally {
          setLoading(false)
        }
      },

      async refreshSessions(): Promise<void> {
        try {
          const loadedSessions = await awsesh.sessions.list()
          setSessions(loadedSessions)

          const status: Record<string, boolean> = {}
          for (const session of loadedSessions) {
            const token = await awsesh.tokens.get(session.startUrl)
            status[session.startUrl] = token !== undefined && awsesh.tokens.isValid(token)
          }
          setTokenStatus(status)
        } catch (e) {
          setError(`Failed to refresh sessions: ${e}`)
        }
      },

      async refreshAccounts(): Promise<void> {
        const session = currentSession()
        if (!session) return

        setRefreshing(true)
        setError(undefined)

        try {
          const token = await awsesh.tokens.get(session.startUrl)
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.")
          }

          const accountsList = await awsesh.sso.listAccounts(session, token.token)

          setAccounts(accountsList)
          await awsesh.accounts.save(session.name, { accounts: accountsList, lastUpdated: Date.now() })
          
          if (accountsList.length <= Global.Limits.maxAccountsForRoleLoading) {
            this.preloadRoles(session, accountsList)
          }
        } catch (e) {
          setError(`Failed to refresh accounts: ${e}`)
        } finally {
          setRefreshing(false)
        }
      },

      async preloadRoles(session: SSOSession, accountsList: Account[]): Promise<void> {
        const token = await awsesh.tokens.get(session.startUrl)
        if (!token) return

        for (const account of accountsList) {
          if (account.rolesLoaded) continue

          try {
            const roles = await awsesh.sso.listRoles(session, token.token, account.accountId)
            
            setAccounts((current) =>
              current.map((a) =>
                a.accountId === account.accountId
                  ? { ...a, roles, rolesLoaded: true }
                  : a
              )
            )

            await awsesh.accounts.save(session.name, { accounts: accounts(), lastUpdated: Date.now() })
          } catch (e) {
            log.error("Failed to pre-load roles", { error: e, accountName: account.name, accountId: account.accountId })
          }

          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      },

      async loadRoles(session: SSOSession, accountId: string): Promise<string[]> {
        setLoading(true)
        setError(undefined)

        try {
          const token = await awsesh.tokens.get(session.startUrl)
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.")
          }

          const roles = await awsesh.sso.listRoles(session, token.token, accountId)
          
          setAccounts((current) =>
            current.map((a) =>
              a.accountId === accountId
                ? { ...a, roles, rolesLoaded: true }
                : a
            )
          )

          await awsesh.accounts.save(session.name, { accounts: accounts(), lastUpdated: Date.now() })
          
          return roles
        } catch (e) {
          setError(`Failed to load roles: ${e}`)
          return []
        } finally {
          setLoading(false)
        }
      },

      async refreshRoles(session: SSOSession, accountId: string): Promise<void> {
        setRefreshingRoles(true)
        setError(undefined)

        try {
          const token = await awsesh.tokens.get(session.startUrl)
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.")
          }

          const roles = await awsesh.sso.listRoles(session, token.token, accountId)

          setAccounts((current) =>
            current.map((a) =>
              a.accountId === accountId
                ? { ...a, roles, rolesLoaded: true }
                : a
            )
          )

          await awsesh.accounts.save(session.name, { accounts: accounts(), lastUpdated: Date.now() })
        } catch (e) {
          setError(`Failed to refresh roles: ${e}`)
        } finally {
          setRefreshingRoles(false)
        }
      },

      async startLogin(session: SSOSession): Promise<SSOLoginInfo> {
        setLoading(true)
        setError(undefined)

        try {
          const loginInfo = await awsesh.sso.startLogin(session)
          return loginInfo
        } catch (e) {
          setError(`Failed to start login: ${e}`)
          throw e
        } finally {
          setLoading(false)
        }
      },

      async pollForToken(session: SSOSession, loginInfo: SSOLoginInfo): Promise<string> {
        let tokenResult: TokenResult | null = null
        while (!tokenResult) {
          await new Promise((resolve) =>
            setTimeout(resolve, loginInfo.interval * 1000)
          )
          try {
            tokenResult = await awsesh.sso.pollForToken(session, loginInfo)
          } catch (e) {
            log.error("Failed to poll for token", { error: e, sessionName: session.name })
            throw e
          }
        }

        await awsesh.tokens.save(session.startUrl, tokenResult.token, tokenResult.expiresAt)
        setTokenStatus((prev) => ({ ...prev, [session.startUrl]: true }))

        return tokenResult.token
      },

      async getRoleCredentials(
        session: SSOSession,
        accountId: string,
        accountName: string,
        roleName: string,
        region?: string,
        customProfileName?: string
      ): Promise<{ expiration: Date; profileName: string }> {
        setLoading(true)
        setError(undefined)

        try {
          const token = await awsesh.tokens.get(session.startUrl)
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.")
          }

          const credentials = await awsesh.sso.getCredentials(session, token.token, accountId, roleName)

          const targetRegion = region || session.defaultRegion

          const result = await awsesh.setCredential({
            credentials,
            sessionName: session.name,
            accountId,
            accountName,
            roleName,
            region: targetRegion,
            profileName: customProfileName, // core looks up configured profile if undefined
          })

          setActiveCredentials(await awsesh.activeCredentials.list())
          markCredentialsSet()
          if (result.profileName === "default") {
            captureEvalEnvironment({
              accountId,
              accountName,
              roleName,
              sessionName: session.name,
              region: targetRegion,
              accessKeyId: credentials.accessKeyId,
              secretAccessKey: credentials.secretAccessKey,
              sessionToken: credentials.sessionToken,
              expiration: credentials.expiration.toISOString(),
            })
          }

          return { expiration: result.expiration, profileName: result.profileName }
        } catch (e) {
          setError(`Failed to get credentials: ${e}`)
          throw e
        } finally {
          setLoading(false)
        }
      },

      async reloadSessions(): Promise<void> {
        try {
          const loadedSessions = await awsesh.sessions.list()
          setSessions(loadedSessions)
        } catch (e) {
          setError(`Failed to load sessions: ${e}`)
        }
      },

      async createSession(session: SSOSession): Promise<void> {
        await awsesh.sessions.save(session)
        setSessions([...sessions(), session])
      },

      async updateSession(session: SSOSession): Promise<void> {
        await awsesh.sessions.save(session)
        setSessions(sessions().map((s) => (s.name === session.name ? session : s)))
      },

      async deleteSession(name: string): Promise<void> {
        await awsesh.sessions.remove(name)
        setSessions(sessions().filter((s) => s.name !== name))
      },

      async removeCredentials(accountId: string, roleName: string): Promise<void> {
        await awsesh.activeCredentials.remove(accountId, roleName)
        setActiveCredentials(await awsesh.activeCredentials.list())
      },

      get activeCredentials() {
        return activeCredentials()
      },

      async getTokenExpiration(startUrl: string): Promise<Date | undefined> {
        const token = await awsesh.tokens.getWithExpired(startUrl)
        return token?.expiresAt
      },

      async killSSOSession(sessionName: string, startUrl: string): Promise<void> {
        await awsesh.tokens.remove(startUrl)
        await awsesh.clearSessionCredentials(sessionName, true)

        setTokenStatus((prev) => ({ ...prev, [startUrl]: false }))
        setActiveCredentials(await awsesh.activeCredentials.list())
      },

      async killCredential(profileName: string, accountId: string, roleName: string): Promise<void> {
        await awsesh.clearCredential(accountId, roleName, profileName)
        setActiveCredentials(await awsesh.activeCredentials.list())
      },

      async killAllSessions(): Promise<void> {
        for (const session of sessions()) {
          await awsesh.tokens.remove(session.startUrl)
        }

        await awsesh.clearAllCredentials(true)

        const status: Record<string, boolean> = {}
        for (const session of sessions()) {
          status[session.startUrl] = false
        }
        setTokenStatus(status)
        setActiveCredentials([])
      },

      async refreshActiveCredentials(): Promise<void> {
        const creds = await awsesh.activeCredentials.list()
        setActiveCredentials(creds)
      },
    }
  },
})

export type AWSContext = ReturnType<typeof useAWS>
