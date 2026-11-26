import type { ProfileBinding } from "@awsesh/core"
import type { Argv } from "yargs"
import { getAwsesh } from "@/instance"
import { commandArguments, credentialCommand, runCommand } from "./util/profile-process"

export function profileCommands(yargs: Argv) {
  return yargs
    .command(
      "define <group>",
      "Save or replace a local profile group",
      (command) => command.positional("group", { type: "string", demandOption: true })
        .option("profile", {
          type: "string",
          array: true,
          nargs: 4,
          demandOption: true,
          describe: "Alias, SSO session, account ID and role name (repeat for each profile)",
        }),
      async ({ group, profile }) => {
        const profiles: ProfileBinding[] = []
        for (let index = 0; index < profile.length; index += 4) {
          const [alias, sessionName, accountId, roleName] = profile.slice(index, index + 4)
          profiles.push({ alias, sessionName, accountId, roleName })
        }
        await getAwsesh().profileGroups.save(group, profiles)
      },
    )
    .command(
      "list",
      "List local profile groups",
      (command) => command.option("json", { type: "boolean", describe: "Output as JSON" }),
      async ({ json }) => {
        const groups = await getAwsesh().profileGroups.list()
        if (json) {
          console.log(JSON.stringify(groups, null, 2))
          return
        }
        if (!groups.length) console.log("No profile groups defined.")
        for (const { name, profiles } of groups) {
          console.log(name)
          for (const { alias, sessionName, accountId, roleName } of profiles) {
            console.log(`  ${alias}: ${JSON.stringify(sessionName)} / ${accountId} / ${roleName}`)
          }
        }
      },
    )
    .command(
      "exec <group>",
      "Run a command with a profile group (exec <group> -- <command> [args…])",
      (command) => command.parserConfiguration({ "populate--": true, "parse-positional-numbers": false })
        .positional("group", { type: "string", demandOption: true }),
      async (args) => {
        const argv = commandArguments(args["--"], "profiles exec <group>")
        const { profileGroups, profileSets } = getAwsesh()
        const group = await profileGroups.get(args.group)
        if (!group) throw new Error(`Profile group not found: ${args.group}`)
        process.exitCode = await profileSets.withEnvironment(
          group.profiles,
          { credentialCommand: credentialCommand() },
          (env) => runCommand(argv, env),
        )
      },
    )
    .command(
      "credential-process <binding>",
      false,
      (command) => command.positional("binding", { type: "string", demandOption: true }),
      async ({ binding }) => {
        const credentials = await getAwsesh().profileSets.credentialProcess(binding)
        console.log(JSON.stringify(credentials))
      },
    )
    .demandCommand(1, 1)
}
