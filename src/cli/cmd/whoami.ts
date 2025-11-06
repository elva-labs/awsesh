import { cmd } from "./cmd.js";
import { UI } from "../ui.js";
import { withInstance } from "../../instance/instance.js";

export const whoami = cmd({
  command: "whoami",
  describe: "Show current AWS identity",
  builder: (yargs) => yargs,
  handler: async () => {
    await withInstance(async (instance) => {
      const { config } = instance;

      // Get last selected preferences
      const lastSelected = await config.loadLastSelected();

      if (!lastSelected.profile || !lastSelected.account || !lastSelected.role) {
        UI.info("No AWS credentials currently configured.");
        UI.info("Run 'awsesh' to configure your AWS credentials.");
        return;
      }

      // Display current identity
      UI.info("Current AWS Identity:\n");
      console.log(`  Profile:     ${lastSelected.profile}`);
      console.log(`  Account:     ${lastSelected.account}`);
      console.log(`  Role:        ${lastSelected.role}`);

      // Check if credentials file exists and show the profile name
      const profileName = `${lastSelected.account}-${lastSelected.role}`;
      console.log(`\n  AWS Profile: ${profileName}`);
      console.log(
        `  Credentials: ~/.aws/credentials (section [${profileName}])`
      );
    });
  },
});
