#!/usr/bin/env bun

import { $ } from "bun"
import { Script, releaseMetadata } from "@awsesh/script"
import path from "node:path"
import { digest, requireRepository, sdkArchive } from "../../scripts/release"

async function registryMetadata() {
  const response = await fetch(`https://registry.npmjs.org/@awsesh%2fcore/${Script.version}`)
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`npm lookup failed: ${response.status}`)
  const metadata: unknown = await response.json()
  if (!metadata || typeof metadata !== "object" || !("dist" in metadata)
    || !metadata.dist || typeof metadata.dist !== "object" || !("integrity" in metadata.dist)
    || typeof metadata.dist.integrity !== "string") throw new Error("npm returned invalid package integrity")
  return metadata.dist.integrity
}

export async function publishPackage() {
  requireRepository()
  const directory = process.env.AWSESH_ARTIFACTS
  if (!directory) throw new Error("Verified staged artifacts are required")
  const archive = path.join(directory, sdkArchive)
  const integrity = `sha512-${Buffer.from(await digest(archive, "sha512"), "hex").toString("base64")}`
  const published = await registryMetadata()
  if (published && published !== integrity) throw new Error("Published npm version differs from the staged package")
  if (published) return
  await $`bun x --package npm@11.21.0 npm publish ${archive} --ignore-scripts --access public --provenance --tag candidate`
  const deadline = Date.now() + 5 * 60 * 1000
  for (let delay = 2000; ; delay = Math.min(delay * 2, 30000)) {
    const result = await registryMetadata()
    if (result === integrity) return
    if (result) throw new Error("Published npm version differs from the staged package")
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error("npm registry propagation timed out; retry publication with the same tag")
    const wait = Math.min(delay, remaining)
    console.log(`Waiting ${Math.ceil(wait / 1000)}s for npm registry propagation`)
    await Bun.sleep(wait)
  }
}

export async function updateChannel() {
  requireRepository()
  const response = await fetch(`https://registry.npmjs.org/@awsesh%2fcore/${Script.channel}`)
  if (response.status !== 404) {
    if (!response.ok) throw new Error(`npm channel lookup failed: ${response.status}`)
    const metadata: unknown = await response.json()
    if (!metadata || typeof metadata !== "object" || !("version" in metadata) || typeof metadata.version !== "string") {
      throw new Error("npm returned an invalid channel version")
    }
    releaseMetadata(metadata.version, Script.channel)
    if (Bun.semver.order(metadata.version, Script.version) > 0) {
      console.log(`Not moving npm ${Script.channel} backwards from ${metadata.version}`)
      return
    }
  }
  await $`bun x --package npm@11.21.0 npm dist-tag add @awsesh/core@${Script.version} ${Script.channel}`
}
