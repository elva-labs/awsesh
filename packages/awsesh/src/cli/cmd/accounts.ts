import * as prompts from "@clack/prompts"
import { cmd } from "./cmd"
import { getAwsesh } from "@/instance"
import { authenticate } from "./util/auth"

export const accounts = cmd({
  command: "accounts [session]",
  describe: "List accounts for an SSO session",
  builder: (yargs) =>
    yargs
      .positional("session", {
        type: "string",
        describe: "SSO session name",
      })
      .option("json", {
        type: "boolean",
        alias: "j",
        describe: "Output as JSON",
        default: false,
      }),
  handler: async (args) => {
    const { session: sessionName, json } = args as { session?: string; json: boolean }
    const awsesh = getAwsesh()

    let selectedSession = sessionName

    if (!selectedSession) {
      const sessionList = await awsesh.sessions.list()
      if (sessionList.length === 0) {
        console.error("No SSO sessions configured.")
        console.error("Run 'awsesh' to create a new session.")
        process.exit(1)
      }

      if (sessionList.length === 1) {
        selectedSession = sessionList[0].name
      } else {
        console.log()
        const result = await prompts.select({
          message: "Select SSO session",
          options: sessionList.map((s) => ({
            label: s.name,
            value: s.name,
            hint: s.startUrl,
          })),
        })

        if (prompts.isCancel(result)) {
          process.exit(0)
        }
        selectedSession = result
      }
    }

    const session = await awsesh.sessions.get(selectedSession)
    if (!session) {
      console.error(`SSO session '${selectedSession}' not found.`)
      console.error("Run 'awsesh sessions' to see available sessions.")
      process.exit(1)
    }

    const token = await authenticate(awsesh, session)
    const accountList = await awsesh.sso.listAccounts(session, token.token)

    if (accountList.length === 0) {
      if (json) {
        console.log(JSON.stringify([]))
      } else {
        console.log("No accounts found for this session.")
      }
      return
    }

    if (json) {
      console.log(JSON.stringify(accountList, null, 2))
      return
    }

    console.log()
    console.log(`\x1b[90mAccounts for\x1b[0m ${session.name}:\n`)
    for (const account of accountList) {
      console.log(`  ${account.name}`)
      console.log(`    \x1b[90mAccount ID:\x1b[0m ${account.accountId}`)
      console.log()
    }
  },
})
