#!/usr/bin/env bun

import { Script } from "@awsesh/script"
import { $ } from "bun"

if (!Script.preview) {
  await $`gh release edit v${Script.version} --draft=false`
} else {
  await $`gh release edit v${Script.version} --draft=false --prerelease`
}

await $`bun install`

await $`gh release download --pattern "awsesh-linux-*64.tar.gz" --pattern "awsesh-darwin-*64.zip" -D dist`

await import("../packages/awsesh/script/publish-registries.ts")
