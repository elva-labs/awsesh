export function releaseMetadata(version: string, channel?: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/.exec(version)
  if (!match || match.slice(1).some((value) => value !== undefined && !Number.isSafeInteger(Number(value)))) {
    throw new Error("Version must be MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-beta.N")
  }
  const preview = match[4] !== undefined
  const resolved = preview ? "beta" : "latest"
  if (channel !== undefined && channel !== resolved) throw new Error(`Version ${version} requires channel ${resolved}`)
  return { version, channel: resolved, preview }
}
