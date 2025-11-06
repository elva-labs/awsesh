import { createSignal } from "solid-js";
import { createSimpleContext } from "./helper";
import { useInstance } from "@/instance/instance";
import type { SSOProfile, Account, SSOLoginInfo } from "@/types";

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
    const [error, setError] = createSignal<string | undefined>();

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
      get error() {
        return error();
      },

      /**
       * Load accounts for a profile
       */
      async loadAccounts(profile: SSOProfile): Promise<void> {
        setLoading(true);
        setError(undefined);

        try {
          // Try to get cached accounts first
          const cached = await config.loadAccounts(profile.name);
          if (cached) {
            setAccounts(cached.accounts);
            setLoading(false);
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
        } catch (e) {
          setError(`Failed to load accounts: ${e}`);
        } finally {
          setLoading(false);
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
          return roles;
        } catch (e) {
          setError(`Failed to load roles: ${e}`);
          return [];
        } finally {
          setLoading(false);
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
       */
      async getRoleCredentials(
        profile: SSOProfile,
        accountId: string,
        accountName: string,
        roleName: string
      ): Promise<void> {
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

          // Write credentials to file
          await config.writeCredentials(
            `${accountName}-${roleName}`,
            credentials.accessKeyId,
            credentials.secretAccessKey,
            credentials.sessionToken,
            profile.defaultRegion
          );

          // Save last selected
          await config.saveLastSelected({
            profile: profile.name,
            account: accountName,
            role: roleName,
          });
        } catch (e) {
          setError(`Failed to get credentials: ${e}`);
          throw e;
        } finally {
          setLoading(false);
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
