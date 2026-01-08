import { cmd } from "./cmd"
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
        console.log(JSON.stringify([]))
      } else {
        console.log("No active credentials.")
        console.log("Run 'awsesh set' to set credentials.")
      }
      return
    }

    if (json) {
      console.log(JSON.stringify(credentialsList, null, 2))
      return
    }

    const grouped = new Map<string, typeof credentialsList>()
    for (const cred of credentialsList) {
      const existing = grouped.get(cred.sessionName) || []
      existing.push(cred)
      grouped.set(cred.sessionName, existing)
    }

    console.log()
    for (const [sessionName, creds] of grouped) {
      console.log(`\x1b[36m${sessionName}\x1b[0m`)
      console.log()

      for (const cred of creds) {
        const expiration = new Date(cred.expiration)
        const now = new Date()
        const isExpired = expiration <= now
        const timeLeft = Math.round((expiration.getTime() - now.getTime()) / 1000 / 60)

        const status = isExpired
          ? "\x1b[31m●\x1b[0m"
          : cred.isDefault
            ? "\x1b[32m●\x1b[0m"
            : "\x1b[90m○\x1b[0m"

        const expiryText = isExpired
          ? "\x1b[31mexpired\x1b[0m"
          : timeLeft < 60
            ? `\x1b[33m${timeLeft}m remaining\x1b[0m`
            : `\x1b[90m${Math.round(timeLeft / 60)}h remaining\x1b[0m`

        console.log(`  ${status} ${cred.accountName} / ${cred.roleName}`)
        console.log(`    \x1b[90mProfile:\x1b[0m ${cred.profileName}`)
        console.log(`    \x1b[90mAccount ID:\x1b[0m ${cred.accountId}`)
        console.log(`    \x1b[90mExpires:\x1b[0m ${expiryText}`)
        console.log()
      }
    }
  },
})
