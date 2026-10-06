import { $ } from "bun"
import { Script } from "@awsesh/script"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import path from "node:path"
import { allTargets, targetName } from "../awsesh/script/targets"

export const repository = "elva-labs/awsesh"
export const root = path.resolve(import.meta.dir, "../..")
export const sdkArchive = `awsesh-core-${Script.version}.tgz`
export const artifacts = [
  ...allTargets.map((target) => `${targetName(target)}.${target.os === "linux" ? "tar.gz" : "zip"}`),
  sdkArchive,
  "release.json",
]

export function requireRepository() {
  if (process.env.GITHUB_REPOSITORY !== repository) throw new Error(`Releases must run in ${repository}`)
}

export async function validateTag() {
  const tag = process.env.AWSESH_TAG
  if (tag !== `v${Script.version}`) throw new Error("AWSESH_TAG must match the prepared manifest version")
  const commit = (await $`git rev-parse --verify refs/tags/${tag}^{commit}`.cwd(root).text()).trim()
  const head = (await $`git rev-parse HEAD`.cwd(root).text()).trim()
  if (head !== commit) throw new Error("Release checkout must be the tagged commit")
  await $`git merge-base --is-ancestor ${commit} origin/main`.cwd(root)
  await $`git diff --exit-code ${commit}`.cwd(root).quiet()
  const files = ["package.json", ...await Array.fromAsync(new Bun.Glob("packages/*/package.json").scan({ cwd: root }))]
  for (const file of files) {
    const manifest: unknown = await Bun.file(path.join(root, file)).json()
    if (!manifest || typeof manifest !== "object" || !("version" in manifest) || manifest.version !== Script.version) {
      throw new Error(`Manifest version does not match ${tag}: ${file}`)
    }
  }
  return { tag, commit }
}

export async function getRelease(tag: string) {
  const result = await $`gh release view ${tag} --repo ${repository} --json isDraft,isPrerelease,targetCommitish,assets --jq '{draft: .isDraft, prerelease: .isPrerelease, target_commitish: .targetCommitish, assets: .assets}'`.quiet().nothrow()
  if (result.exitCode !== 0) {
    if (result.stderr.toString().trim() === "release not found") return undefined
    throw new Error(`Cannot read release ${tag}: ${result.stderr.toString()}`)
  }
  const release: unknown = JSON.parse(result.stdout.toString())
  if (!release || typeof release !== "object" || !("draft" in release) || typeof release.draft !== "boolean"
    || !("prerelease" in release) || typeof release.prerelease !== "boolean"
    || !("target_commitish" in release) || typeof release.target_commitish !== "string"
    || !("assets" in release) || !Array.isArray(release.assets)) {
    throw new Error(`Invalid GitHub release metadata for ${tag}`)
  }
  const assets = release.assets.map((asset: unknown) => {
    if (!asset || typeof asset !== "object" || !("name" in asset) || typeof asset.name !== "string"
      || !("size" in asset) || typeof asset.size !== "number") {
      throw new Error(`Invalid asset metadata for ${tag}`)
    }
    return { name: asset.name, size: asset.size }
  })
  return { draft: release.draft, prerelease: release.prerelease, commit: release.target_commitish, assets }
}

export async function digest(file: string, algorithm = "sha256") {
  const hash = createHash(algorithm)
  for await (const buffer of createReadStream(file)) hash.update(buffer)
  return hash.digest("hex")
}

export async function validateArtifacts(directory: string, tag: string, commit: string) {
  const lines = (await Bun.file(path.join(directory, "SHA256SUMS")).text()).trim().split("\n")
  const checksums = new Map<string, string>()
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line)
    if (!match || !artifacts.includes(match[2]) || checksums.has(match[2])) throw new Error("Invalid checksum manifest")
    checksums.set(match[2], match[1])
  }
  if (checksums.size !== artifacts.length) throw new Error("Incomplete checksum manifest")
  for (const name of artifacts) {
    const file = path.join(directory, name)
    if (!await Bun.file(file).exists() || Bun.file(file).size === 0) throw new Error(`Missing or empty artifact: ${name}`)
    if (await digest(file) !== checksums.get(name)) throw new Error(`Checksum mismatch: ${name}`)
  }
  const manifest: unknown = await Bun.file(path.join(directory, "release.json")).json()
  if (!manifest || typeof manifest !== "object" || !("version" in manifest) || manifest.version !== Script.version
    || !("channel" in manifest) || manifest.channel !== Script.channel
    || !("tag" in manifest) || manifest.tag !== tag || !("commit" in manifest) || manifest.commit !== commit) {
    throw new Error("Candidate metadata does not match the tagged source")
  }
  for (const target of allTargets) {
    const archive = path.join(directory, `${targetName(target)}.${target.os === "linux" ? "tar.gz" : "zip"}`)
    const listing = target.os === "linux" ? await $`tar -tzf ${archive}`.text() : await $`unzip -Z1 ${archive}`.text()
    if (listing.trim() !== (target.os === "win32" ? "awsesh.exe" : "awsesh")) {
      throw new Error(`Unexpected archive contents: ${archive}`)
    }
  }
  const archive = path.join(directory, sdkArchive)
  const sdk: unknown = JSON.parse(await $`tar -xOf ${archive} package/package.json`.text())
  if (!sdk || typeof sdk !== "object" || !("name" in sdk) || sdk.name !== "@awsesh/core"
    || !("version" in sdk) || sdk.version !== Script.version) throw new Error("SDK package metadata mismatch")
  for (const name of ["index.js", "index.d.ts"]) {
    if (!(await $`tar -xOf ${archive} package/${name}`.text()).trim()) throw new Error(`SDK is missing ${name}`)
  }
}

export async function downloadArtifacts(tag: string, commit: string, directory: string) {
  const release = await getRelease(tag)
  if (!release || release.commit !== commit || release.prerelease !== Script.preview) {
    throw new Error("Release does not match the tagged source and channel")
  }
  const expected = [...artifacts, "SHA256SUMS"]
  if (release.assets.length !== expected.length || new Set(release.assets.map((asset) => asset.name)).size !== expected.length
    || release.assets.some((asset) => !expected.includes(asset.name) || asset.size === 0)) {
    throw new Error("Candidate does not contain the complete expected artifact set")
  }
  await $`gh release download ${tag} --repo ${repository} --dir ${directory}`
  await validateArtifacts(directory, tag, commit)
  return release
}
