import { cmd } from "./cmd"
import { UI } from "../ui"
import { getAwsesh } from "@/instance"
import { printSessionInfo } from "@/util/styled-output"

export const whoami = cmd({
  command: "whoami",
  describe: "Show current AWS identity",
  builder: (yargs) =>
    yargs.option("json", {
      type: "boolean",
      alias: "j",
      describe: "Output as JSON",
      default: false,
    }),
  handler: async (args) => {
    const { json } = args as { json: boolean }
    const awsesh = getAwsesh()
    const lastSet = await awsesh.lastSetCredential.get()

    if (!lastSet) {
      if (json) {
        UI.println(JSON.stringify(null))
      } else {
        UI.info("No AWS credentials currently configured.")
        UI.info("Run 'awsesh' to configure your AWS credentials.")
      }
      return
    }

    const session = await awsesh.sessions.get(lastSet.sessionName)
    const region = lastSet.region ?? session?.defaultRegion ?? "unknown"

    if (json) {
      UI.println(
        JSON.stringify(
          {
            sessionName: lastSet.sessionName,
            accountName: lastSet.accountName,
            accountId: lastSet.accountId,
            roleName: lastSet.roleName,
            region,
            profileName: lastSet.profileName,
          },
          null,
          2
        )
      )
      return
    }

    printSessionInfo({
      sessionName: lastSet.sessionName,
      accountName: lastSet.accountName,
      accountId: lastSet.accountId,
      roleName: lastSet.roleName,
      region,
      profileName: lastSet.profileName,
    })
  },
})
