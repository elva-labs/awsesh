import { cmd } from "./cmd"
import { UI } from "../ui"
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
        UI.println(JSON.stringify([]))
      } else {
        UI.println("No SSO sessions configured.")
        UI.println("Run 'awsesh' to create a new session.")
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
      UI.println(JSON.stringify(output, null, 2))
      return
    }

    UI.println()
    for (const session of sessionList) {
      const token = await awsesh.tokens.get(session.startUrl)
      UI.println(UI.bullet(session.name, token ? "active" : "inactive"))
      UI.println(UI.kv("Start URL", session.startUrl))
      UI.println(UI.kv("SSO Region", session.ssoRegion))
      UI.println(UI.kv("Default Region", session.defaultRegion))
      if (token) {
        UI.println(UI.kv("Token expires", token.expiresAt.toLocaleString()))
      }
      UI.println()
    }
  },
})
