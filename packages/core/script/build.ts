#!/usr/bin/env bun
import { $ } from "bun"
import { Script } from "@awsesh/script"
import { fileURLToPath } from "node:url"
import path from "node:path"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const distDir = path.join(dir, "dist")
await $`rm -rf ${distDir}`
await $`mkdir -p ${distDir}`

const pkg = await Bun.file(path.join(dir, "package.json")).json()

const distPkg = {
  name: pkg.name,
  version: Script.version,
  description: pkg.description,
  type: "module",
  main: "./index.js",
  types: "./index.d.ts",
  exports: {
    ".": {
      types: "./index.d.ts",
      import: "./index.js",
    },
  },
  dependencies: pkg.dependencies,
  peerDependencies: pkg.peerDependencies,
  license: "MIT",
  repository: {
    type: "git",
    url: "git+https://github.com/elva-labs/awsesh.git",
  },
}

await Bun.file(path.join(distDir, "package.json")).write(JSON.stringify(distPkg, null, 2))

await $`bun build ./src/index.ts --outdir ${distDir} --target node --format esm`

await $`bun run tsc --declaration --emitDeclarationOnly --outDir ${distDir}`
