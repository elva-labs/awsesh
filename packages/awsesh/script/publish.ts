#!/usr/bin/env bun
import { $ } from "bun"
import { Script } from "@awsesh/script"
import { fileURLToPath } from "node:url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const { binaries } = await import("./build.ts")

{
  const name = `awsesh-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
  console.log(`smoke test: running dist/${name}/bin/awsesh --version`)
  const version = await $`./dist/${name}/bin/awsesh --version`.text()
  if (version.trim() !== Script.version) throw new Error(`CLI version mismatch: ${version.trim()}`)
}

for (const key of Object.keys(binaries)) {
  if (key.includes("linux")) {
    await $`tar -czf ../../${key}.tar.gz awsesh`.cwd(`dist/${key}/bin`)
  } else {
    const binary = key.includes("windows") ? "awsesh.exe" : "awsesh"
    await $`zip ../../${key}.zip ${binary}`.cwd(`dist/${key}/bin`)
  }
}
