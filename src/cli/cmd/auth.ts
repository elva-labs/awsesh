import { cmd } from "./cmd.js";
import { UI } from "../ui.js";
import { withInstance } from "../../instance/instance.js";
import { openBrowser } from "../../util/browser.js";
import type { SSOProfile } from "../../types/index.js";

interface AuthArgs {
  profile?: string;
  list?: boolean;
  delete?: string;
}

export const auth = cmd({
  command: "auth [profile]",
  describe: "Authenticate with AWS SSO",
  builder: (yargs) =>
    yargs
      .positional("profile", {
        type: "string",
        describe: "SSO profile name to authenticate with",
      })
      .option("list", {
        type: "boolean",
        alias: "l",
        describe: "List available profiles",
        default: false,
      })
      .option("delete", {
        type: "string",
        alias: "d",
        describe: "Delete a profile by name",
      }),
  handler: async (args) => {
    const typedArgs = args as AuthArgs;
    
    await withInstance(async (instance) => {
      const { config, aws } = instance;

      // Handle --list flag
      if (typedArgs.list) {
        const profiles = await config.loadProfiles();
        if (profiles.length === 0) {
          UI.info("No SSO profiles configured.");
          UI.info("Run 'awsesh auth' to create a new profile.");
          return;
        }

        UI.info(`Found ${profiles.length} profile(s):\n`);
        for (const profile of profiles) {
          console.log(`  • ${profile.name}`);
          console.log(`    Start URL: ${profile.startUrl}`);
          console.log(`    SSO Region: ${profile.ssoRegion}`);
          console.log(`    Default Region: ${profile.defaultRegion}`);
          console.log();
        }
        return;
      }

      // Handle --delete flag
      if (typedArgs.delete) {
        const profile = await config.loadProfile(typedArgs.delete);
        if (!profile) {
          UI.error(`Profile '${typedArgs.delete}' does not exist.`);
          process.exit(1);
        }

        await config.deleteProfile(typedArgs.delete);
        UI.success(`Profile '${typedArgs.delete}' deleted successfully.`);
        return;
      }

      // Get profile (from args or prompt)
      let profile: SSOProfile | null = null;

      if (typedArgs.profile) {
        // Use specified profile
        profile = await config.loadProfile(typedArgs.profile);
        if (!profile) {
          UI.error(`Profile '${typedArgs.profile}' not found.`);
          UI.info("Run 'awsesh auth --list' to see available profiles.");
          process.exit(1);
        }
      } else {
        // For now, just show an error. In the future, we'll launch TUI to select/create profile.
        UI.error("No profile specified.");
        UI.info("Usage: awsesh auth <profile>");
        UI.info("   or: awsesh auth --list");
        UI.info("\nTo create a new profile, run 'awsesh' and follow the prompts.");
        process.exit(1);
      }

      // Create AWS client with the profile's SSO region
      const awsClient = new aws(profile.ssoRegion);

      // Start device code flow
      UI.info(`Authenticating with profile '${profile.name}'...`);
      UI.info(`Start URL: ${profile.startUrl}`);
      UI.info(`SSO Region: ${profile.ssoRegion}\n`);

      const loginInfo = await awsClient.startSSOLogin(profile.startUrl);

      // Show device code and URL
      UI.info("Please visit the following URL and enter the code:\n");
      console.log(`  URL:  ${loginInfo.verificationUriComplete}`);
      console.log(`  Code: ${loginInfo.userCode}\n`);

      // Open browser
      await openBrowser(loginInfo.verificationUriComplete);
      UI.info("Opening browser...\n");

      // Poll for token
      UI.info("Waiting for authorization...");
      
      let token: string | null = null;
      while (!token) {
        await new Promise((resolve) => setTimeout(resolve, loginInfo.interval * 1000));
        token = await awsClient.pollForToken(loginInfo);
      }

      // Cache token
      await config.saveToken(profile.startUrl, token, loginInfo.expiresAt);

      UI.success("Authentication successful!");
      UI.info(
        `Token cached and will expire at ${loginInfo.expiresAt.toLocaleString()}`
      );
    });
  },
});
