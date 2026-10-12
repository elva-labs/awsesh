import { chmod, cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { releaseMetadata } from "../../script/src/version"

export const linuxTarget = "x86_64-unknown-linux-gnu"
export const linuxArchive = "awsesh-desktop-linux-x64.tar.gz"

export async function buildLinux() {
  if (process.platform !== "linux" || process.arch !== "x64") throw new Error("The Linux client must be built on Linux x64")
  const directory = path.resolve(import.meta.dir, "..")
  const metadata: unknown = await Bun.file(path.join(directory, "package.json")).json()
  if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || typeof metadata.version !== "string") {
    throw new Error("Invalid application version")
  }
  const release = releaseMetadata(metadata.version, process.env.AWSESH_CHANNEL)
  const dist = path.join(directory, "dist", "sesh-linux-x64")
  const archive = path.join(directory, "dist", linuxArchive)
  await rm(dist, { recursive: true, force: true })
  await rm(archive, { force: true })

  async function run(command: string[]) {
    const process = Bun.spawn(command, { cwd: directory, stdout: "inherit", stderr: "inherit" })
    if (await process.exited !== 0) throw new Error(`Build command failed: ${command[0]}`)
  }

  try {
    await mkdir(dist, { recursive: true })
    await run(["cargo", "build", "--release", "--locked", "--target", linuxTarget])

    const helper = await Bun.build({
      entrypoints: [path.join(directory, "bridge/index.ts")],
      compile: {
        target: "bun-linux-x64" as any,
        outfile: path.join(dist, "awsesh-sdk"),
        autoloadDotenv: false,
        autoloadBunfig: false,
      },
    })
    if (!helper.success) throw new AggregateError(helper.logs, "SDK helper compilation failed")

    await cp(path.join(directory, "target", linuxTarget, "release", "sesh"), path.join(dist, "sesh"))
    await chmod(path.join(dist, "sesh"), 0o755)
    await chmod(path.join(dist, "awsesh-sdk"), 0o755)

    await Bun.write(path.join(dist, "sesh.desktop"), `[Desktop Entry]
Name=Sesh
Comment=AWS session manager
Exec=sesh
Icon=sesh
Terminal=false
Type=Application
Categories=Development;Utility;
`)

    await run(["tar", "-czf", archive, "-C", dist, "sesh", "awsesh-sdk", "sesh.desktop"])
    console.log(`Built ${archive} (${release.version})`)
  } catch (error) {
    await rm(dist, { recursive: true, force: true })
    await rm(archive, { force: true })
    throw error
  }
}

if (import.meta.main) await buildLinux()
