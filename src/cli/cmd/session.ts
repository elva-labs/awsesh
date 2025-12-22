import { cmd } from "./cmd.js";
import { UI } from "../ui.js";
import { withInstance } from "@/instance/instance";

/**
 * Direct session setup command
 * Usage: awsesh <sso-session> <account-name> [role-name]
 */
export const session = cmd({
  command: "<ssoSession> <accountName> [roleName]",
  describe: "Directly set credentials for a specific account and role",
  builder: (yargs) =>
    yargs
      .positional("ssoSession", {
        type: "string",
        describe: "SSO session name",
        demandOption: true,
      })
      .positional("accountName", {
        type: "string",
        describe: "AWS account name",
        demandOption: true,
      })
      .positional("roleName", {
        type: "string",
        describe: "IAM role name (uses last selected if omitted)",
      })
      .option("browser", {
        alias: "b",
        type: "boolean",
        describe: "Open AWS console in browser instead of setting credentials",
        default: false,
      })
      .option("region", {
        alias: "r",
        type: "string",
        describe: "AWS region to use",
      })
      .option("eval", {
        alias: "e",
        type: "boolean",
        describe: "Output shell commands to set AWS environment variables",
        default: false,
      })
      .option("profile", {
        alias: "p",
        type: "string",
        describe: "Custom CLI profile name for credentials",
      }),
  handler: async (args) => {
    const { ssoSession, accountName, roleName, browser, region, eval: evalMode, profile: customProfile } = args as {
      ssoSession: string;
      accountName: string;
      roleName?: string;
      browser?: boolean;
      region?: string;
      eval?: boolean;
      profile?: string;
    };

    await withInstance(async (instance) => {
      const { config, aws } = instance;

      try {
        // 1. Load SSO session
        const session = await config.loadSession(ssoSession);
        if (!session) {
          UI.error(`SSO session '${ssoSession}' not found.`);
          UI.info("Run 'awsesh auth --list' to see available sessions.");
          process.exit(1);
        }

        // 2. Get token
        let token = await config.loadToken(session.startUrl);
        if (!token) {
          UI.error(`No valid token found for '${ssoSession}'.`);
          UI.info(`Run 'awsesh auth ${ssoSession}' to authenticate first.`);
          process.exit(1);
        }

        // 3. List accounts
        const awsClient = new aws(session.ssoRegion);
        const accounts = await awsClient.listAccounts(token.token);

        // 4. Find matching account
        const account = accounts.find(
          (acc) => acc.name.toLowerCase() === accountName.toLowerCase()
        );
        if (!account) {
          UI.error(`Account '${accountName}' not found.`);
          UI.info(`Available accounts: ${accounts.map((a) => a.name).join(", ")}`);
          process.exit(1);
        }

        // 5. Get role name (from arg or last selected)
        let selectedRole = roleName;
        if (!selectedRole) {
          const lastSelected = await config.loadLastSelected();
          if (
            lastSelected.session === ssoSession &&
            lastSelected.account === accountName &&
            lastSelected.role
          ) {
            selectedRole = lastSelected.role;
          }
        }

        if (!selectedRole) {
          UI.error("No role specified and no previously selected role found.");
          UI.info(`Usage: awsesh ${ssoSession} ${accountName} <role-name>`);
          process.exit(1);
        }

        // 6. Verify role exists
        const roles = await awsClient.listAccountRoles(token.token, account.accountId);
        if (!roles.includes(selectedRole)) {
          UI.error(`Role '${selectedRole}' not found for account '${accountName}'.`);
          UI.info(`Available roles: ${roles.join(", ")}`);
          process.exit(1);
        }

        // 7. Handle browser mode
        if (browser) {
          const url = awsClient.getAccountURL(
            account.accountId,
            token.token,
            session.startUrl,
            selectedRole
          );
          UI.info(`Opening AWS console in browser...`);
          const { openBrowser } = await import("@/util/browser.js");
          await openBrowser(url);
          UI.success("Browser opened successfully!");
          return;
        }

        // 8. Get credentials
        const credentials = await awsClient.getRoleCredentials(
          token.token,
          account.accountId,
          selectedRole
        );

        // 9. Determine CLI profile name
        const profileName = customProfile || `${account.name}-${selectedRole}`;
        const effectiveRegion = region || session.defaultRegion;

        // 10. Write credentials
        await config.writeCredentials(
          profileName,
          credentials.accessKeyId,
          credentials.secretAccessKey,
          credentials.sessionToken,
          effectiveRegion
        );

        // 11. Save last selected
        await config.saveLastSelected({
          session: ssoSession,
          account: accountName,
          role: selectedRole,
        });

        // 12. Handle eval mode
        if (evalMode) {
          // Output shell commands
          console.log(`export AWS_PROFILE='${profileName}'`);
          console.log(`export AWS_REGION='${effectiveRegion}'`);
          console.log(`export AWS_ACCESS_KEY_ID='${credentials.accessKeyId}'`);
          console.log(`export AWS_SECRET_ACCESS_KEY='${credentials.secretAccessKey}'`);
          console.log(`export AWS_SESSION_TOKEN='${credentials.sessionToken}'`);
          console.log(
            `export AWS_SESSION_EXPIRATION='${credentials.expiration.toISOString()}'`
          );
        } else {
          // Normal output
          UI.success("Credentials configured successfully!");
          UI.info(`CLI Profile: ${profileName}`);
          UI.info(`Region: ${effectiveRegion}`);
          UI.info(`Account: ${accountName} (${account.accountId})`);
          UI.info(`Role: ${selectedRole}`);
          console.log();
          UI.info("Usage:");
          console.log(`  export AWS_PROFILE=${profileName}`);
          console.log(`  aws sts get-caller-identity`);
        }
      } catch (error) {
        UI.error(`Failed to set credentials: ${error}`);
        process.exit(1);
      }
    });
  },
});
