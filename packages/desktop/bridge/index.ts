import { homedir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { createAwsesh, createWorkflow } from "@awsesh/core"

const workflow = createWorkflow(createAwsesh({
  configDir: path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "awsesh"),
  dataDir: path.join(process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share"), "awsesh"),
  awsDir: path.join(homedir(), ".aws"),
}))

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string argument")
  return value
}

function optional(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : string(value)
}

async function dispatch(request: unknown) {
  if (typeof request !== "object" || request === null || !("operation" in request)) throw new Error("Invalid SDK request")
  const args = "args" in request ? request.args : {}
  if (typeof args !== "object" || args === null) throw new Error("Invalid SDK arguments")
  const name = "name" in args ? optional(args.name) : undefined
  const account = "accountId" in args ? optional(args.accountId) : undefined
  const role = "role" in args ? optional(args.role) : undefined
  switch (request.operation) {
    case "snapshot": return workflow.snapshot(name)
    case "setAppearance": return workflow.setAppearance("appearance" in args ? string(args.appearance) : "", name)
    case "selectSession": return workflow.selectSession(string(name), "refresh" in args && args.refresh === true)
    case "saveSession": {
      if (!("startUrl" in args) || !("ssoRegion" in args) || !("defaultRegion" in args)) throw new Error("Incomplete SSO session")
      return workflow.saveSession({ name: string(name), startUrl: string(args.startUrl), ssoRegion: string(args.ssoRegion), defaultRegion: string(args.defaultRegion) }, "creating" in args && args.creating === true)
    }
    case "removeSession": return workflow.removeSession(string(name))
    case "startLogin": return workflow.startLogin(string(name))
    case "pollLogin": return workflow.pollLogin(string(name))
    case "cancelLogin": return workflow.cancelLogin(string(name))
    case "loadRoles": return workflow.loadRoles(string(name), string(account), "refresh" in args && args.refresh === true)
    case "preferRole": return workflow.preferRole(string(name), string(account), string(role))
    case "setRegion": return workflow.setRegion(string(name), string(account), "region" in args ? string(args.region) : "")
    case "setProfile": return workflow.setProfile(string(name), string(account), string(role), "profile" in args ? string(args.profile) : "")
    case "assumeRole": return workflow.assumeRole(string(name), string(account), string(role))
    case "consoleUrl": return workflow.consoleUrl(string(name), account, role)
    case "clearCredential": return workflow.clearCredential(string(account), string(role), "profile" in args ? string(args.profile) : "", name)
    case "signOut": return workflow.signOut(string(name))
    default: throw new Error("Unknown SDK operation")
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  try {
    const request: unknown = JSON.parse(line)
    const result = await dispatch(request)
    process.stdout.write(`${JSON.stringify({ result: result ?? null })}\n`)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "SDK operation failed" })}\n`)
  }
}
