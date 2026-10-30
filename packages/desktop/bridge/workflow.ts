import { homedir } from "node:os"
import path from "node:path"
import { createAwsesh, createWorkflow } from "@awsesh/core"

export const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "awsesh")
export const dataDir = path.join(process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share"), "awsesh")

const workflow = createWorkflow(createAwsesh({
  configDir,
  dataDir,
  awsDir: path.join(homedir(), ".aws"),
}))

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string argument")
  return value
}

function optional(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : string(value)
}

export async function dispatchWorkflow(operation: string, args: Record<string, unknown>) {
  const name = optional(args.name)
  const account = optional(args.accountId)
  const role = optional(args.role)
  switch (operation) {
    case "snapshot": return workflow.snapshot(name)
    case "selectSession": return workflow.selectSession(string(name), args.refresh === true)
    case "saveSession": {
      if (!("startUrl" in args) || !("ssoRegion" in args) || !("defaultRegion" in args)) throw new Error("Incomplete SSO session")
      return workflow.saveSession({ name: string(name), startUrl: string(args.startUrl), ssoRegion: string(args.ssoRegion), defaultRegion: string(args.defaultRegion) }, args.creating === true)
    }
    case "removeSession": return workflow.removeSession(string(name))
    case "startLogin": return workflow.startLogin(string(name))
    case "pollLogin": return workflow.pollLogin(string(name))
    case "cancelLogin": return workflow.cancelLogin(string(name))
    case "loadRoles": return workflow.loadRoles(string(name), string(account), args.refresh === true)
    case "preferRole": return workflow.preferRole(string(name), string(account), string(role))
    case "setRegion": return workflow.setRegion(string(name), string(account), "region" in args ? string(args.region) : "")
    case "setProfile": return workflow.setProfile(string(name), string(account), string(role), "profile" in args ? string(args.profile) : "")
    case "pinAccount": return workflow.pinAccount(string(name), string(account), args.pinned === true)
    case "setAccountGroup": return workflow.setAccountGroup(string(name), string(account), "group" in args ? string(args.group) : "")
    case "renameAccountGroup": return workflow.renameAccountGroup(string(name), string(args.group), string(args.renamed))
    case "removeAccountGroup": return workflow.removeAccountGroup(string(name), string(args.group))
    case "collapseAccountGroup": return workflow.collapseAccountGroup(string(name), string(args.group), args.collapsed === true)
    case "assumeRole": return workflow.assumeRole(string(name), string(account), string(role))
    case "consoleUrl": return workflow.consoleUrl(string(name), account, role)
    case "clearCredential": return workflow.clearCredential(string(account), string(role), "profile" in args ? string(args.profile) : "", name)
    case "clearAllCredentials": return workflow.clearAllCredentials(name)
    case "signOut": return workflow.signOut(string(name))
    default: throw new Error("Unknown SDK operation")
  }
}
