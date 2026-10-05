#!/usr/bin/env bun

import { $ } from "bun"
import { Script } from "@awsesh/script"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { downloadArtifacts, repository, requireRepository, root, validateTag } from "./release"

requireRepository()
if (!process.env.TAP_GITHUB_TOKEN?.trim()) throw new Error("TAP_GITHUB_TOKEN is required before publication")
process.chdir(root)
const candidate = await validateTag()
const directory = await mkdtemp(path.join(tmpdir(), "awsesh-release-publication-"))
const release = await downloadArtifacts(candidate.tag, candidate.commit, directory)

process.env.AWSESH_ARTIFACTS = directory
const registry = await import("../core/script/publish.ts")
await registry.publishPackage()

if (release.draft) {
  const latest = await $`gh api repos/${repository}/releases --paginate --jq '.[] | select(.draft == false and .prerelease == false) | .tag_name'`.text()
  const newer = latest.trim().split("\n").filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .some((tag) => Bun.semver.order(tag.slice(1), Script.version) > 0)
  const flags = Script.preview ? ["--prerelease", "--latest=false"] : ["--prerelease=false", `--latest=${!newer}`]
  await $`gh release edit ${candidate.tag} --repo ${repository} --draft=false ${flags}`
}
await registry.updateChannel()
await import("../awsesh/script/publish-registries.ts")
