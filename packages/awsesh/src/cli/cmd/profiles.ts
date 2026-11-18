import type { ProfileSyncResult } from "@awsesh/core"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { getAwsesh } from "@/instance"

function report(result: ProfileSyncResult) {
  if (result.written.length > 0) UI.success(`Wrote ${result.written.join(", ")} to the AWS config`)
  if (result.removed.length > 0) UI.println(`Removed ${result.removed.join(", ")} from the AWS config`)
  if (result.cleared.length > 0) UI.println(`Removed old keys for ${result.cleared.join(", ")} from the AWS credentials file`)
  for (const name of result.conflicts) {
    UI.error(`Skipped ${name}: the AWS config already has a [profile ${name}] that awsesh does not manage`)
  }
}

const list = cmd<{ json: boolean }>({
  command: "list",
  describe: "List profiles awsesh keeps in the AWS config",
  builder: (yargs) => yargs.option("json", { type: "boolean", alias: "j", default: false, describe: "Output as JSON" }),
  handler: async (args) => {
    const awsesh = getAwsesh()
    const profiles = await awsesh.profiles.list()
    if (args.json) {
      UI.println(JSON.stringify(profiles, null, 2))
      return
    }
    if (profiles.length === 0) {
      UI.println("No profiles yet. Add one with: sesh profiles add <name> <session> <account> <role>")
      return
    }
    const sessions = new Map((await awsesh.sessions.list()).map((s) => [s.name, s]))
    for (const profile of profiles) {
      const session = sessions.get(profile.session)
      const signedIn = session ? (await awsesh.tokens.get(session.startUrl)) !== undefined : false
      const accountName = (await awsesh.accounts.get(profile.session))?.accounts
        .find((a) => a.accountId === profile.account)?.name ?? profile.account
      const state = !session ? "unknown session" : signedIn ? "ready" : "sign in needed"
      UI.println(`${profile.name}  ${profile.session}/${accountName}/${profile.role}${profile.region ? `  ${profile.region}` : ""}  (${state})`)
    }
  },
})

const add = cmd<{ name: string; session: string; account: string; role: string; region?: string }>({
  command: "add <name> <session> <account> <role>",
  describe: "Add a profile that gets fresh credentials from your SSO login",
  builder: (yargs) =>
    yargs
      .positional("name", { type: "string", describe: "AWS profile name" })
      .positional("session", { type: "string", describe: "SSO session name" })
      .positional("account", { type: "string", describe: "Account name or ID" })
      .positional("role", { type: "string", describe: "Role name" })
      .option("region", { type: "string", alias: "r", describe: "Region for the profile" }),
  handler: async (args) => {
    const awsesh = getAwsesh()
    const session = await awsesh.sessions.get(args.session)
    if (!session) {
      UI.error(`SSO session '${args.session}' not found.`)
      process.exit(1)
    }
    const account = (await awsesh.accounts.get(session.name))?.accounts
      .find((a) => a.accountId === args.account || a.name.toLowerCase() === args.account.toLowerCase())
    const accountId = account?.accountId ?? args.account
    const region = args.region
      ?? (await awsesh.preferredRegions.get(session.name, accountId))
      ?? session.defaultRegion
    try {
      await awsesh.profiles.save([{ name: args.name, session: session.name, account: accountId, role: args.role, region }])
    } catch (error) {
      UI.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
    const result = await awsesh.profiles.sync()
    if (result.cleared.length > 0) report({ ...result, written: [], removed: [] })
    UI.success(`Added ${args.name}: ${session.name}/${account?.name ?? accountId}/${args.role}`)
    UI.println(`Use it with: aws --profile ${args.name} sts get-caller-identity`)
  },
})

const remove = cmd<{ names: string[] }>({
  command: "remove <names..>",
  describe: "Remove profiles from awsesh and the AWS config",
  builder: (yargs) => yargs.positional("names", { type: "string", array: true, describe: "Profile names" }),
  handler: async (args) => {
    const awsesh = getAwsesh()
    const known = new Set((await awsesh.profiles.list()).map((p) => p.name))
    const missing = args.names.filter((name) => !known.has(name))
    if (missing.length > 0) {
      UI.error(`No awsesh profile named ${missing.join(", ")}`)
      process.exit(1)
    }
    await awsesh.profiles.remove(args.names)
    await awsesh.profiles.sync()
    UI.success(`Removed ${args.names.join(", ")}`)
  },
})

const sync = cmd({
  command: "sync",
  describe: "Write the profiles in profiles.json to the AWS config",
  builder: (yargs) => yargs,
  handler: async () => {
    report(await getAwsesh().profiles.sync())
  },
})

// stdout carries only the credential_process JSON
const creds = cmd<{ name: string }>({
  command: "creds <name>",
  describe: "Print credentials for a profile (used by credential_process)",
  builder: (yargs) => yargs.positional("name", { type: "string", describe: "Profile name" }),
  handler: async (args) => {
    try {
      process.stdout.write(`${JSON.stringify(await getAwsesh().profiles.credentials(args.name))}\n`)
    } catch (error) {
      process.stderr.write(`awsesh: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exit(1)
    }
  },
})

export const profiles = cmd({
  command: "profiles",
  describe: "Manage AWS profiles that refresh from your SSO login",
  builder: (yargs) =>
    yargs
      .command(list)
      .command(add)
      .command(remove)
      .command(sync)
      .command(creds)
      .demandCommand(1, ""),
  handler: async () => {},
})
