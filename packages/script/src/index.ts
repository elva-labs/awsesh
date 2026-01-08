import { $ } from "bun"
import path from "node:path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  console.warn("packageManager field not found in root package.json")
}

const [expectedMajor, expectedMinor] = (expectedBunVersion || "1.0").split(".").map(Number)
const [actualMajor, actualMinor] = process.versions.bun.split(".").map(Number)

if (expectedBunVersion && (actualMajor < expectedMajor || (actualMajor === expectedMajor && actualMinor < expectedMinor))) {
  console.warn(`Warning: Expected bun@${expectedBunVersion} or higher, but using bun@${process.versions.bun}`)
}

const env = {
  AWSESH_CHANNEL: process.env.AWSESH_CHANNEL,
  AWSESH_BUMP: process.env.AWSESH_BUMP,
  AWSESH_VERSION: process.env.AWSESH_VERSION,
}

const CHANNEL = await (async () => {
  if (env.AWSESH_CHANNEL) return env.AWSESH_CHANNEL
  if (env.AWSESH_BUMP) return "latest"
  if (env.AWSESH_VERSION && !env.AWSESH_VERSION.startsWith("0.0.0-")) return "latest"
  const branch = await $`git branch --show-current`.text().then((x) => x.trim())
  if (branch === "main") return "latest"
  if (branch === "beta") return "beta"
  return branch
})()

const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.AWSESH_VERSION) return env.AWSESH_VERSION
  if (IS_PREVIEW) {
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")
    return `1.0.0-${CHANNEL}.${timestamp}`
  }
  const latestVersion = await fetch("https://registry.npmjs.org/@awsesh/core/latest")
    .then((res) => {
      if (!res.ok) return null
      return res.json()
    })
    .then((data) => data?.version ?? "1.0.0")
    .catch(() => "1.0.0")

  const [major, minor, patch] = latestVersion.split(".").map((x: string) => Number(x) || 0)
  const t = env.AWSESH_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
}

console.log("awsesh script", JSON.stringify(Script, null, 2))
