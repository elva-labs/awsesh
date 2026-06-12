import * as prompts from "@clack/prompts"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { getAwsesh } from "@/instance"
import { authenticate } from "./util/auth"
import type { SSOSession, Account } from "@awsesh/core"
import { printEvalEnvironment } from "@/util/styled-output"

async function withStdoutRedirectedToStderr<T>(callback: () => Promise<T>): Promise<T> {
  const originalWrite = process.stdout.write
  const stderrWrite = process.stderr.write.bind(process.stderr)

  process.stdout.write = ((...args: Parameters<typeof process.stderr.write>) =>
    stderrWrite(...args)) as typeof process.stdout.write

  try {
    return await callback()
  } finally {
    process.stdout.write = originalWrite
  }
}

interface SetArgs {
  session?: string
  account?: string
  role?: string
  profile?: string
  region?: string
  eval?: boolean
  browser?: boolean
}

export const set = cmd({
  command: "set [session] [account] [role]",
  describe: "Set AWS credentials for an account and role",
  builder: (yargs) =>
    yargs
      .positional("session", {
        type: "string",
        describe: "SSO session name",
      })
      .positional("account", {
        type: "string",
        describe: "AWS account name",
      })
      .positional("role", {
        type: "string",
        describe: "IAM role name",
      })
      .option("profile", {
        type: "string",
        alias: "p",
        describe: "Custom CLI profile name (instead of default)",
      })
      .option("region", {
        type: "string",
        alias: "r",
        describe: "AWS region to use",
      })
      .option("eval", {
        type: "boolean",
        alias: "e",
        describe: "Output shell commands to set environment variables",
        default: false,
      })
      .option("browser", {
        type: "boolean",
        alias: "b",
        describe: "Open AWS console in browser instead of setting credentials",
        default: false,
      }),
  handler: async (args) => {
    const typedArgs = args as SetArgs
    const awsesh = getAwsesh()

    const sessionList = await awsesh.sessions.list()
    if (sessionList.length === 0) {
      UI.error("No SSO sessions configured.")
      UI.println("Run 'awsesh' to create a new session.")
      process.exit(1)
    }

    let session: SSOSession | undefined
    let selectedSessionName = typedArgs.session

    if (!selectedSessionName) {
      if (sessionList.length === 1) {
        session = sessionList[0]
        selectedSessionName = session.name
      } else {
        const lastSession = await awsesh.lastSession.get()
        const sortedSessions = [...sessionList].sort((a, b) => {
          if (a.name === lastSession) return -1
          if (b.name === lastSession) return 1
          return a.name.localeCompare(b.name)
        })

        const result = typedArgs.eval
          ? await withStdoutRedirectedToStderr(() =>
              prompts.select({
                message: "Select SSO session",
                options: sortedSessions.map((s) => ({
                  label: s.name,
                  value: s.name,
                  hint: s.startUrl,
                })),
              })
            )
          : await prompts.select({
              message: "Select SSO session",
              options: sortedSessions.map((s) => ({
                label: s.name,
                value: s.name,
                hint: s.startUrl,
              })),
            })

        if (prompts.isCancel(result)) {
          process.exit(0)
        }
        selectedSessionName = result
        session = sessionList.find((s) => s.name === selectedSessionName)
      }
    } else {
      session = await awsesh.sessions.get(selectedSessionName)
    }

    if (!session) {
      UI.error(`SSO session '${selectedSessionName}' not found.`)
      UI.println("Run 'awsesh sessions' to see available sessions.")
      process.exit(1)
    }

    await awsesh.lastSession.save(session.name)

    const token = await authenticate(awsesh, session, { silent: typedArgs.eval })
    const accountList = await awsesh.sso.listAccounts(session, token.token)

    if (accountList.length === 0) {
      UI.error("No accounts found for this session.")
      process.exit(1)
    }

    let account: Account | undefined
    let selectedAccountName = typedArgs.account

    if (!selectedAccountName) {
      const lastAccountId = await awsesh.lastAccountPerSession.get(session.name)
      const sortedAccounts = [...accountList].sort((a, b) => {
        if (a.accountId === lastAccountId) return -1
        if (b.accountId === lastAccountId) return 1
        return a.name.localeCompare(b.name)
      })

      const result = typedArgs.eval
        ? await withStdoutRedirectedToStderr(() =>
            prompts.select({
              message: "Select account",
              options: sortedAccounts.map((a) => ({
                label: a.name,
                value: a.name,
                hint: a.accountId,
              })),
            })
          )
        : await prompts.select({
            message: "Select account",
            options: sortedAccounts.map((a) => ({
              label: a.name,
              value: a.name,
              hint: a.accountId,
            })),
          })

      if (prompts.isCancel(result)) {
        process.exit(0)
      }
      selectedAccountName = result
      account = accountList.find((a) => a.name === selectedAccountName)
    } else {
      account = accountList.find(
        (a) => a.name.toLowerCase() === selectedAccountName?.toLowerCase()
      )
    }

    if (!account) {
      UI.error(`Account '${selectedAccountName}' not found.`)
      UI.println("Run 'awsesh accounts' to see available accounts.")
      process.exit(1)
    }

    await awsesh.lastAccountPerSession.save(session.name, account.accountId)

    const roleList = await awsesh.sso.listRoles(session, token.token, account.accountId)

    if (roleList.length === 0) {
      UI.error(`No roles found for account '${account.name}'.`)
      process.exit(1)
    }

    let selectedRole = typedArgs.role
    const sessionAndAccountProvided = typedArgs.session && typedArgs.account

    if (!selectedRole) {
      if (roleList.length === 1) {
        selectedRole = roleList[0]
      } else {
        const preferredRole = await awsesh.preferredRoles.get(session.name, account.accountId)

        if (sessionAndAccountProvided && preferredRole && roleList.includes(preferredRole)) {
          selectedRole = preferredRole
        } else {
          const sortedRoles = [...roleList].sort((a, b) => {
            if (a === preferredRole) return -1
            if (b === preferredRole) return 1
            return a.localeCompare(b)
          })

          const result = typedArgs.eval
            ? await withStdoutRedirectedToStderr(() =>
                prompts.select({
                  message: "Select role",
                  options: sortedRoles.map((r) => ({
                    label: r,
                    value: r,
                  })),
                })
              )
            : await prompts.select({
                message: "Select role",
                options: sortedRoles.map((r) => ({
                  label: r,
                  value: r,
                })),
              })

          if (prompts.isCancel(result)) {
            process.exit(0)
          }
          selectedRole = result
        }
      }
    } else {
      if (!roleList.includes(selectedRole)) {
        const matchedRole = roleList.find(
          (r) => r.toLowerCase() === selectedRole?.toLowerCase()
        )
        if (matchedRole) {
          selectedRole = matchedRole
        } else {
          UI.error(`Role '${selectedRole}' not found for account '${account.name}'.`)
          UI.println(`Available roles: ${roleList.join(", ")}`)
          process.exit(1)
        }
      }
    }

    await awsesh.preferredRoles.save(session.name, account.accountId, selectedRole)

    if (typedArgs.browser) {
      const url = awsesh.sso.getAccountUrl(session, account.accountId, token.token, selectedRole)
      prompts.log.info("Opening AWS console in browser...")
      const { openBrowser } = await import("@/util/browser")
      await openBrowser(url)
      prompts.log.success("Browser opened")
      return
    }

    const spinner = typedArgs.eval ? undefined : prompts.spinner()
    spinner?.start("Getting credentials...")

    const creds = await awsesh.sso.getCredentials(
      session,
      token.token,
      account.accountId,
      selectedRole
    )

    const effectiveRegion = typedArgs.region || session.defaultRegion

    const result = await awsesh.setCredential({
      credentials: creds,
      sessionName: session.name,
      accountId: account.accountId,
      accountName: account.name,
      roleName: selectedRole,
      region: effectiveRegion,
      profileName: typedArgs.profile, // core looks up configured profile if undefined
    })

    spinner?.stop("Credentials set")

    if (typedArgs.eval) {
      printEvalEnvironment({
        region: effectiveRegion,
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
        expiration: creds.expiration.toISOString(),
      })
    } else {
      UI.println(UI.kv("Profile", result.profileName))
      UI.println(UI.kv("Region", effectiveRegion))
      UI.println(UI.kv("Account", `${account.name} (${account.accountId})`))
      UI.println(UI.kv("Role", selectedRole))
      UI.println(UI.kv("Expires", result.expiration.toLocaleString()))
    }
  },
})
