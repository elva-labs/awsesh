#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@awsesh/script"
import { fileURLToPath } from "node:url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const { binaries } = await import("./build.ts")

{
  const name = `awsesh-${process.platform}-${process.arch}`
  console.log(`smoke test: running dist/${name}/bin/awsesh --version`)
  await $`./dist/${name}/bin/awsesh --version`
}

for (const key of Object.keys(binaries)) {
  if (key.includes("linux")) {
    await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
  } else {
    await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
  }
}
