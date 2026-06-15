import * as prompts from "@clack/prompts"
import type { Awsesh, SSOSession, TokenCache, TokenResult } from "@awsesh/core"
import { openBrowser } from "@/util/browser"
import { copyToClipboard } from "@/util/clipboard"

export async function authenticate(
  awsesh: Awsesh,
  session: SSOSession,
  options?: { silent?: boolean; noBrowser?: boolean }
): Promise<TokenCache> {
  const existingToken = await awsesh.tokens.get(session.startUrl)
  if (existingToken) {
    return existingToken
  }

  if (!options?.silent) {
    console.log()
    prompts.log.info(`Authenticating with '${session.name}'...`)
  }

  const loginInfo = await awsesh.sso.startLogin(session)

  if (!options?.silent) {
    console.log()
    console.log(`  \x1b[90mURL:\x1b[0m  ${loginInfo.verificationUriComplete}`)
    console.log(`  \x1b[90mCode:\x1b[0m ${loginInfo.userCode}`)
    console.log()
  }

  const copied = await copyToClipboard(loginInfo.userCode)
  if (copied && !options?.silent) {
    prompts.log.info("Verification code copied to clipboard")
  }

  const opened = options?.noBrowser ? false : await openBrowser(loginInfo.verificationUriComplete)
  if (!opened && !options?.silent) {
    prompts.log.info("Could not open a browser — visit the URL above to authorize.")
  }

  const spinner = options?.silent ? undefined : prompts.spinner()
  spinner?.start("Waiting for authorization...")

  let tokenResult: TokenResult | null = null
  while (!tokenResult) {
    try {
      await Bun.sleep(loginInfo.interval * 1000)
      tokenResult = await awsesh.sso.pollForToken(session, loginInfo)
    } catch (error) {
      spinner?.stop()
      throw error
    }
  }

  await awsesh.tokens.save(session.startUrl, tokenResult.token, tokenResult.expiresAt)

  spinner?.stop("Authenticated")

  return {
    token: tokenResult.token,
    expiresAt: tokenResult.expiresAt,
    startUrl: session.startUrl,
  }
}
