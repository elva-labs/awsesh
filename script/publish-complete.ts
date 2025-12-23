#!/usr/bin/env bun

import { $ } from "bun"

const version = process.env.AWSESH_VERSION
if (!version) throw new Error("AWSESH_VERSION is required")

const isPreview = version.includes("-")

if (isPreview) {
  await $`gh release edit v${version} --draft=false --prerelease`
} else {
  await $`gh release edit v${version} --draft=false`
}

await $`gh release download v${version} --pattern "awsesh-linux-*64.tar.gz" --pattern "awsesh-darwin-*64.zip" -D dist`

await import("../packages/awsesh/script/publish-registries.ts")
