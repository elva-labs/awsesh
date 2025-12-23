#!/usr/bin/env bun

import solidPlugin from "../node_modules/@opentui/solid/scripts/solid-plugin"
import path from "node:path"
import fs from "node:fs"
import { $ } from "bun"
import { fileURLToPath } from "node:url"

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const dir = path.resolve(dirname, "..")

process.chdir(dir)

import pkg from "../package.json"
import { Script } from "@awsesh/script"

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl", avx2: false },
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "darwin", arch: "x64", avx2: false },
  { os: "win32", arch: "x64" },
  { os: "win32", arch: "x64", avx2: false },
]

const targets = singleFlag
  ? allTargets.filter((item) => {
      if (item.os !== process.platform || item.arch !== process.arch) {
        return false
      }
      if (item.avx2 === false) {
        return baselineFlag
      }
      return true
    })
  : allTargets

await $`rm -rf dist`

const binaries: Record<string, string> = {}

if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
}

for (const item of targets) {
  const name = [
    "awsesh",
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")

  console.log(`building ${name}`)
  await $`mkdir -p dist/${name}/bin`

  const parserWorker = fs.realpathSync(path.resolve(dir, "./node_modules/@opentui/core/parser.worker.js"))
  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerRelativePath = path.relative(dir, parserWorker).replaceAll("\\", "/")

  const result = await Bun.build({
    conditions: ["browser"],
    tsconfig: "./tsconfig.json",
    plugins: [solidPlugin],
    sourcemap: "external",
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      // @ts-expect-error bun types not up to date
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: name.replace("awsesh", "bun") as Parameters<typeof Bun.build>[0]["compile"]["target"],
      outfile: `dist/${name}/bin/awsesh`,
      execArgv: [`--user-agent=awsesh/${Script.version}`, "--"],
      windows: {},
    },
    entrypoints: ["./src/index.ts", parserWorker],
    define: {
      AWSESH_VERSION: `'${Script.version}'`,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + workerRelativePath,
      AWSESH_CHANNEL: `'${Script.channel}'`,
      AWSESH_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "''",
    },
  })

  if (!result.success) {
    console.error(`Build failed for ${name}:`)
    for (const log of result.logs) {
      console.error(log)
    }
    throw new Error(`Build failed for ${name}`)
  }

  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name,
        version: Script.version,
        os: [item.os],
        cpu: [item.arch],
      },
      null,
      2,
    ),
  )
  binaries[name] = Script.version
}

export { binaries }
