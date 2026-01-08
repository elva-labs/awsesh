import { cmd } from "./cmd"
import { UI } from "../ui"
import { getAwsesh } from "@/instance"

export const credentials = cmd({
  command: "credentials [session]",
  describe: "List active credentials",
  builder: (yargs) =>
    yargs
      .positional("session", {
        type: "string",
        describe: "Filter by SSO session name",
      })
      .option("json", {
        type: "boolean",
        alias: "j",
        describe: "Output as JSON",
        default: false,
      })
      .option("all", {
        type: "boolean",
        alias: "a",
        describe: "Include expired credentials",
        default: false,
      }),
  handler: async (args) => {
    const { session, json, all } = args as { session?: string; json: boolean; all: boolean }
    const awsesh = getAwsesh()

    let credentialsList = await awsesh.activeCredentials.list()

    if (!all) {
      const now = new Date()
      credentialsList = credentialsList.filter((c) => new Date(c.expiration) > now)
    }

    if (session) {
      credentialsList = credentialsList.filter(
        (c) => c.sessionName.toLowerCase() === session.toLowerCase()
      )
    }

    if (credentialsList.length === 0) {
      if (json) {
        UI.println(JSON.stringify([]))
      } else {
        UI.println("No active credentials.")
        UI.println("Run 'awsesh set' to set credentials.")
      }
      return
    }

    if (json) {
      UI.println(JSON.stringify(credentialsList, null, 2))
      return
    }

    const grouped = new Map<string, typeof credentialsList>()
    for (const cred of credentialsList) {
      const existing = grouped.get(cred.sessionName) || []
      existing.push(cred)
      grouped.set(cred.sessionName, existing)
    }

    for (const [sessionName, creds] of grouped) {
      UI.section(sessionName)

      for (const cred of creds) {
        const expiration = new Date(cred.expiration)
        const now = new Date()
        const isExpired = expiration <= now
        const timeLeft = Math.round((expiration.getTime() - now.getTime()) / 1000 / 60)

        const status = isExpired ? "error" : cred.isDefault ? "active" : "inactive"

        const expiryText = isExpired
          ? UI.red("expired")
          : timeLeft < 60
            ? UI.yellow(`${timeLeft}m remaining`)
            : UI.dim(`${Math.round(timeLeft / 60)}h remaining`)

        UI.println(`  ${UI.bullet(`${cred.accountName} / ${cred.roleName}`, status)}`)
        UI.println(UI.kv("Profile", cred.profileName, 4))
        UI.println(UI.kv("Account ID", cred.accountId, 4))
        UI.println(UI.kv("Expires", expiryText, 4))
        UI.println()
      }
    }
  },
})
