#!/usr/bin/env bun

import { $ } from "bun"
import { Script } from "@awsesh/script"
import path from "node:path"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { artifacts, digest, downloadArtifacts, getRelease, repository, requireRepository, root, sdkArchive,
  validateArtifacts, validateTag } from "./release"

requireRepository()
process.chdir(root)
const candidate = await validateTag()
const release = await getRelease(candidate.tag)

if (release && (release.commit !== candidate.commit || release.prerelease !== Script.preview)) {
  throw new Error("Existing candidate source or channel differs; do not move release tags")
}
if (release && (!release.draft || release.assets.some((asset) => asset.name === "SHA256SUMS"))) {
  const directory = await mkdtemp(path.join(tmpdir(), "awsesh-release-verification-"))
  await downloadArtifacts(candidate.tag, candidate.commit, directory)
  console.log(`${candidate.tag} is already staged; artifacts were verified without overwriting them.`)
  process.exit(0)
}

const directory = path.join(root, "dist", candidate.tag)
await $`mkdir -p ${directory}`
if (!release) {
  const notes = process.env.RELEASE_NOTES
  if (!notes?.trim()) throw new Error("Release Drafter notes are required")
  const file = path.join(directory, "notes.md")
  await Bun.write(file, `${notes}\n\nSource commit: ${candidate.commit}\n`)
  const flags = Script.preview ? ["--prerelease"] : []
  await $`gh release create ${candidate.tag} --repo ${repository} --verify-tag --target ${candidate.commit} --draft --title ${candidate.tag} --notes-file ${file} ${flags}`
}

await import("../awsesh/script/publish.ts")
await import("../core/script/build.ts")
process.chdir(root)
await $`npm pack --ignore-scripts --pack-destination ${directory}`.cwd(path.join(root, "packages/core/dist"))
if (!await Bun.file(path.join(directory, sdkArchive)).exists()) throw new Error("SDK package archive was not created")
for (const name of artifacts.filter((name) => name !== sdkArchive && name !== "release.json")) {
  await Bun.write(path.join(directory, name), Bun.file(path.join(root, "packages/awsesh/dist", name)))
}
await Bun.write(path.join(directory, "release.json"), JSON.stringify({ ...candidate, version: Script.version, channel: Script.channel }, null, 2) + "\n")
const checksums = await Promise.all(artifacts.map(async (name) => `${await digest(path.join(directory, name))}  ${name}\n`))
await Bun.write(path.join(directory, "SHA256SUMS"), checksums.join(""))
await validateArtifacts(directory, candidate.tag, candidate.commit)

const current = await getRelease(candidate.tag)
if (!current?.draft || current.commit !== candidate.commit) throw new Error("Candidate changed during staging")
await $`gh release upload ${candidate.tag} --repo ${repository} --clobber ${artifacts.map((name) => path.join(directory, name))}`
await $`gh release upload ${candidate.tag} --repo ${repository} ${path.join(directory, "SHA256SUMS")}`
const verification = await mkdtemp(path.join(tmpdir(), "awsesh-release-verification-"))
await downloadArtifacts(candidate.tag, candidate.commit, verification)
console.log(`${candidate.tag} is staged. Review its notes and artifacts before publishing.`)
