import path from "node:path"
import { zipSync } from "fflate"
import { releaseMetadata } from "../../script/src/version"

export const desktopDirectory = path.resolve(import.meta.dir, "..")

export interface DesktopMetadata {
  version: string
  base: string
  channel: string
  preview: boolean
  number: string | undefined
}

export async function desktopMetadata(): Promise<DesktopMetadata> {
  const metadata: unknown = await Bun.file(path.join(desktopDirectory, "package.json")).json()
  if (typeof metadata !== "object" || metadata === null || !("version" in metadata) || typeof metadata.version !== "string") {
    throw new Error("Invalid application version")
  }
  const release = releaseMetadata(metadata.version, process.env.AWSESH_CHANNEL)
  const number = process.env.GITHUB_RUN_NUMBER
  if (number !== undefined && (!/^[1-9]\d*$/.test(number) || !Number.isSafeInteger(Number(number)))) {
    throw new Error("GITHUB_RUN_NUMBER must be a positive safe integer")
  }
  if (process.env.GITHUB_ACTIONS === "true" && number === undefined) throw new Error("GITHUB_RUN_NUMBER is required in CI")
  return { version: release.version, base: release.version.split("-")[0], channel: release.channel, preview: release.preview, number }
}

export async function run(command: string[], env: Record<string, string> = {}) {
  const child = Bun.spawn(command, {
    cwd: desktopDirectory,
    env: { ...Bun.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  })
  if (await child.exited !== 0) throw new Error(`Build command failed: ${command[0]}`)
}

export async function compileHelper(outfile: string, target: "bun-darwin-arm64" | "bun-windows-x64") {
  const helper = await Bun.build({
    entrypoints: [path.join(desktopDirectory, "bridge/index.ts")],
    compile: { target, outfile, autoloadDotenv: false, autoloadBunfig: false },
  })
  if (!helper.success) throw new AggregateError(helper.logs, "SDK helper compilation failed")
}

export async function zipDirectory(source: string, outfile: string) {
  const root = path.basename(source)
  const files: Record<string, Uint8Array> = {}
  for await (const entry of new Bun.Glob("**/*").scan({ cwd: source, onlyFiles: true })) {
    const relative = entry.split(path.sep).join("/")
    files[`${root}/${relative}`] = new Uint8Array(await Bun.file(path.join(source, relative)).arrayBuffer())
  }
  await Bun.write(outfile, zipSync(files, { level: 9, mtime: new Date(Date.UTC(1980, 0, 1)) }))
}
