import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Sessions } from "@awsesh/core"

test("native workspace protocol and desktop preferences remain local", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sesh-native-"))
  const config = path.join(root, "config", "awsesh")
  const data = path.join(root, "data", "awsesh")
  const session = { name: "Lantmännen", startUrl: "https://example.awsapps.com/start", ssoRegion: "eu-north-1", defaultRegion: "eu-north-1" }
  try {
    const child = Bun.spawn([process.execPath, "run", path.join(import.meta.dir, "index.ts")], {
      env: {
        ...process.env,
        HOME: root,
        USERPROFILE: root,
        XDG_CONFIG_HOME: path.join(root, "config"),
        XDG_DATA_HOME: path.join(root, "data"),
        AWS_EC2_METADATA_DISABLED: "true",
        AWS_ENDPOINT_URL: "http://127.0.0.1:1",
      },
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
      timeout: 10000,
    })
    const requests = [
      { operation: "snapshot" },
      { operation: "saveSession", args: { ...session, creating: true } },
      { operation: "setAppearance", args: { mode: "dark" } },
      { operation: "setUseWslWorkspace", args: { enabled: false } },
      { operation: "getAppearance" },
      { operation: "setUseWslWorkspace", args: { enabled: "true" } },
      { operation: "snapshot" },
      { operation: "saveSession", args: { ...session, name: "Renamed / 東京", originalName: session.name } },
      { operation: "snapshot", args: { name: session.name } },
    ]
    child.stdin.write(requests.map(request => JSON.stringify(request)).join("\n") + "\n")
    child.stdin.end()
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect(stderr).toBe("")
    expect(code).toBe(0)
    const responses = stdout.trim().split("\n").map(line => JSON.parse(line))
    expect(responses).toHaveLength(requests.length)
    expect(responses[0].result.sessions).toEqual([])
    expect(responses[1].result.sessions[0].name).toBe(session.name)
    expect(responses[3].result.enabled).toBe(false)
    expect(responses[3].result.snapshot.sessions[0].name).toBe(session.name)
    expect(responses[4].result.mode).toBe("dark")
    expect(responses[5].error).toContain("boolean")
    expect(responses[6].result.sessions[0].name).toBe(session.name)
    expect(responses[7].result.sessions.map((value: { name: string }) => value.name)).toEqual(["Renamed / 東京"])
    expect(responses[8].error).toContain("not found")
    expect((await Sessions.create({ dir: path.join(config, "sessions") }).load("Renamed / 東京"))?.name).toBe("Renamed / 東京")
    expect((await Bun.file(path.join(config, "desktop.json")).json()).mode).toBe("dark")
    expect((await Bun.file(path.join(config, "workspace.json")).json()).useWslWorkspace).toBe(false)
    expect(await Bun.file(path.join(data, "storage", "preference", "desktop-appearance.json")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 15000)
