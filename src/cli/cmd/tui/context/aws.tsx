import { createSignal } from "solid-js";
import { createSimpleContext } from "./helper";
import { useInstance } from "@/instance/instance";
import { Global } from "@/global";
import { Log } from "@/util/log";
import type { SSOSession, Account, SSOLoginInfo } from "@/types";

const log = Log.create({ service: "aws-context" });

/**
 * AWS context provider for TUI
 * Manages AWS client, sessions, accounts, and authentication state
 */
export const { use: useAWS, provider: AWSProvider } = createSimpleContext({
  name: "AWS",
  init: () => {
    const instance = useInstance();
    const { config, aws } = instance;

    // State signals
    const [sessions, setSessions] = createSignal<SSOSession[]>([]);
    const [accounts, setAccounts] = createSignal<Account[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [refreshing, setRefreshing] = createSignal(false);
    const [refreshingRoles, setRefreshingRoles] = createSignal(false);
    const [error, setError] = createSignal<string | undefined>();
    const [currentSession, setCurrentSession] = createSignal<SSOSession | undefined>();
    const [tokenStatus, setTokenStatus] = createSignal<Record<string, boolean>>({});

    // Load sessions on init and check token status
    (async () => {
      try {
        const loadedSessions = await config.loadSessions();
        setSessions(loadedSessions);
        
        const status: Record<string, boolean> = {};
        for (const session of loadedSessions) {
          const token = await config.loadToken(session.startUrl);
          status[session.startUrl] = token !== null;
        }
        setTokenStatus(status);
      } catch (e) {
        setError(`Failed to load sessions: ${e}`);
      }
    })();

    return {
      get sessions() {
        return sessions();
      },
      get accounts() {
        return accounts();
      },
      get loading() {
        return loading();
      },
      get refreshing() {
        return refreshing();
      },
      get refreshingRoles() {
        return refreshingRoles();
      },
      get error() {
        return error();
      },
      
      isSessionActive(startUrl: string): boolean {
        return tokenStatus()[startUrl] ?? false;
      },

      /**
       * Load accounts for a session
       */
      async loadAccounts(session: SSOSession): Promise<void> {
        setLoading(true);
        setError(undefined);
        setCurrentSession(session);

        try {
          // Try to get cached accounts first
          const cached = await config.loadAccounts(session.name);
          if (cached) {
            setAccounts(cached.accounts);
            setLoading(false);
            
            // Pre-load roles if under threshold and not stale
            if (!cached.isStale && cached.accounts.length <= Global.Limits.maxAccountsForRoleLoading) {
              this.preloadRoles(session, cached.accounts);
            }
            
            return;
          }

          // Need to authenticate first
          const token = await config.loadToken(session.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          // Create AWS client and list accounts
          const awsClient = new aws(session.ssoRegion);
          const accountsList = await awsClient.listAccounts(token.token);

          // Cache accounts
          await config.saveAccounts(session.name, accountsList);
          setAccounts(accountsList);
          
          // Pre-load roles if under threshold
          if (accountsList.length <= Global.Limits.maxAccountsForRoleLoading) {
            this.preloadRoles(session, accountsList);
          }
        } catch (e) {
          setError(`Failed to load accounts: ${e}`);
        } finally {
          setLoading(false);
        }
      },

      /**
       * Refresh accounts for the current session
       */
      async refreshAccounts(): Promise<void> {
        const session = currentSession();
        if (!session) return;

        setRefreshing(true);
        setError(undefined);

        try {
          const token = await config.loadToken(session.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          const awsClient = new aws(session.ssoRegion);
          const accountsList = await awsClient.listAccounts(token.token);

          setAccounts(accountsList);
          await config.saveAccounts(session.name, accountsList);
          
          // Pre-load roles if under threshold
          if (accountsList.length <= Global.Limits.maxAccountsForRoleLoading) {
            this.preloadRoles(session, accountsList);
          }
        } catch (e) {
          setError(`Failed to refresh accounts: ${e}`);
        } finally {
          setRefreshing(false);
        }
      },

      /**
       * Pre-load roles for accounts sequentially
       */
      async preloadRoles(session: SSOSession, accountsList: Account[]): Promise<void> {
        const token = await config.loadToken(session.startUrl);
        if (!token) return;

        const awsClient = new aws(session.ssoRegion);

        for (const account of accountsList) {
          if (account.rolesLoaded) continue;

          try {
            const roles = await awsClient.listAccountRoles(token.token, account.accountId);
            
            // Update account with roles
            setAccounts((current) =>
              current.map((a) =>
                a.accountId === account.accountId
                  ? { ...a, roles, rolesLoaded: true }
                  : a
              )
            );

            // Update cache
            await config.saveAccounts(session.name, accounts());
          } catch (e) {
            log.error("Failed to pre-load roles", { error: e, accountName: account.name, accountId: account.accountId });
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      },

      /**
       * Load roles for an account
       */
      async loadRoles(
        session: SSOSession,
        accountId: string
      ): Promise<string[]> {
        setLoading(true);
        setError(undefined);

        try {
          const token = await config.loadToken(session.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          const awsClient = new aws(session.ssoRegion);
          const roles = await awsClient.listAccountRoles(token.token, accountId);
          
          // Update account with roles in state
          setAccounts((current) =>
            current.map((a) =>
              a.accountId === accountId
                ? { ...a, roles, rolesLoaded: true }
                : a
            )
          );

          // Update cache
          await config.saveAccounts(session.name, accounts());
          
          return roles;
        } catch (e) {
          setError(`Failed to load roles: ${e}`);
          return [];
        } finally {
          setLoading(false);
        }
      },

      /**
       * Refresh roles for a specific account
       */
      async refreshRoles(session: SSOSession, accountId: string): Promise<void> {
        setRefreshingRoles(true);
        setError(undefined);

        try {
          const token = await config.loadToken(session.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          const awsClient = new aws(session.ssoRegion);
          const roles = await awsClient.listAccountRoles(token.token, accountId);

          // Update account with roles
          setAccounts((current) =>
            current.map((a) =>
              a.accountId === accountId
                ? { ...a, roles, rolesLoaded: true }
                : a
            )
          );

          // Update cache
          await config.saveAccounts(session.name, accounts());
        } catch (e) {
          setError(`Failed to refresh roles: ${e}`);
        } finally {
          setRefreshingRoles(false);
        }
      },

      /**
       * Start SSO login flow
       */
      async startLogin(session: SSOSession): Promise<SSOLoginInfo> {
        setLoading(true);
        setError(undefined);

        try {
          const awsClient = new aws(session.ssoRegion);
          const loginInfo = await awsClient.startSSOLogin(session.startUrl);
          return loginInfo;
        } catch (e) {
          setError(`Failed to start login: ${e}`);
          throw e;
        } finally {
          setLoading(false);
        }
      },

      /**
       * Poll for token during SSO login
       */
      async pollForToken(
        session: SSOSession,
        loginInfo: SSOLoginInfo
      ): Promise<string> {
        const awsClient = new aws(session.ssoRegion);

        let token: string | null = null;
        while (!token) {
          await new Promise((resolve) =>
            setTimeout(resolve, loginInfo.interval * 1000)
          );
          token = await awsClient.pollForToken(loginInfo);
        }

        // Cache the token
        await config.saveToken(
          session.startUrl,
          token,
          loginInfo.expiresAt
        );

        // Update token status
        setTokenStatus((prev) => ({ ...prev, [session.startUrl]: true }));

        return token;
      },

      /**
       * Get role credentials and write to ~/.aws/credentials
       * Returns the expiration date of the credentials
       * 
       * @param session - SSO session
       * @param accountId - AWS account ID
       * @param accountName - AWS account name (used for default profile name)
       * @param roleName - IAM role name
       * @param region - Optional custom region
       * @param customProfileName - Optional custom CLI profile name (overrides default)
       */
      async getRoleCredentials(
        session: SSOSession,
        accountId: string,
        accountName: string,
        roleName: string,
        region?: string,
        customProfileName?: string
      ): Promise<Date> {
        setLoading(true);
        setError(undefined);

        try {
          const token = await config.loadToken(session.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          const awsClient = new aws(session.ssoRegion);
          const credentials = await awsClient.getRoleCredentials(
            token.token,
            accountId,
            roleName
          );

          // Use custom region if provided, otherwise fall back to session default
          const targetRegion = region || session.defaultRegion;

          // Check if there's a remembered CLI profile name
          let profileNameToUse = customProfileName;
          if (!profileNameToUse) {
            const remembered = await config.loadProfileName(
              session.name,
              accountName,
              roleName
            );
            profileNameToUse = remembered || `${accountName}-${roleName}`;
          }

          // Write credentials to file
          await config.writeCredentials(
            profileNameToUse,
            credentials.accessKeyId,
            credentials.secretAccessKey,
            credentials.sessionToken,
            targetRegion
          );

          // Save last selected
          await config.saveLastSelected({
            session: session.name,
            account: accountName,
            role: roleName,
          });

          return credentials.expiration;
        } catch (e) {
          setError(`Failed to get credentials: ${e}`);
          throw e;
        } finally {
          setLoading(false);
        }
      },

      /**
       * Reload sessions from config
       */
      async reloadSessions(): Promise<void> {
        try {
          const loadedSessions = await config.loadSessions();
          setSessions(loadedSessions);
        } catch (e) {
          setError(`Failed to load sessions: ${e}`);
        }
      },

      /**
       * Create a new session
       */
      async createSession(session: SSOSession): Promise<void> {
        await config.saveSession(session);
        setSessions([...sessions(), session]);
      },

      /**
       * Update an existing session
       */
      async updateSession(session: SSOSession): Promise<void> {
        await config.saveSession(session);
        setSessions(sessions().map((s) => (s.name === session.name ? session : s)));
      },

      /**
       * Delete a session
       */
      async deleteSession(name: string): Promise<void> {
        await config.deleteSession(name);
        setSessions(sessions().filter((s) => s.name !== name));
      },
    };
  },
});

export type AWSContext = ReturnType<typeof useAWS>;
