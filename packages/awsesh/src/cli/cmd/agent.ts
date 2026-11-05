import { cmd } from "./cmd"
import { Agent } from "@/agent"

// stdout carries only JSON, so the commands work as credential_process and for scripts
const print = (value: unknown) => {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

const fail = (error: unknown): never => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}

const run = (fn: () => Promise<unknown>) => fn().then(print, fail)

const readStdin = async () => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString("utf-8")
}

const register = cmd<{ id: string; cwd: string; agent: string; bin: string }>({
  command: "register",
  describe: "Register an agent session and print the environment it should run with",
  builder: (yargs) =>
    yargs
      .option("id", { type: "string", demandOption: true, describe: "Agent session id" })
      .option("cwd", { type: "string", default: process.cwd(), describe: "Folder the session works in" })
      .option("agent", { type: "string", default: "shell", describe: "What runs the session, such as claude" })
      .option("bin", { type: "string", default: "awsesh", describe: "Command the AWS tools run for credentials" }),
  handler: (args) =>
    run(async () => {
      const { session, scope, note } = await Agent.register({ id: args.id, cwd: args.cwd, agent: args.agent, bin: args.bin })
      return { session, scope: scope ?? null, note: note ?? null, env: Agent.environment(session) }
    }),
})

const use = cmd<{ id: string; org: string; account: string; role?: string; check: boolean }>({
  command: "use <org> <account> [role]",
  describe: "Point an agent session at an account, within its project's .sesh/scope.json",
  builder: (yargs) =>
    yargs
      .positional("org", { type: "string", describe: "SSO session name" })
      .positional("account", { type: "string", describe: "Account name or id" })
      .positional("role", { type: "string", describe: "Role; defaults to the saved default role the scope allows" })
      .option("id", { type: "string", demandOption: true, describe: "Agent session id" })
      .option("check", { type: "boolean", default: false, describe: "Only say what the switch would do and whether to ask first" }),
  handler: (args) =>
    run(() => (args.check ? Agent.resolve(args.id, args.org, args.account, args.role) : Agent.use(args.id, args.org, args.account, args.role))),
})

const creds = cmd<{ id: string }>({
  command: "creds",
  describe: "Print credentials for an agent session's account (credential_process)",
  builder: (yargs) => yargs.option("id", { type: "string", demandOption: true, describe: "Agent session id" }),
  handler: (args) => run(() => Agent.creds(args.id)),
})

const status = cmd<{ id: string }>({
  command: "status",
  describe: "Show an agent session and its project's scope",
  builder: (yargs) => yargs.option("id", { type: "string", demandOption: true, describe: "Agent session id" }),
  handler: (args) =>
    run(async () => {
      const session = (await Agent.get(args.id)) ?? fail(new Error(`No agent session ${args.id}.`))
      return { session, scope: (await Agent.scopeFor(session.cwd)) ?? null }
    }),
})

const scope = cmd<{ cwd: string; set: boolean }>({
  command: "scope",
  describe: "Show a project's .sesh/scope.json, or write one read from stdin with --set",
  builder: (yargs) =>
    yargs
      .option("cwd", { type: "string", default: process.cwd(), describe: "Project folder" })
      .option("set", { type: "boolean", default: false, describe: "Write the scope JSON read from stdin" }),
  handler: (args) =>
    run(async () =>
      args.set ? Agent.setScope(args.cwd, JSON.parse(await readStdin())) : ((await Agent.scopeFor(args.cwd)) ?? null),
    ),
})

const list = cmd<object>({
  command: "list",
  describe: "List agent sessions",
  builder: (yargs) => yargs,
  handler: () => run(() => Agent.list()),
})

const end = cmd<{ id: string }>({
  command: "end",
  describe: "Remove an agent session",
  builder: (yargs) => yargs.option("id", { type: "string", demandOption: true, describe: "Agent session id" }),
  handler: (args) => run(async () => (await Agent.end(args.id), { ended: args.id })),
})

export const agent = cmd<object>({
  command: "agent",
  describe: "AWS accounts for agent sessions, such as Claude Code (preview)",
  builder: (yargs) =>
    yargs
      .command(register)
      .command(use)
      .command(creds)
      .command(status)
      .command(scope)
      .command(list)
      .command(end)
      .demandCommand(1),
  handler: async () => {},
})
