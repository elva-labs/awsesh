#!/usr/bin/env bun

import { $ } from "bun"
import path from "node:path"
import { releaseMetadata } from "../script/src/version"
import { desktopManifests } from "./release"

const version = process.argv[2]
if (!version || process.argv.length !== 3) throw new Error("Usage: bun run release:prepare <version>")
releaseMetadata(version, process.env.AWSESH_CHANNEL)

const root = path.resolve(import.meta.dir, "../..")
const files = ["package.json", ...await Array.fromAsync(new Bun.Glob("packages/*/package.json").scan({ cwd: root }))]
const manifests = await Promise.all(files.map(async (file) => {
  const location = path.join(root, file)
  const manifest: unknown = await Bun.file(location).json()
  if (!manifest || typeof manifest !== "object" || !("version" in manifest) || typeof manifest.version !== "string") {
    throw new Error(`Missing manifest version: ${file}`)
  }
  return { location, manifest }
}))
const desktop = await desktopManifests()

for (const item of manifests) {
  item.manifest.version = version
  await Bun.write(item.location, JSON.stringify(item.manifest, null, 2) + "\n")
}
for (const item of desktop) {
  await Bun.write(item.location, item.contents.replace(item.pattern, (_match: string, prefix: string, _current: string, suffix: string) => prefix + version + suffix))
}
await $`bun install --lockfile-only --ignore-scripts`.cwd(root)
console.log(`Prepared ${version}; review and commit the JSON/Cargo manifests and lockfiles in a version PR.`)
