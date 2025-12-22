import { cmd } from "./cmd"
import { UI } from "../ui"
import { getAwsesh } from "@/instance"
import { openBrowser } from "@/util/browser"
import { copyToClipboard } from "@/util/clipboard"
import type { SSOSession, TokenResult } from "@awsesh/core"

interface AuthArgs {
  session?: string
  list?: boolean
  delete?: string
}

export const auth = cmd({
  command: "auth [session]",
  describe: "Authenticate with AWS SSO",
  builder: (yargs) =>
    yargs
      .positional("session", {
        type: "string",
        describe: "SSO session name to authenticate with",
      })
      .option("list", {
        type: "boolean",
        alias: "l",
        describe: "List available SSO sessions",
        default: false,
      })
      .option("delete", {
        type: "string",
        alias: "d",
        describe: "Delete an SSO session by name",
      }),
  handler: async (args) => {
    const typedArgs = args as AuthArgs
    const awsesh = getAwsesh()

    if (typedArgs.list) {
      const sessions = await awsesh.sessions.list()
      if (sessions.length === 0) {
        UI.info("No SSO sessions configured.")
        UI.info("Run 'awsesh auth' to create a new session.")
        return
      }

      UI.info(`Found ${sessions.length} SSO session(s):\n`)
      for (const session of sessions) {
        console.log(`  - ${session.name}`)
        console.log(`    Start URL: ${session.startUrl}`)
        console.log(`    SSO Region: ${session.ssoRegion}`)
        console.log(`    Default Region: ${session.defaultRegion}`)
        console.log()
      }
      return
    }

    if (typedArgs.delete) {
      const session = await awsesh.sessions.get(typedArgs.delete)
      if (!session) {
        UI.error(`SSO Session '${typedArgs.delete}' does not exist.`)
        process.exit(1)
      }

      await awsesh.sessions.remove(typedArgs.delete)
      UI.success(`SSO Session '${typedArgs.delete}' deleted successfully.`)
      return
    }

    let session: SSOSession | undefined

    if (typedArgs.session) {
      session = await awsesh.sessions.get(typedArgs.session)
      if (!session) {
        UI.error(`SSO Session '${typedArgs.session}' not found.`)
        UI.info("Run 'awsesh auth --list' to see available sessions.")
        process.exit(1)
      }
    } else {
      UI.error("No SSO session specified.")
      UI.info("Usage: awsesh auth <session>")
      UI.info("   or: awsesh auth --list")
      UI.info("\nTo create a new session, run 'awsesh' and follow the prompts.")
      process.exit(1)
    }

    UI.info(`Authenticating with session '${session.name}'...`)
    UI.info(`Start URL: ${session.startUrl}`)
    UI.info(`SSO Region: ${session.ssoRegion}\n`)

    const loginInfo = await awsesh.sso.startLogin(session)

    UI.info("Please visit the following URL and enter the code:\n")
    console.log(`  URL:  ${loginInfo.verificationUriComplete}`)
    console.log(`  Code: ${loginInfo.userCode}\n`)

    const copied = await copyToClipboard(loginInfo.userCode)
    if (copied) {
      UI.info("Verification code copied to clipboard!\n")
    }

    await openBrowser(loginInfo.verificationUriComplete)
    UI.info("Opening browser...\n")

    UI.info("Waiting for authorization...")
    
    let tokenResult: TokenResult | null = null
    while (!tokenResult) {
      await new Promise((resolve) => setTimeout(resolve, loginInfo.interval * 1000))
      tokenResult = await awsesh.sso.pollForToken(session, loginInfo)
    }

    await awsesh.tokens.save(session.startUrl, tokenResult.token, tokenResult.expiresAt)

    UI.success("Authentication successful!")
    UI.info(`Token cached and will expire at ${tokenResult.expiresAt.toLocaleString()}`)
  },
})
