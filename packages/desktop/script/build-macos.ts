import { chmod, cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { compileHelper, desktopDirectory, desktopMetadata, run } from "./shared"

export async function buildMacos() {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Sesh.app must be built on ARM64 macOS")
  const directory = desktopDirectory
  const app = path.join(directory, "dist", "Sesh.app")
  const { version, base, number } = await desktopMetadata()
  const contents = path.join(app, "Contents")
  const binaries = path.join(contents, "MacOS")
  await rm(app, { recursive: true, force: true })
  await mkdir(binaries, { recursive: true })
  await mkdir(path.join(contents, "Resources"), { recursive: true })
  await cp(path.join(directory, "assets/AppIcon.icns"), path.join(contents, "Resources/AppIcon.icns"))
  await run(["cargo", "build", "--release", "--locked", "--target", "aarch64-apple-darwin"], { MACOSX_DEPLOYMENT_TARGET: "13.0" })
  await compileHelper(path.join(binaries, "awsesh-sdk"), "bun-darwin-arm64")
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
  <key>CFBundleIconFile</key><string>AppIcon.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${base}</string>
  <key>CFBundleVersion</key><string>${number ?? version}</string>
  <key>AWSESHReleaseVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`)
  await run(["codesign", "--force", "--sign", "-", path.join(binaries, "awsesh-sdk")])
  await run(["codesign", "--force", "--sign", "-", path.join(directory, "dist", "Sesh.app")])
  console.log(`Built ${app}`)
}
