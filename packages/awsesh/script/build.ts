#!/usr/bin/env bun

import solidPlugin from "@opentui/solid/bun-plugin"
import path from "node:path"
import { $ } from "bun"
import { fileURLToPath } from "node:url"
import { allTargets, targetName } from "./targets"

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const dir = path.resolve(dirname, "..")

process.chdir(dir)

import pkg from "../package.json"
import { Script } from "@awsesh/script"

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")

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
  const name = targetName(item)

  console.log(`building ${name}`)
  await $`mkdir -p dist/${name}/bin`

  const result = await Bun.build({
    conditions: ["browser"],
    tsconfig: "./tsconfig.json",
    plugins: [solidPlugin],
    sourcemap: "external",
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: item.compile,
      outfile: `dist/${name}/bin/awsesh${item.os === "win32" ? ".exe" : ""}`,
      execArgv: [`--user-agent=awsesh/${Script.version}`, "--"],
      windows: {},
    },
    entrypoints: ["./src/index.ts"],
    define: {
      AWSESH_VERSION: `'${Script.version}'`,
      AWSESH_CHANNEL: `'${Script.channel}'`,
      "process.env.OPENTUI_LIBC": item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "undefined",
    },
  })

  if (!result.success) {
    console.error(`Build failed for ${name}:`)
    for (const log of result.logs) {
      console.error(log)
    }
    throw new Error(`Build failed for ${name}`)
  }

  // Bun leaves darwin binaries with an invalid ad-hoc signature, which macOS kills on launch
  if (item.os === "darwin") {
    const binary = `dist/${name}/bin/awsesh`
    if (process.platform === "darwin") {
      await $`codesign --force --sign - --identifier awsesh ${binary}`
    } else {
      await $`rcodesign sign --binary-identifier awsesh ${binary}`
    }
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
