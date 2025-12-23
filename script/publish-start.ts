#!/usr/bin/env bun

import { $ } from "bun"
import { Script } from "@awsesh/script"

console.log("=== publishing awsesh ===\n")

const pkgjsons = await Array.fromAsync(
  new Bun.Glob("**/package.json").scan({
    absolute: true,
  }),
).then((arr) => arr.filter((x) => !x.includes("node_modules") && !x.includes("dist")))

for (const file of pkgjsons) {
  let pkg = await Bun.file(file).text()
  pkg = pkg.replaceAll(/"version": "[^"]+"/g, `"version": "${Script.version}"`)
  console.log("updated:", file)
  await Bun.file(file).write(pkg)
}

await $`bun install`

console.log("\n=== awsesh cli ===\n")
await import("../packages/awsesh/script/publish.ts")

console.log("\n=== @awsesh/core ===\n")
await import("../packages/core/script/publish.ts")

const dir = new URL("..", import.meta.url).pathname
process.chdir(dir)

let output = `version=${Script.version}\n`

await $`git commit -am "release: v${Script.version}"`.nothrow()
await $`git tag v${Script.version}`
await $`git push origin HEAD --tags --no-verify --force-with-lease`
await new Promise((resolve) => setTimeout(resolve, 5_000))

if (Script.preview) {
  await $`gh release create v${Script.version} -d --prerelease --title "v${Script.version}" --generate-notes ./packages/awsesh/dist/*.zip ./packages/awsesh/dist/*.tar.gz`
} else {
  await $`gh release create v${Script.version} -d --title "v${Script.version}" --generate-notes ./packages/awsesh/dist/*.zip ./packages/awsesh/dist/*.tar.gz`
}
const release = await $`gh release view v${Script.version} --json id,tagName`.json()
output += `release=${release.id}\n`
output += `tag=${release.tagName}\n`

if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, output)
}
