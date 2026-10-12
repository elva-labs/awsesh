import { chmod, cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { releaseMetadata } from "../../script/src/version"
import { desktopLinuxArchive } from "../../scripts/release"

if (process.platform !== "linux") throw new Error("Linux build must run on Linux")
if (process.arch !== "x64") throw new Error(`Unsupported architecture: ${process.arch}`)
const directory = path.resolve(import.meta.dir, "..")
const metadata: unknown = await Bun.file(path.join(directory, "package.json")).json()
if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || typeof metadata.version !== "string") {
  throw new Error("Invalid application version")
}
const release = releaseMetadata(metadata.version, process.env.AWSESH_CHANNEL)
const dist = path.join(directory, "dist", "sesh-linux-x64")
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

async function run(command: string[]) {
  const process = Bun.spawn(command, { cwd: directory, stdout: "inherit", stderr: "inherit" })
  if (await process.exited !== 0) throw new Error(`Build command failed: ${command[0]}`)
}

await run(["cargo", "build", "--release", "--locked", "--target", "x86_64-unknown-linux-gnu"])

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

await cp(path.join(directory, "target/x86_64-unknown-linux-gnu/release/sesh"), path.join(dist, "sesh"))
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

// Create release archive (flat, no directory prefix - matches CLI archive pattern)
const archive = path.join(directory, "dist", desktopLinuxArchive)
await rm(archive, { force: true })
await run(["tar", "-czf", archive, "-C", dist, "sesh", "awsesh-sdk", "sesh.desktop"])

console.log(`Built ${dist} (${release.version})`)
