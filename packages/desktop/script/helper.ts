import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

function environment(root: string): Record<string, string | undefined> {
  const credentials = path.join(root, ".aws", "credentials")
  const shared: Record<string, string | undefined> = {
    HOME: root,
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    AWS_CONFIG_FILE: path.join(root, ".aws", "config"),
    AWS_SHARED_CREDENTIALS_FILE: credentials,
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_ENDPOINT_URL: "http://127.0.0.1:1",
  }
  if (process.platform !== "win32") return { ...shared, PATH: "/usr/bin:/bin" }
  return {
    ...shared,
    USERPROFILE: root,
    TEMP: path.join(root, "tmp"),
    TMP: path.join(root, "tmp"),
    SystemRoot: process.env.SystemRoot,
    windir: process.env.windir,
    SystemDrive: process.env.SystemDrive,
    ComSpec: process.env.ComSpec,
    PATHEXT: process.env.PATHEXT,
    NUMBER_OF_PROCESSORS: process.env.NUMBER_OF_PROCESSORS,
    PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE,
    OS: process.env.OS,
  }
}

function parseResponse(line: string): Record<string, unknown> {
  const value: unknown = JSON.parse(line)
  if (typeof value !== "object" || value === null) throw new Error("SDK helper response is not an object")
  return value as Record<string, unknown>
}

function expectEmptySnapshot(response: Record<string, unknown>, label: string) {
  const snapshot = response["result"]
  if (typeof snapshot !== "object" || snapshot === null) throw new Error(`${label}: missing snapshot result`)
  const value = snapshot as Record<string, unknown>
  for (const key of ["sessions", "accounts", "credentials"]) {
    if (!Array.isArray(value[key]) || value[key].length !== 0) throw new Error(`${label}: snapshot is not isolated and empty (${key})`)
  }
}

function expectDefaultAppearance(response: Record<string, unknown>) {
  const appearance = response["result"]
  if (typeof appearance !== "object" || appearance === null) throw new Error("Missing appearance result")
  const value = appearance as Record<string, unknown>
  if (value["theme"] !== "system" || value["mode"] !== "system") throw new Error("SDK helper did not return the default appearance")
  if (!Array.isArray(value["themes"]) || value["themes"].length === 0) throw new Error("SDK helper returned no themes")
}

/**
 * Starts the compiled SDK helper in an isolated home, exercises the JSON-lines
 * protocol (valid requests, an unknown operation, malformed input, then recovery),
 * and asserts exact response count and shape. Never touches real AWS configuration.
 */
export async function verifyHelper(binary: string) {
  const root = await mkdtemp(path.join(tmpdir(), "awsesh-helper-"))
  try {
    await mkdir(path.join(root, "tmp"), { recursive: true, mode: 0o700 })
    const child = Bun.spawn([binary], {
      cwd: root,
      env: environment(root),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30000,
      killSignal: "SIGKILL",
    })
    child.stdin.write(
      [
        JSON.stringify({ operation: "snapshot" }),
        JSON.stringify({ operation: "getAppearance" }),
        JSON.stringify({ operation: "notARealOperation" }),
        "{",
        JSON.stringify({ operation: "snapshot" }),
      ].join("\n") + "\n",
    )
    child.stdin.end()
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (status !== 0) throw new Error(`Standalone SDK helper failed (exit ${status}): ${stderr.trim()}`)
    const lines = stdout.trim().split("\n").filter((line) => line.length > 0)
    if (lines.length !== 5) throw new Error(`Unexpected SDK helper response count: ${lines.length}`)
    const responses = lines.map(parseResponse)
    expectEmptySnapshot(responses[0], "snapshot")
    expectDefaultAppearance(responses[1])
    if (!responses[2]["error"]) throw new Error("Unknown operation was not rejected")
    if (!responses[3]["error"]) throw new Error("Malformed request was not rejected")
    expectEmptySnapshot(responses[4], "recovered snapshot")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
