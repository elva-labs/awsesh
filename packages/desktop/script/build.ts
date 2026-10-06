import { chmod, cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { releaseMetadata } from "../../script/src/version"

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Sesh.app must be built on ARM64 macOS")
const directory = path.resolve(import.meta.dir, "..")
const app = path.join(directory, "dist", "Sesh.app")
const metadata: unknown = await Bun.file(path.join(directory, "package.json")).json()
if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || typeof metadata.version !== "string") {
  throw new Error("Invalid application version")
}
const release = releaseMetadata(metadata.version, process.env.AWSESH_CHANNEL)
const version = release.version.split("-")[0]
const number = process.env.GITHUB_RUN_NUMBER
if (number !== undefined && (!/^[1-9]\d*$/.test(number) || !Number.isSafeInteger(Number(number)))) {
  throw new Error("GITHUB_RUN_NUMBER must be a positive safe integer")
}
if (process.env.GITHUB_ACTIONS === "true" && number === undefined) throw new Error("GITHUB_RUN_NUMBER is required in CI")
const contents = path.join(app, "Contents")
const binaries = path.join(contents, "MacOS")
await rm(app, { recursive: true, force: true })
await mkdir(binaries, { recursive: true })
await mkdir(path.join(contents, "Resources"), { recursive: true })

async function run(command: string[]) {
  const process = Bun.spawn(command, { cwd: directory, env: { ...Bun.env, MACOSX_DEPLOYMENT_TARGET: "13.0" }, stdout: "inherit", stderr: "inherit" })
  if (await process.exited !== 0) throw new Error(`Build command failed: ${command[0]}`)
}

await run(["cargo", "build", "--release", "--locked", "--target", "aarch64-apple-darwin"])
const helper = await Bun.build({
  entrypoints: [path.join(directory, "bridge/index.ts")],
  compile: {
    target: "bun-darwin-arm64",
    outfile: path.join(binaries, "awsesh-sdk"),
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
})
if (!helper.success) throw new AggregateError(helper.logs, "SDK helper compilation failed")
await cp(path.join(directory, "target", "aarch64-apple-darwin", "release", "sesh"), path.join(binaries, "sesh"))
await chmod(path.join(binaries, "sesh"), 0o755)
await chmod(path.join(binaries, "awsesh-sdk"), 0o755)
await Bun.write(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Sesh</string>
  <key>CFBundleDisplayName</key><string>Sesh</string>
  <key>CFBundleIdentifier</key><string>se.elva.awsesh.desktop</string>
  <key>CFBundleExecutable</key><string>sesh</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${number ?? version}</string>
  <key>AWSESHReleaseVersion</key><string>${release.version}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`)
await run(["codesign", "--force", "--sign", "-", path.join(binaries, "awsesh-sdk")])
await run(["codesign", "--force", "--sign", "-", path.join(directory, "dist", "Sesh.app")])
console.log(`Built ${path.join(directory, "dist", "Sesh.app")}`)
