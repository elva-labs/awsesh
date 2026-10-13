import { describe, expect, test } from "bun:test"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { isWslAvailable, readWorkspace, wslCommand, WslHelper, WslWorkspace } from "./wsl"

async function temporary() {
  return mkdtemp(path.join(tmpdir(), "sesh-workspace-"))
}

describe("workspace selection", () => {
  test("defaults to Windows without reinterpreting the old credential-only setting", async () => {
    const directory = await temporary()
    try {
      await Bun.write(path.join(directory, "config.json"), JSON.stringify({ useWslCredentials: true }))
      expect(await readWorkspace(directory)).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("reads selection and rejects corrupt settings rather than silently falling back", async () => {
    const directory = await temporary()
    try {
      await Bun.write(path.join(directory, "workspace.json"), JSON.stringify({ useWslWorkspace: true }))
      expect(await readWorkspace(directory)).toBe(true)
      await Bun.write(path.join(directory, "workspace.json"), JSON.stringify({ useWslWorkspace: "true" }))
      await expect(readWorkspace(directory)).rejects.toThrow("Invalid desktop workspace")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("a missing helper does not change the persisted selection", async () => {
    const directory = await temporary()
    const workspace = new WslWorkspace(directory, path.join(directory, "missing-helper"))
    try {
      await expect(workspace.enable()).rejects.toThrow()
      expect(await readWorkspace(directory)).toBe(false)
      await workspace.disable()
      expect(await readWorkspace(directory)).toBe(false)
    } finally {
      await workspace.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("passes helper paths separately from shell code", () => {
    const filename = "C:\\Sesh's apps\\日本語\\awsesh-sdk-linux-x64"
    const command = wslCommand(filename)
    expect(command.at(-1)).toBe(filename)
    expect(command[4]).not.toContain(filename)
    expect(command[4]).toContain('"$1"')
  })

  test.skipIf(process.platform !== "win32")("an unavailable selected WSL workspace fails without falling back", async () => {
    const directory = await temporary()
    const workspace = new WslWorkspace(directory, path.join(directory, "missing-helper"))
    try {
      await Bun.write(path.join(directory, "workspace.json"), JSON.stringify({ useWslWorkspace: true }))
      expect(await workspace.enabled()).toBe(true)
      const error = await workspace.request("snapshot", {}).catch(error => error)
      expect(String(error)).toContain("Linux SDK helper is missing")
      expect(await readWorkspace(directory)).toBe(true)
    } finally {
      await workspace.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe("helper transport", () => {
  test("uses the existing protocol, propagates errors, and recovers", async () => {
    const source = `import { createInterface } from "node:readline";
      for await (const line of createInterface({ input: process.stdin })) {
        const request = JSON.parse(line);
        process.stdout.write(JSON.stringify(request.operation === "bad" ? { error: "Rejected" } : { result: request.args }) + "\\n");
      }`
    const helper = new WslHelper([process.execPath, "--eval", source])
    try {
      expect(await helper.request("snapshot", { name: "one" })).toEqual({ name: "one" })
      const error = await helper.request("bad", {}).catch(error => error)
      expect(String(error)).toBe("Error: Rejected")
      expect(await helper.request("snapshot", { name: "two" })).toEqual({ name: "two" })
    } finally {
      await helper.close()
    }
  })

  test("reports helper exit", async () => {
    const helper = new WslHelper([process.execPath, "--eval", 'console.error("Cannot start Linux helper"); process.exit(1)'])
    try {
      const error = await helper.request("snapshot", {}, 5000).catch(error => error)
      expect(error).toBeInstanceOf(Error)
    } finally {
      await helper.close()
    }
  })

  test("bounds workspace startup time", async () => {
    const helper = new WslHelper([process.execPath, "--eval", 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0)); setInterval(() => {}, 1000)'])
    try {
      const error = await helper.request("snapshot", {}, 100).catch(error => error)
      expect(String(error)).toContain("did not respond")
    } finally {
      await helper.close()
    }
  })
})

const linuxHelper = path.resolve(import.meta.dir, "../dist/Sesh/awsesh-sdk-linux-x64")
const hasWslHelper = await Bun.file(linuxHelper).exists() && await isWslAvailable()

test.skipIf(!hasWslHelper)("switches a live WSL workspace without changing Windows state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "Sesh's 日本語 workspace-"))
  const config = path.join(root, "windows-config")
  const linux = path.join(root, "linux")
  const wrapper = path.join(root, "isolated-sdk")
  // This fixture overrides HOME/XDG before starting the actual compiled helper.
  // The production launcher and its path quoting are otherwise used unchanged.
  await cp(linuxHelper, path.join(root, "real-sdk"))
  await Bun.write(wrapper, `#!/bin/sh
set -eu
root="$(dirname "$0")/linux"
export HOME="$root" XDG_CONFIG_HOME="$root/config" XDG_DATA_HOME="$root/data" XDG_CACHE_HOME="$root/cache"
export AWS_EC2_METADATA_DISABLED=true AWS_ENDPOINT_URL=http://127.0.0.1:1
exec "$(dirname "$0")/real-sdk"
`)
  const appearance = JSON.stringify({ theme: "system", mode: "dark" })
  const nativeSession = JSON.stringify({ name: "native", startUrl: "https://example.awsapps.com/start", ssoRegion: "eu-north-1", defaultRegion: "eu-north-1" })
  await Bun.write(path.join(config, "desktop.json"), appearance)
  await Bun.write(path.join(config, "sessions", "native.json"), nativeSession)
  await Bun.write(path.join(root, "windows-credentials"), "Windows state must not change")
  await Bun.write(path.join(linux, ".aws", "credentials"), "[shared-admin]\naws_access_key_id = test-only\naws_secret_access_key = test-only\n")
  await Bun.write(path.join(linux, "data", "awsesh", "storage", "credentials", "active.json"), JSON.stringify([{
    profileName: "shared-admin", accountId: "123456789012", accountName: "Example", roleName: "Admin", sessionName: "shared", expiration: "2099-01-01T00:00:00.000Z", isDefault: false,
  }]))
  const workspace = new WslWorkspace(config, wrapper)
  try {
    expect(await workspace.enabled()).toBe(false)
    const initial = await workspace.enable() as { sessions: unknown[]; credentials: unknown[] }
    expect(initial.sessions).toEqual([])
    expect(initial.credentials).toHaveLength(1)
    expect(await readWorkspace(config)).toBe(true)
    await workspace.request("saveSession", {
      name: "shared", startUrl: "https://example.awsapps.com/start", ssoRegion: "eu-north-1", defaultRegion: "eu-north-1", creating: true,
    })
    const cleared = await workspace.request("clearCredential", { accountId: "123456789012", role: "Admin", profile: "shared-admin" }) as { credentials: unknown[] }
    expect(cleared.credentials).toEqual([])
    expect(await Bun.file(path.join(linux, ".aws", "credentials")).text()).not.toContain("shared-admin")
    await workspace.disable()
    expect(await workspace.enabled()).toBe(false)
    expect(await readWorkspace(config)).toBe(false)
    const reopened = await workspace.enable() as { sessions: { name: string }[] }
    expect(reopened.sessions.map(session => session.name)).toEqual(["shared"])
    expect(await Bun.file(path.join(config, "sessions", "native.json")).text()).toBe(nativeSession)
    expect(await Bun.file(path.join(config, "desktop.json")).text()).toBe(appearance)
    expect(await Bun.file(path.join(root, "windows-credentials")).text()).toBe("Windows state must not change")
  } finally {
    await workspace.close()
    await rm(root, { recursive: true, force: true })
  }
}, 60000)

test.skipIf(!hasWslHelper)("packaged Windows helper routes workspace operations to Linux and keeps appearance local", async () => {
  const root = await temporary()
  const config = path.join(root, "config")
  const wrapper = path.join(root, "awsesh-sdk-linux-x64")
  try {
    await cp(path.join(path.dirname(linuxHelper), "awsesh-sdk.exe"), path.join(root, "awsesh-sdk.exe"))
    await cp(linuxHelper, path.join(root, "real-sdk"))
    await Bun.write(wrapper, `#!/bin/sh
set -eu
root="$(dirname "$0")/linux"
export HOME="$root" XDG_CONFIG_HOME="$root/config" XDG_DATA_HOME="$root/data" XDG_CACHE_HOME="$root/cache"
export AWS_EC2_METADATA_DISABLED=true AWS_ENDPOINT_URL=http://127.0.0.1:1
exec "$(dirname "$0")/real-sdk"
`)
    const child = Bun.spawn([path.join(root, "awsesh-sdk.exe")], {
      cwd: root,
      env: { ...process.env, HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: config, XDG_DATA_HOME: path.join(root, "data"), AWS_EC2_METADATA_DISABLED: "true", AWS_ENDPOINT_URL: "http://127.0.0.1:1" },
      stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 45000,
    })
    const save = (name: string) => ({ operation: "saveSession", args: { name, startUrl: "https://example.awsapps.com/start", ssoRegion: "eu-north-1", defaultRegion: "eu-north-1", creating: true } })
    const requests = [
      save("native"),
      { operation: "setAppearance", args: { mode: "dark" } },
      { operation: "setUseWslWorkspace", args: { enabled: true } },
      save("linux"),
      { operation: "getAppearance" },
      { operation: "setUseWslWorkspace", args: { enabled: false } },
      { operation: "snapshot" },
      { operation: "setUseWslWorkspace", args: { enabled: true } },
      { operation: "snapshot" },
    ]
    child.stdin.write(requests.map(request => JSON.stringify(request)).join("\n") + "\n")
    child.stdin.end()
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect(stderr).toBe("")
    expect(code).toBe(0)
    const responses = stdout.trim().split("\n").map(line => JSON.parse(line))
    expect(responses).toHaveLength(requests.length)
    expect(responses.some(response => response.error)).toBe(false)
    expect(responses[2].result.snapshot.sessions).toEqual([])
    expect(responses[3].result.sessions[0].name).toBe("linux")
    expect(responses[4].result.mode).toBe("dark")
    expect(responses[5].result.snapshot.sessions[0].name).toBe("native")
    expect(responses[6].result.sessions[0].name).toBe("native")
    expect(responses[7].result.snapshot.sessions[0].name).toBe("linux")
    expect(responses[8].result.sessions[0].name).toBe("linux")
    expect((await Bun.file(path.join(config, "awsesh", "desktop.json")).json()).mode).toBe("dark")
    expect(await Bun.file(path.join(root, "linux", "config", "awsesh", "desktop.json")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60000)

test.skipIf(!hasWslHelper)("compiled Linux helper shares sessions, caches and preferences with another WSL client", async () => {
  // Only generated temporary Linux directories are used, never the user's AWS state.
  const script = `set -eu
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
export HOME="$root" XDG_CONFIG_HOME="$root/config" XDG_DATA_HOME="$root/data" XDG_CACHE_HOME="$root/cache"
export AWS_EC2_METADATA_DISABLED=true AWS_ENDPOINT_URL=http://127.0.0.1:1
helper=$(wslpath -u "$1")
mkdir -p "$XDG_DATA_HOME/awsesh/storage/accounts"
printf '%s' '{"accounts":[{"accountId":"123456789012","name":"Example","roles":["Admin"],"rolesLoaded":true}],"lastUpdated":0}' > "$XDG_DATA_HOME/awsesh/storage/accounts/shared.json"
printf '%s\\n' \
  '{"operation":"snapshot"}' \
  '{"operation":"saveSession","args":{"name":"shared","startUrl":"https://example.awsapps.com/start","ssoRegion":"eu-north-1","defaultRegion":"eu-north-1","creating":true}}' \
  '{"operation":"selectSession","args":{"name":"shared"}}' \
  '{"operation":"setRegion","args":{"name":"shared","accountId":"123456789012","region":"us-east-1"}}' \
  '{"operation":"setProfile","args":{"name":"shared","accountId":"123456789012","role":"Admin","profile":"shared-admin"}}' | "$helper"
test -f "$XDG_CONFIG_HOME/awsesh/sessions/shared.json"
printf '%s\\n' '{"operation":"snapshot","args":{"name":"shared"}}' | "$helper"`
  const child = Bun.spawn(["wsl", "--exec", "sh", "-c", script, "sesh-test", linuxHelper], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect(stderr).toBe("")
  expect(code).toBe(0)
  const responses = stdout.trim().split("\n").map(line => JSON.parse(line))
  expect(responses).toHaveLength(6)
  expect(responses.some(response => response.error)).toBe(false)
  expect(responses[0].result.sessions).toEqual([])
  const snapshot = responses[5].result
  expect(snapshot.sessions.map((session: { name: string }) => session.name)).toEqual(["shared"])
  expect(snapshot.lastSession).toBe("shared")
  expect(snapshot.accounts[0].region).toBe("us-east-1")
  expect(snapshot.accounts[0].profiles.Admin).toBe("shared-admin")
}, 60000)
