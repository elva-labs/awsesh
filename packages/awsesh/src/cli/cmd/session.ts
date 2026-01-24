import { cmd } from "./cmd"
import { UI } from "../ui"
import { getAwsesh } from "@/instance"

export const session = cmd({
  command: "<ssoSession> <accountName> [roleName]",
  describe: "Directly set credentials for a specific account and role",
  builder: (yargs) =>
    yargs
      .positional("ssoSession", {
        type: "string",
        describe: "SSO session name",
        demandOption: true,
      })
      .positional("accountName", {
        type: "string",
        describe: "AWS account name",
        demandOption: true,
      })
      .positional("roleName", {
        type: "string",
        describe: "IAM role name (uses last selected if omitted)",
      })
      .option("browser", {
        alias: "b",
        type: "boolean",
        describe: "Open AWS console in browser instead of setting credentials",
        default: false,
      })
      .option("region", {
        alias: "r",
        type: "string",
        describe: "AWS region to use",
      })
      .option("eval", {
        alias: "e",
        type: "boolean",
        describe: "Output shell commands to set AWS environment variables",
        default: false,
      })
      .option("profile", {
        alias: "p",
        type: "string",
        describe: "Custom CLI profile name for credentials",
      }),
  handler: async (args) => {
    const { ssoSession, accountName, roleName, browser, region, eval: evalMode, profile: customProfile } = args as {
      ssoSession: string
      accountName: string
      roleName?: string
      browser?: boolean
      region?: string
      eval?: boolean
      profile?: string
    }

    const awsesh = getAwsesh()

    try {
      const sessionData = await awsesh.sessions.get(ssoSession)
      if (!sessionData) {
        UI.error(`SSO session '${ssoSession}' not found.`)
        UI.info("Run 'awsesh auth --list' to see available sessions.")
        process.exit(1)
      }

      const token = await awsesh.tokens.get(sessionData.startUrl)
      if (!token) {
        UI.error(`No valid token found for '${ssoSession}'.`)
        UI.info(`Run 'awsesh auth ${ssoSession}' to authenticate first.`)
        process.exit(1)
      }

      const accounts = await awsesh.sso.listAccounts(sessionData, token.token)

      const account = accounts.find(
        (acc) => acc.name.toLowerCase() === accountName.toLowerCase()
      )
      if (!account) {
        UI.error(`Account '${accountName}' not found.`)
        UI.info(`Available accounts: ${accounts.map((a) => a.name).join(", ")}`)
        process.exit(1)
      }

      let selectedRole = roleName
      if (!selectedRole) {
        const lastSelected = await awsesh.lastSelected.get()
        if (
          lastSelected.session === ssoSession &&
          lastSelected.account === accountName &&
          lastSelected.role
        ) {
          selectedRole = lastSelected.role
        }
      }

      if (!selectedRole) {
        UI.error("No role specified and no previously selected role found.")
        UI.info(`Usage: awsesh ${ssoSession} ${accountName} <role-name>`)
        process.exit(1)
      }

      const roles = await awsesh.sso.listRoles(sessionData, token.token, account.accountId)
      if (!roles.includes(selectedRole)) {
        UI.error(`Role '${selectedRole}' not found for account '${accountName}'.`)
        UI.info(`Available roles: ${roles.join(", ")}`)
        process.exit(1)
      }

      if (browser) {
        const url = awsesh.sso.getAccountUrl(sessionData, account.accountId, token.token, selectedRole)
        UI.info("Opening AWS console in browser...")
        const { openBrowser } = await import("@/util/browser")
        await openBrowser(url)
        UI.success("Browser opened successfully!")
        return
      }

      const credentials = await awsesh.sso.getCredentials(sessionData, token.token, account.accountId, selectedRole)

      const effectiveRegion = region || sessionData.defaultRegion

      // Always write to default profile
      await awsesh.credentials.write("default", credentials, effectiveRegion)

      // Also write to custom profile if specified or configured
      const configuredProfile = await awsesh.profileNames.get(ssoSession, accountName, selectedRole)
      const customProfileName = customProfile || configuredProfile
      if (customProfileName) {
        await awsesh.credentials.write(customProfileName, credentials, effectiveRegion)
      }

      await awsesh.lastSelected.save({
        session: ssoSession,
        account: accountName,
        role: selectedRole,
      })

      const profileName = customProfileName || "default"

      await awsesh.activeCredentials.save({
        profileName,
        accountId: account.accountId,
        accountName: account.name,
        roleName: selectedRole,
        sessionName: ssoSession,
        expiration: credentials.expiration.toISOString(),
        isDefault: !customProfileName,
      })

      await awsesh.lastSetCredential.save({
        profileName,
        accountId: account.accountId,
        accountName: account.name,
        roleName: selectedRole,
        sessionName: ssoSession,
        region: effectiveRegion,
        setAt: new Date().toISOString(),
      })

      if (evalMode) {
        console.log(`export AWS_REGION='${effectiveRegion}'`)
        console.log(`export AWS_ACCESS_KEY_ID='${credentials.accessKeyId}'`)
        console.log(`export AWS_SECRET_ACCESS_KEY='${credentials.secretAccessKey}'`)
        console.log(`export AWS_SESSION_TOKEN='${credentials.sessionToken}'`)
        console.log(`export AWS_SESSION_EXPIRATION='${credentials.expiration.toISOString()}'`)
      } else {
        UI.success("Credentials configured successfully!")
        UI.info(`Profile: default${customProfileName ? `, ${customProfileName}` : ""}`)
        UI.info(`Region: ${effectiveRegion}`)
        UI.info(`Account: ${accountName} (${account.accountId})`)
        UI.info(`Role: ${selectedRole}`)
        console.log()
        UI.info("Usage: aws sts get-caller-identity")
      }
    } catch (error) {
      UI.error(`Failed to set credentials: ${error}`)
      process.exit(1)
    }
  },
})
