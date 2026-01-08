import { cmd } from "./cmd"
import { getAwsesh } from "@/instance"

export const sessions = cmd({
  command: "sessions",
  describe: "List all SSO sessions",
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

    const sessionList = await awsesh.sessions.list()

    if (sessionList.length === 0) {
      if (json) {
        console.log(JSON.stringify([]))
      } else {
        console.log("No SSO sessions configured.")
        console.log("Run 'awsesh' to create a new session.")
      }
      return
    }

    if (json) {
      const output = await Promise.all(
        sessionList.map(async (session) => {
          const token = await awsesh.tokens.get(session.startUrl)
          return {
            name: session.name,
            startUrl: session.startUrl,
            ssoRegion: session.ssoRegion,
            defaultRegion: session.defaultRegion,
            authenticated: !!token,
            tokenExpires: token?.expiresAt.toISOString() ?? null,
          }
        })
      )
      console.log(JSON.stringify(output, null, 2))
      return
    }

    console.log()
    for (const session of sessionList) {
      const token = await awsesh.tokens.get(session.startUrl)
      const status = token ? "\x1b[32m●\x1b[0m" : "\x1b[90m○\x1b[0m"
      console.log(`${status} ${session.name}`)
      console.log(`  \x1b[90mStart URL:\x1b[0m ${session.startUrl}`)
      console.log(`  \x1b[90mSSO Region:\x1b[0m ${session.ssoRegion}`)
      console.log(`  \x1b[90mDefault Region:\x1b[0m ${session.defaultRegion}`)
      if (token) {
        console.log(`  \x1b[90mToken expires:\x1b[0m ${token.expiresAt.toLocaleString()}`)
      }
      console.log()
    }
  },
})
