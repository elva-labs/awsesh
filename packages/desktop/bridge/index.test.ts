import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { Readable } from "node:stream"
import { createAwsesh, Sessions } from "@awsesh/core"

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
      { operation: "setAppearance", args: { compactAccounts: true } },
      { operation: "setAppearance", args: { compactAccounts: "true" } },
      { operation: "getAppearance" },
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
    expect(responses[4].result.compactAccounts).toBe(false)
    expect(responses[5].error).toContain("boolean")
    expect(responses[6].result.sessions[0].name).toBe(session.name)
    expect(responses[7].result.sessions.map((value: { name: string }) => value.name)).toEqual(["Renamed / 東京"])
    expect(responses[8].error).toContain("not found")
    expect(responses[10].error).toContain("Compact accounts must be a boolean")
    expect(responses[11].result).toMatchObject({ mode: "dark", compactAccounts: true })
    expect((await Sessions.create({ dir: path.join(config, "sessions") }).load("Renamed / 東京"))?.name).toBe("Renamed / 東京")
    expect(await Bun.file(path.join(config, "desktop.json")).json()).toMatchObject({ mode: "dark", compactAccounts: true })
    expect((await Bun.file(path.join(config, "workspace.json")).json()).useWslWorkspace).toBe(false)
    expect(await Bun.file(path.join(data, "storage", "preference", "desktop-appearance.json")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 15000)

test("foreground requests complete while AWS account revalidation is pending", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sesh-revalidation-"))
  const requested = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch() {
      requested.resolve()
      await release.promise
      return Response.json({ accountList: [{ accountId: "123456789012", accountName: "Updated" }] })
    },
  })
  const session = { name: "Example", startUrl: "https://example.awsapps.com/start", ssoRegion: "eu-north-1", defaultRegion: "eu-north-1" }
  const uncached = { ...session, name: "Uncached" }
  const awsesh = createAwsesh({
    configDir: path.join(root, "config", "awsesh"),
    dataDir: path.join(root, "data", "awsesh"),
    awsDir: path.join(root, ".aws"),
  })
  const child = Bun.spawn([process.execPath, "run", path.join(import.meta.dir, "index.ts")], {
    env: {
      ...process.env,
      HOME: root,
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_DATA_HOME: path.join(root, "data"),
      AWS_ENDPOINT_URL: server.url.href,
      AWS_ENDPOINT_URL_SSO: server.url.href,
    },
    stdin: "pipe", stdout: "pipe", stderr: "inherit",
    timeout: 5000,
  })
  const lines = createInterface({ input: Readable.from(child.stdout) })
  const replies = lines[Symbol.asyncIterator]()
  try {
    await awsesh.sessions.save(session)
    await awsesh.sessions.save(uncached)
    await awsesh.tokens.save(session.startUrl, "mock-token", new Date(Date.now() + 3600000))
    await awsesh.accounts.save(session.name, {
      lastUpdated: 0,
      accounts: [{ accountId: "123456789012", name: "Cached", roles: ["Admin"], rolesLoaded: true }],
    })
    child.stdin.write(`${JSON.stringify({ operation: "revalidateAccounts", id: 1, args: { name: session.name } })}\n`)
    await Promise.race([requested.promise, child.exited.then(() => { throw new Error("SDK stopped before contacting AWS") })])

    const snapshot = `${JSON.stringify({ operation: "snapshot", args: { name: session.name } })}\n`
    child.stdin.write(snapshot)
    expect(JSON.parse((await replies.next()).value ?? "null")).toMatchObject({ result: { accounts: [{ name: "Cached" }] } })

    child.stdin.write(`${JSON.stringify({
      operation: "selectSession", args: { name: uncached.name, cachedOnly: true },
    })}\n`)
    expect(JSON.parse((await replies.next()).value ?? "null")).toMatchObject({ result: { session: uncached.name, accounts: [] } })

    release.resolve()
    expect(JSON.parse((await replies.next()).value ?? "null")).toEqual({ id: 1, result: null })
    child.stdin.write(snapshot)
    expect(JSON.parse((await replies.next()).value ?? "null")).toMatchObject({ result: { accounts: [{ name: "Updated", roles: [], rolesLoaded: false }] } })
  } finally {
    lines.close()
    release.resolve()
    server.stop(true)
    child.stdin.end()
    await child.exited
    await rm(root, { recursive: true, force: true })
  }
}, 10000)
