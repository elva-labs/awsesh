import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { compileHelper, desktopDirectory, desktopMetadata, run, zipDirectory } from "./shared"
import { verifyHelper } from "./helper"
import { verifyWindowsPackage } from "./verify-windows"

export const windowsTarget = "x86_64-pc-windows-msvc"
export const windowsArchive = "awsesh-desktop-win32-x64.zip"

export async function buildWindows() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("The Windows client must be built on Windows x64")
  const directory = desktopDirectory
  const staging = path.join(directory, "dist", "Sesh")
  const archive = path.join(directory, "dist", windowsArchive)
  const { version } = await desktopMetadata()
  await rm(staging, { recursive: true, force: true })
  await rm(archive, { force: true })
  try {
    await mkdir(staging, { recursive: true })
    await run(["cargo", "build", "--release", "--locked", "--target", windowsTarget], {
      AWSESH_RELEASE_VERSION: version,
      RUSTFLAGS: "-C target-feature=+crt-static",
    })
    await compileHelper(path.join(staging, "awsesh-sdk.exe"), "bun-windows-x64")
    await verifyHelper(path.join(staging, "awsesh-sdk.exe"))
    await cp(path.join(directory, "target", windowsTarget, "release", "sesh.exe"), path.join(staging, "sesh.exe"))
    await cp(path.resolve(directory, "..", "..", "LICENSE"), path.join(staging, "LICENSE"))
    await zipDirectory(staging, archive)
    await verifyWindowsPackage(staging, archive, version)
    console.log(`Built ${archive}`)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    await rm(archive, { force: true })
    throw error
  }
}
