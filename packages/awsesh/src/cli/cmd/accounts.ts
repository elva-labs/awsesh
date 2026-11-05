import * as prompts from "@clack/prompts"
import { cmd } from "./cmd"
import { UI } from "../ui"
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
      })
      .option("cached", {
        type: "boolean",
        describe: "List the accounts awsesh has cached, without logging in or calling AWS",
        default: false,
      }),
  handler: async (args) => {
    const { session: sessionName, json, cached } = args as { session?: string; json: boolean; cached: boolean }
    const awsesh = getAwsesh()

    if (cached && sessionName) {
      const accountList = (await awsesh.accounts.get(sessionName))?.accounts ?? []
      UI.println(json ? JSON.stringify(accountList) : accountList.map((a) => `${a.name}  ${a.accountId}`).join("\n"))
      return
    }

    let selectedSession = sessionName

    if (!selectedSession) {
      const sessionList = await awsesh.sessions.list()
      if (sessionList.length === 0) {
        UI.error("No SSO sessions configured.")
        UI.println("Run 'awsesh' to create a new session.")
        process.exit(1)
      }

      if (sessionList.length === 1) {
        selectedSession = sessionList[0].name
      } else {
        UI.println()
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
      UI.error(`SSO session '${selectedSession}' not found.`)
      UI.println("Run 'awsesh sessions' to see available sessions.")
      process.exit(1)
    }

    const token = await authenticate(awsesh, session)
    const accountList = await awsesh.sso.listAccounts(session, token.token)

    if (accountList.length === 0) {
      if (json) {
        UI.println(JSON.stringify([]))
      } else {
        UI.println("No accounts found for this session.")
      }
      return
    }

    if (json) {
      UI.println(JSON.stringify(accountList, null, 2))
      return
    }

    UI.section(`Accounts for ${session.name}`)
    for (const account of accountList) {
      UI.println(`  ${account.name}`)
      UI.println(UI.kv("Account ID", account.accountId, 4))
      UI.println()
    }
  },
})
