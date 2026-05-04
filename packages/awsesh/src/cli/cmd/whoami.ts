import { cmd } from "./cmd"
import { UI } from "../ui"
import { getAwsesh } from "@/instance"
import { printSessionInfo } from "@/util/styled-output"

export const whoami = cmd({
  command: "whoami",
  describe: "Show current AWS identity",
  builder: (yargs) => yargs,
  handler: async () => {
    const awsesh = getAwsesh()
    const lastSet = await awsesh.lastSetCredential.get()

    if (!lastSet) {
      UI.info("No AWS credentials currently configured.")
      UI.info("Run 'awsesh' to configure your AWS credentials.")
      return
    }

    const session = await awsesh.sessions.get(lastSet.sessionName)
    printSessionInfo({
      sessionName: lastSet.sessionName,
      accountName: lastSet.accountName,
      accountId: lastSet.accountId,
      roleName: lastSet.roleName,
      region: lastSet.region ?? session?.defaultRegion ?? "unknown",
      profileName: lastSet.profileName,
    })
  },
})
