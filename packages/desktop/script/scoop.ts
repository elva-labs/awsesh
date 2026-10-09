const repository = "elva-labs/awsesh"
const asset = "awsesh-desktop-win32-x64.zip"

export interface ScoopManifest {
  version: string
  description: string
  homepage: string
  license: string
  architecture: Record<string, { url: string; hash: string } | undefined>
  extract_dir: string
  bin: string[][]
  shortcuts: string[][]
  checkver: { github: string }
  autoupdate: { architecture: Record<string, { url: string } | undefined> }
}

/**
 * Builds a Scoop manifest for the Windows desktop package. The manifest belongs
 * in a maintainer-owned bucket; this keeps the generated values in one place.
 */
export function scoopManifest(version: string, hash: string): ScoopManifest {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-beta\.(0|[1-9]\d*))?$/.test(version)) {
    throw new Error("Invalid version")
  }
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid sha256")
  const download = `https://github.com/${repository}/releases/download/v${version}/${asset}`
  return {
    version,
    description: "Sesh, the awsesh desktop client",
    homepage: `https://github.com/${repository}`,
    license: "MIT",
    architecture: { "64bit": { url: download, hash } },
    extract_dir: "Sesh",
    bin: [["sesh.exe", "awsesh-desktop"]],
    shortcuts: [["sesh.exe", "Sesh"]],
    checkver: { github: `https://github.com/${repository}` },
    autoupdate: {
      architecture: { "64bit": { url: `https://github.com/${repository}/releases/download/v$version/${asset}` } },
    },
  }
}

if (import.meta.main) {
  const version = process.argv[2]
  const hash = process.argv[3]
  if (!version || !hash || process.argv.length !== 4) throw new Error("Usage: bun run packages/desktop/script/scoop.ts <version> <sha256>")
  console.log(JSON.stringify(scoopManifest(version, hash), null, 2))
}
