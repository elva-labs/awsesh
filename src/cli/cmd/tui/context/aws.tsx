import { createSignal } from "solid-js";
import { createSimpleContext } from "./helper";
import { useInstance } from "@/instance/instance";
import { Global } from "@/global";
import { Log } from "@/util/log";
import type { SSOProfile, Account, SSOLoginInfo } from "@/types";

const log = Log.create({ service: "aws-context" });

/**
 * AWS context provider for TUI
 * Manages AWS client, profiles, accounts, and authentication state
 */
export const { use: useAWS, provider: AWSProvider } = createSimpleContext({
  name: "AWS",
  init: () => {
    const instance = useInstance();
    const { config, aws } = instance;

    // State signals
    const [profiles, setProfiles] = createSignal<SSOProfile[]>([]);
    const [accounts, setAccounts] = createSignal<Account[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [refreshing, setRefreshing] = createSignal(false);
    const [refreshingRoles, setRefreshingRoles] = createSignal(false);
    const [error, setError] = createSignal<string | undefined>();
    const [currentProfile, setCurrentProfile] = createSignal<SSOProfile | undefined>();

    // Load profiles on init
    (async () => {
      try {
        const loadedProfiles = await config.loadProfiles();
        setProfiles(loadedProfiles);
      } catch (e) {
        setError(`Failed to load profiles: ${e}`);
      }
    })();

    return {
      get profiles() {
        return profiles();
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

      /**
       * Load accounts for a profile
       */
      async loadAccounts(profile: SSOProfile): Promise<void> {
        setLoading(true);
        setError(undefined);
        setCurrentProfile(profile);

        try {
          // Try to get cached accounts first
          const cached = await config.loadAccounts(profile.name);
          if (cached) {
            setAccounts(cached.accounts);
            setLoading(false);
            
            // Pre-load roles if under threshold and not stale
            if (!cached.isStale && cached.accounts.length <= Global.Limits.maxAccountsForRoleLoading) {
              this.preloadRoles(profile, cached.accounts);
            }
            
            return;
          }

          // Need to authenticate first
          const token = await config.loadToken(profile.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          // Create AWS client and list accounts
          const awsClient = new aws(profile.ssoRegion);
          const accountsList = await awsClient.listAccounts(token.token);

          // Cache accounts
          await config.saveAccounts(profile.name, accountsList);
          setAccounts(accountsList);
          
          // Pre-load roles if under threshold
          if (accountsList.length <= Global.Limits.maxAccountsForRoleLoading) {
            this.preloadRoles(profile, accountsList);
          }
        } catch (e) {
          setError(`Failed to load accounts: ${e}`);
        } finally {
          setLoading(false);
        }
      },

      /**
       * Refresh accounts for the current profile
       */
      async refreshAccounts(): Promise<void> {
        const profile = currentProfile();
        if (!profile) return;

        setRefreshing(true);
        setError(undefined);

        try {
          const token = await config.loadToken(profile.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          const awsClient = new aws(profile.ssoRegion);
          const accountsList = await awsClient.listAccounts(token.token);

          setAccounts(accountsList);
          await config.saveAccounts(profile.name, accountsList);
          
          // Pre-load roles if under threshold
          if (accountsList.length <= Global.Limits.maxAccountsForRoleLoading) {
            this.preloadRoles(profile, accountsList);
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
      async preloadRoles(profile: SSOProfile, accountsList: Account[]): Promise<void> {
        const token = await config.loadToken(profile.startUrl);
        if (!token) return;

        const awsClient = new aws(profile.ssoRegion);

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
            await config.saveAccounts(profile.name, accounts());
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
        profile: SSOProfile,
        accountId: string
      ): Promise<string[]> {
        setLoading(true);
        setError(undefined);

        try {
          const token = await config.loadToken(profile.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          const awsClient = new aws(profile.ssoRegion);
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
          await config.saveAccounts(profile.name, accounts());
          
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
      async refreshRoles(profile: SSOProfile, accountId: string): Promise<void> {
        setRefreshingRoles(true);
        setError(undefined);

        try {
          const token = await config.loadToken(profile.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          const awsClient = new aws(profile.ssoRegion);
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
          await config.saveAccounts(profile.name, accounts());
        } catch (e) {
          setError(`Failed to refresh roles: ${e}`);
        } finally {
          setRefreshingRoles(false);
        }
      },

      /**
       * Start SSO login flow
       */
      async startLogin(profile: SSOProfile): Promise<SSOLoginInfo> {
        setLoading(true);
        setError(undefined);

        try {
          const awsClient = new aws(profile.ssoRegion);
          const loginInfo = await awsClient.startSSOLogin(profile.startUrl);
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
        profile: SSOProfile,
        loginInfo: SSOLoginInfo
      ): Promise<string> {
        const awsClient = new aws(profile.ssoRegion);

        let token: string | null = null;
        while (!token) {
          await new Promise((resolve) =>
            setTimeout(resolve, loginInfo.interval * 1000)
          );
          token = await awsClient.pollForToken(loginInfo);
        }

        // Cache the token
        await config.saveToken(
          profile.startUrl,
          token,
          loginInfo.expiresAt
        );

        return token;
      },

      /**
       * Get role credentials and write to ~/.aws/credentials
       * Returns the expiration date of the credentials
       * 
       * @param profile - SSO profile
       * @param accountId - AWS account ID
       * @param accountName - AWS account name (used for default profile name)
       * @param roleName - IAM role name
       * @param region - Optional custom region
       * @param customProfileName - Optional custom profile name (overrides default)
       */
      async getRoleCredentials(
        profile: SSOProfile,
        accountId: string,
        accountName: string,
        roleName: string,
        region?: string,
        customProfileName?: string
      ): Promise<Date> {
        setLoading(true);
        setError(undefined);

        try {
          const token = await config.loadToken(profile.startUrl);
          if (!token) {
            throw new Error("No valid token found. Please authenticate first.");
          }

          const awsClient = new aws(profile.ssoRegion);
          const credentials = await awsClient.getRoleCredentials(
            token.token,
            accountId,
            roleName
          );

          // Use custom region if provided, otherwise fall back to profile default
          const targetRegion = region || profile.defaultRegion;

          // Check if there's a remembered profile name
          let profileNameToUse = customProfileName;
          if (!profileNameToUse) {
            const remembered = await config.loadProfileName(
              profile.name,
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
            profile: profile.name,
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
       * Reload profiles from config
       */
      async reloadProfiles(): Promise<void> {
        try {
          const loadedProfiles = await config.loadProfiles();
          setProfiles(loadedProfiles);
        } catch (e) {
          setError(`Failed to load profiles: ${e}`);
        }
      },

      /**
       * Create a new profile
       */
      async createProfile(profile: SSOProfile): Promise<void> {
        await config.saveProfile(profile);
        setProfiles([...profiles(), profile]);
      },

      /**
       * Update an existing profile
       */
      async updateProfile(profile: SSOProfile): Promise<void> {
        await config.saveProfile(profile);
        setProfiles(profiles().map((p) => (p.name === profile.name ? profile : p)));
      },

      /**
       * Delete a profile
       */
      async deleteProfile(name: string): Promise<void> {
        await config.deleteProfile(name);
        setProfiles(profiles().filter((p) => p.name !== name));
      },
    };
  },
});

export type AWSContext = ReturnType<typeof useAWS>;
