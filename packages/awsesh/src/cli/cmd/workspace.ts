import type { WorkspaceBinding } from "@awsesh/core"
import type { Argv } from "yargs"
import { getAwsesh } from "@/instance"
import { commandArguments, credentialCommand, runCommand } from "./util/profile-process"

function printBinding({ root, source, targets, trust }: WorkspaceBinding) {
  const origin = source.kind === "personal" ? `personal group ${source.group}` : `shared ${JSON.stringify(source.file)}`
  console.log(`${JSON.stringify(root)} (${origin}; ${trust})`)
  for (const { alias, org, sessionName, accountId, roleName, region, startUrl, ssoRegion } of targets) {
    const session = `${org ? `${org} → ` : ""}${JSON.stringify(sessionName)}`
    console.log(`  ${alias}: ${session} / ${accountId} / ${roleName} (${region}; SSO ${JSON.stringify(startUrl)} in ${JSON.stringify(ssoRegion)})`)
  }
}

export function workspaceCommands(yargs: Argv) {
  return yargs
    .command(
      "bind <group>",
      "Bind the current directory to a local profile group",
      (command) => command.positional("group", { type: "string", demandOption: true }),
      async ({ group }) => {
        await getAwsesh().workspaces.bind(process.cwd(), group)
        console.log(`Bound this directory to ${group}. Review with awsesh workspace inspect.`)
      },
    )
    .command(
      "unbind",
      "Remove the personal binding at the current directory",
      {},
      async () => {
        await getAwsesh().workspaces.unbind(process.cwd())
      },
    )
    .command(
      "map <org> <session>",
      "Map a shared organization name to a local SSO session",
      (command) => command
        .positional("org", { type: "string", demandOption: true })
        .positional("session", { type: "string", demandOption: true }),
      async ({ org, session }) => {
        await getAwsesh().workspaces.mapOrganization(org, session)
      },
    )
    .command(
      "inspect",
      "Show the effective workspace targets and trust status",
      (command) => command.option("json", { type: "boolean", describe: "Output as JSON" }),
      async ({ json }) => {
        const binding = await getAwsesh().workspaces.inspect(process.cwd())
        if (json) console.log(JSON.stringify(binding ?? null, null, 2))
        else if (binding) printBinding(binding)
        else console.log("No workspace binding found.")
      },
    )
    .command(
      "trust",
      "Approve the current workspace targets in local configuration",
      {},
      async () => {
        printBinding(await getAwsesh().workspaces.trust(process.cwd()))
      },
    )
    .command(
      "exec",
      "Run a command with trusted workspace profiles (exec -- <command> [args…])",
      (command) => command.parserConfiguration({ "populate--": true, "parse-positional-numbers": false }),
      async (args) => {
        const argv = commandArguments(args["--"], "workspace exec")
        process.exitCode = await getAwsesh().workspaces.withEnvironment(
          process.cwd(),
          { credentialCommand: credentialCommand() },
          (env) => runCommand(argv, env),
        )
      },
    )
    .demandCommand(1, 1)
}
