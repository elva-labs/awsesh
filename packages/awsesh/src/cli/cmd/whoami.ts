import { cmd } from "./cmd"
import { UI } from "../ui"
import { getAwsesh } from "@/instance"

export const whoami = cmd({
  command: "whoami",
  describe: "Show current AWS identity",
  builder: (yargs) => yargs,
  handler: async () => {
    const awsesh = getAwsesh()
    const lastSelected = await awsesh.lastSelected.get()

    if (!lastSelected.session || !lastSelected.account || !lastSelected.role) {
      UI.info("No AWS credentials currently configured.")
      UI.info("Run 'awsesh' to configure your AWS credentials.")
      return
    }

    UI.info("Current AWS Identity:\n")
    console.log(`  SSO Session: ${lastSelected.session}`)
    console.log(`  Account:     ${lastSelected.account}`)
    console.log(`  Role:        ${lastSelected.role}`)

    const profileName = `${lastSelected.account}-${lastSelected.role}`
    console.log(`\n  AWS Profile: ${profileName}`)
    console.log(`  Credentials: ~/.aws/credentials (section [${profileName}])`)
  },
})
