import { chmod, cp, mkdir } from "node:fs/promises"
import path from "node:path"

if (process.platform !== "darwin") throw new Error("Sesh.app must be built on macOS")
const directory = path.resolve(import.meta.dir, "..")
const contents = path.join(directory, "dist", "Sesh.app", "Contents")
const binaries = path.join(contents, "MacOS")
await mkdir(binaries, { recursive: true })
await mkdir(path.join(contents, "Resources"), { recursive: true })

async function run(command: string[]) {
  const process = Bun.spawn(command, { cwd: directory, stdout: "inherit", stderr: "inherit" })
  if (await process.exited !== 0) throw new Error(`Build command failed: ${command[0]}`)
}

await run(["cargo", "build", "--release", "--locked"])
await run([process.execPath, "build", "bridge/index.ts", "--compile", "--outfile", path.join(binaries, "awsesh-sdk")])
await cp(path.join(directory, "target", "release", "sesh"), path.join(binaries, "sesh"))
await chmod(path.join(binaries, "sesh"), 0o755)
await chmod(path.join(binaries, "awsesh-sdk"), 0o755)
const metadata: unknown = await Bun.file(path.join(directory, "package.json")).json()
if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || typeof metadata.version !== "string" || !/^[0-9.]+$/.test(metadata.version)) {
  throw new Error("Invalid application version")
}
await Bun.write(path.join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Sesh</string>
  <key>CFBundleDisplayName</key><string>Sesh</string>
  <key>CFBundleIdentifier</key><string>se.elva.awsesh.desktop</string>
  <key>CFBundleExecutable</key><string>sesh</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${metadata.version}</string>
  <key>CFBundleVersion</key><string>${metadata.version}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`)
await run(["codesign", "--force", "--sign", "-", path.join(binaries, "awsesh-sdk")])
await run(["codesign", "--force", "--sign", "-", path.join(directory, "dist", "Sesh.app")])
console.log(`Built ${path.join(directory, "dist", "Sesh.app")}`)
