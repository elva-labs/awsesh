import path from "node:path"
import { createInterface } from "node:readline"
import { configureAppearance, prepareThemeDirectory } from "./appearance"
import { awsesh, configDir, dataDir, dispatchWorkflow } from "./workflow"
import { isWslAvailable, WslWorkspace } from "./wsl"

const helperPath = path.basename(process.execPath).toLowerCase() === "awsesh-sdk.exe"
  ? path.join(path.dirname(process.execPath), "awsesh-sdk-linux-x64")
  : path.resolve(import.meta.dir, "../dist/Sesh/awsesh-sdk-linux-x64")
const workspace = new WslWorkspace(configDir, helperPath)

async function dispatch(request: unknown) {
  if (typeof request !== "object" || request === null || !("operation" in request) || typeof request.operation !== "string") throw new Error("Invalid SDK request")
  const args = "args" in request ? request.args : {}
  if (typeof args !== "object" || args === null || Array.isArray(args)) throw new Error("Invalid SDK arguments")
  const values = args as Record<string, unknown>
  switch (request.operation) {
    // Desktop preferences remain local, regardless of the selected AWS workspace.
    case "getAppearance": return configureAppearance(configDir, dataDir)
    case "setAppearance": return configureAppearance(configDir, dataDir, values)
    case "openThemeDirectory": return prepareThemeDirectory(configDir)
    case "wslStatus": return { available: await isWslAvailable(), enabled: await workspace.enabled() }
    case "setUseWslWorkspace": {
      if (typeof values.enabled !== "boolean") throw new Error("Expected a boolean enabled argument")
      let snapshot: unknown
      if (values.enabled) {
        snapshot = await workspace.enable()
      } else {
        snapshot = await dispatchWorkflow("snapshot", {})
        await workspace.disable()
      }
      return { enabled: values.enabled, snapshot }
    }
    default: return await workspace.enabled()
      ? workspace.request(request.operation, values)
      : dispatchWorkflow(request.operation, values)
  }
}

// credential_process for profiles the desktop app manages; stdout carries only the JSON
const [command, subcommand, profile] = process.argv.slice(2)
if (command === "profiles" && subcommand === "creds") {
  try {
    if (!profile) throw new Error("Usage: awsesh-sdk profiles creds <name>")
    process.stdout.write(`${JSON.stringify(await awsesh.profiles.credentials(profile))}\n`)
    process.exit(0)
  } catch (error) {
    process.stderr.write(`sesh: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

// Keeps credential_process pointing at this helper after the app moves or updates
if (!await workspace.enabled()) {
  await awsesh.profiles.list()
    .then((profiles) => profiles.length > 0 ? awsesh.profiles.sync() : undefined)
    .catch((error) => process.stderr.write(`sesh: could not sync AWS profiles: ${error instanceof Error ? error.message : String(error)}\n`))
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
try {
  for await (const line of lines) {
    try {
      const result = await dispatch(JSON.parse(line))
      process.stdout.write(`${JSON.stringify({ result: result ?? null })}\n`)
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "SDK operation failed" })}\n`)
    }
  }
} finally {
  await workspace.close()
}
