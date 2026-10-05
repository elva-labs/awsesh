import manifest from "../../../package.json"
import { releaseMetadata } from "./version"

export { releaseMetadata } from "./version"

const expectedBunVersion = manifest.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  console.warn("packageManager field not found in root package.json")
}

const [expectedMajor, expectedMinor] = (expectedBunVersion || "1.0").split(".").map(Number)
const [actualMajor, actualMinor] = process.versions.bun.split(".").map(Number)

if (expectedBunVersion && (actualMajor < expectedMajor || (actualMajor === expectedMajor && actualMinor < expectedMinor))) {
  console.warn(`Warning: Expected bun@${expectedBunVersion} or higher, but using bun@${process.versions.bun}`)
}

if (process.env.AWSESH_BUMP) throw new Error("Use bun run release:prepare with an explicit version")

export const Script = releaseMetadata(process.env.AWSESH_VERSION ?? manifest.version, process.env.AWSESH_CHANNEL)
