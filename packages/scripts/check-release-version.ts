import { $ } from "bun"
import { releaseMetadata } from "../script/src/version"

const [base, head, branch] = process.argv.slice(2)
const commitPattern = /^[0-9a-f]{40}$/
const workspaceManifest = /^packages\/[^/]+\/package\.json$/

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object")
  return Object.fromEntries(Object.entries(value))
}

async function contents(commit: string, path: string) {
  return $`git show ${`${commit}:${path}`}`.quiet().text()
}

async function checkVersionChange() {
  if (!commitPattern.test(base) || !commitPattern.test(head)) return
  const paths = (await $`git ls-tree -rz --name-only ${base}`.quiet().text()).split("\0")
  const manifests = ["package.json", ...paths.filter((path) => workspaceManifest.test(path))]
  const cargoFiles = ["packages/desktop/Cargo.toml", "packages/desktop/Cargo.lock"]
  const expected = new Set([...manifests, ...cargoFiles, "bun.lock"])
  const changes = (await $`git diff --raw --no-renames -z ${base} ${head}`.quiet().text()).split("\0")
  if (changes.pop() !== "" || changes.length !== expected.size * 2) return
  for (let index = 0; index < changes.length; index += 2) {
    if (!/^:100644 100644 [0-9a-f]+ [0-9a-f]+ M$/.test(changes[index]) || !expected.delete(changes[index + 1])) return
  }

  const previous = record(JSON.parse(await contents(base, "package.json"))).version
  const next = record(JSON.parse(await contents(head, "package.json"))).version
  if (typeof previous !== "string" || typeof next !== "string") return
  releaseMetadata(next)
  if (Bun.semver.order(previous, next) >= 0 || (branch && branch !== `release/v${next}`)) return

  for (const file of manifests) {
    const manifest = record(JSON.parse(await contents(base, file)))
    if (manifest.version !== previous) return
    manifest.version = next
    if (await contents(head, file) !== `${JSON.stringify(manifest, null, 2)}\n`) return
  }

  const [cargoManifest, cargoLock] = cargoFiles
  for (const { file, pattern } of [
    { file: cargoManifest, pattern: /^(\[package\][\s\S]*?^version = ")([^"\r\n]+)(")/m },
    { file: cargoLock, pattern: /^(\[\[package\]\]\r?\nname = "awsesh-desktop"\r?\nversion = ")([^"\r\n]+)(")/m },
  ]) {
    const current = await contents(base, file)
    if (pattern.exec(current)?.[2] !== previous) return
    const updated = current.replace(pattern, (_match, prefix, _version, suffix) => `${prefix}${next}${suffix}`)
    if (await contents(head, file) !== updated) return
  }

  const lock = await contents(base, "bun.lock")
  const workspaces = record(record(Bun.JSONC.parse(lock)).workspaces)
  const versionedWorkspaces = Object.entries(workspaces).filter(([, value]) => Object.hasOwn(record(value), "version"))
  if (versionedWorkspaces.length !== manifests.length - 1 || !versionedWorkspaces.every(([path, value]) =>
    manifests.includes(`${path}/package.json`) && record(value).version === previous)) return
  let revisions = 0
  const updated = lock.replace(/^( +"version": ")([^"\r\n]+)(",)$/gm, (line, prefix, version, suffix) => {
    if (version !== previous) return line
    revisions++
    return `${prefix}${next}${suffix}`
  })
  if (revisions !== versionedWorkspaces.length || await contents(head, "bun.lock") !== updated) return

  return next
}

try {
  const version = await checkVersionChange()
  if (version) console.log(version)
} catch (error) {
  console.error(`Could not verify a version-only change; full CI is required: ${error}`)
}
