import { homedir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { createAwsesh, createWorkflow } from "@awsesh/core"
import { configureAppearance, prepareThemeDirectory } from "./appearance"

const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "awsesh")
const dataDir = path.join(process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share"), "awsesh")
const configPath = path.join(configDir, "config.json")
const defaultAwsDir = path.join(homedir(), ".aws")

// WSL credential targeting (Windows only) - swaps awsDir between Windows and WSL
let wslDirCache: string | undefined | null = null

async function spawn(cmd: string[]): Promise<{ stdout: string; code: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const code = await proc.exited
  return { stdout, code }
}

async function resolveWslAwsDir(): Promise<string | undefined> {
  if (wslDirCache !== null) return wslDirCache
  try {
    const { stdout, code } = await spawn(["wsl", "sh", "-c", "wslpath -w ~/.aws"])
    wslDirCache = code === 0 && stdout.trim() ? stdout.trim() : undefined
  } catch { wslDirCache = undefined }
  return wslDirCache
}

async function resolveAwsDir(): Promise<string> {
  if (process.platform !== "win32") return defaultAwsDir
  try {
    const config = await Bun.file(configPath).json().catch(() => ({}))
    if (!config.useWslCredentials) return defaultAwsDir
  } catch { return defaultAwsDir }
  return await resolveWslAwsDir() ?? defaultAwsDir
}

async function isWslAvailable(): Promise<boolean> {
  if (process.platform !== "win32") return false
  if (!Bun.which("wsl")) return false
  try {
    const { stdout } = await spawn(["wsl", "--list", "--quiet"])
    return stdout.replace(/\0/g, "").trim().length > 0
  } catch { return false }
}

async function setUseWslCredentials(enabled: boolean): Promise<void> {
  let config: Record<string, unknown> = {}
  try { config = await Bun.file(configPath).json() } catch {}
  if (enabled) { config.useWslCredentials = true } else { delete config.useWslCredentials }
  await Bun.write(configPath, JSON.stringify(config, null, 2))
}

const workflow = createWorkflow(createAwsesh({
  configDir,
  dataDir,
  awsDir: defaultAwsDir,
  resolveAwsDir,
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
    case "getAppearance": return configureAppearance(configDir, dataDir)
    case "setAppearance": return configureAppearance(configDir, dataDir, args)
    case "openThemeDirectory": return prepareThemeDirectory(configDir)
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
    case "clearAllCredentials": return workflow.clearAllCredentials(name)
    case "signOut": return workflow.signOut(string(name))
    case "wslStatus": {
      const available = await isWslAvailable()
      let enabled = false
      try { enabled = !!(await Bun.file(configPath).json()).useWslCredentials } catch {}
      return { available, enabled }
    }
    case "setUseWslCredentials": {
      if (!("enabled" in args)) throw new Error("Missing enabled argument")
      await setUseWslCredentials(!!args.enabled)
      return { enabled: !!args.enabled }
    }
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
