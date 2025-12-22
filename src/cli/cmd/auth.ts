import { cmd } from "./cmd.js";
import { UI } from "../ui.js";
import { withInstance } from "../../instance/instance.js";
import { openBrowser } from "../../util/browser.js";
import { copyToClipboard } from "../../util/clipboard.js";
import type { SSOSession } from "../../types/index.js";

interface AuthArgs {
  session?: string;
  list?: boolean;
  delete?: string;
}

export const auth = cmd({
  command: "auth [session]",
  describe: "Authenticate with AWS SSO",
  builder: (yargs) =>
    yargs
      .positional("session", {
        type: "string",
        describe: "SSO session name to authenticate with",
      })
      .option("list", {
        type: "boolean",
        alias: "l",
        describe: "List available SSO sessions",
        default: false,
      })
      .option("delete", {
        type: "string",
        alias: "d",
        describe: "Delete an SSO session by name",
      }),
  handler: async (args) => {
    const typedArgs = args as AuthArgs;
    
    await withInstance(async (instance) => {
      const { config, aws } = instance;

      // Handle --list flag
      if (typedArgs.list) {
        const sessions = await config.loadSessions();
        if (sessions.length === 0) {
          UI.info("No SSO sessions configured.");
          UI.info("Run 'awsesh auth' to create a new session.");
          return;
        }

        UI.info(`Found ${sessions.length} SSO session(s):\n`);
        for (const session of sessions) {
          console.log(`  • ${session.name}`);
          console.log(`    Start URL: ${session.startUrl}`);
          console.log(`    SSO Region: ${session.ssoRegion}`);
          console.log(`    Default Region: ${session.defaultRegion}`);
          console.log();
        }
        return;
      }

      // Handle --delete flag
      if (typedArgs.delete) {
        const session = await config.loadSession(typedArgs.delete);
        if (!session) {
          UI.error(`SSO Session '${typedArgs.delete}' does not exist.`);
          process.exit(1);
        }

        await config.deleteSession(typedArgs.delete);
        UI.success(`SSO Session '${typedArgs.delete}' deleted successfully.`);
        return;
      }

      // Get session (from args or prompt)
      let session: SSOSession | null = null;

      if (typedArgs.session) {
        // Use specified session
        session = await config.loadSession(typedArgs.session);
        if (!session) {
          UI.error(`SSO Session '${typedArgs.session}' not found.`);
          UI.info("Run 'awsesh auth --list' to see available sessions.");
          process.exit(1);
        }
      } else {
        // For now, just show an error. In the future, we'll launch TUI to select/create session.
        UI.error("No SSO session specified.");
        UI.info("Usage: awsesh auth <session>");
        UI.info("   or: awsesh auth --list");
        UI.info("\nTo create a new session, run 'awsesh' and follow the prompts.");
        process.exit(1);
      }

      // Create AWS client with the session's SSO region
      const awsClient = new aws(session.ssoRegion);

      // Start device code flow
      UI.info(`Authenticating with session '${session.name}'...`);
      UI.info(`Start URL: ${session.startUrl}`);
      UI.info(`SSO Region: ${session.ssoRegion}\n`);

      const loginInfo = await awsClient.startSSOLogin(session.startUrl);

      // Show device code and URL
      UI.info("Please visit the following URL and enter the code:\n");
      console.log(`  URL:  ${loginInfo.verificationUriComplete}`);
      console.log(`  Code: ${loginInfo.userCode}\n`);

      // Try to copy verification code to clipboard
      const copied = await copyToClipboard(loginInfo.userCode);
      if (copied) {
        UI.info("✓ Verification code copied to clipboard!\n");
      }

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
      await config.saveToken(session.startUrl, token, loginInfo.expiresAt);

      UI.success("Authentication successful!");
      UI.info(
        `Token cached and will expire at ${loginInfo.expiresAt.toLocaleString()}`
      );
    });
  },
});
