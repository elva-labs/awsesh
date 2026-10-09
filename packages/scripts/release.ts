import { $ } from "bun"
import { Script, releaseMetadata } from "@awsesh/script"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import path from "node:path"
import { allTargets, targetName } from "../awsesh/script/targets"

export const repository = "elva-labs/awsesh"
export const root = path.resolve(import.meta.dir, "../..")
export const sdkArchive = `awsesh-core-${Script.version}.tgz`
export const desktopArchive = "awsesh-desktop-darwin-arm64.zip"
export const desktopWindowsArchive = "awsesh-desktop-win32-x64.zip"
export const artifacts = [
  ...allTargets.map((target) => `${targetName(target)}.${target.os === "linux" ? "tar.gz" : "zip"}`),
  sdkArchive,
  desktopArchive,
  desktopWindowsArchive,
  "release.json",
]

export function requireRepository() {
  if (process.env.GITHUB_REPOSITORY !== repository) throw new Error(`Releases must run in ${repository}`)
}

export async function desktopManifests() {
  return Promise.all(["Cargo.toml", "Cargo.lock"].map(async (file) => {
    const location = path.join(root, "packages/desktop", file)
    const contents = await Bun.file(location).text()
    const manifest: unknown = Bun.TOML.parse(contents)
    if (!manifest || typeof manifest !== "object" || !("package" in manifest)) throw new Error(`Missing Cargo package: ${file}`)
    const entries: unknown[] = Array.isArray(manifest.package) ? manifest.package : [manifest.package]
    const matches = entries.filter((entry) => entry && typeof entry === "object" && "name" in entry && entry.name === "awsesh-desktop")
    const entry = matches[0]
    if (matches.length !== 1 || !entry || typeof entry !== "object" || !("version" in entry) || typeof entry.version !== "string") {
      throw new Error(`Missing or duplicate desktop Cargo version: ${file}`)
    }
    const pattern = file === "Cargo.toml"
      ? /^(\[package\][\s\S]*?^version = ")([^"\r\n]+)(")/m
      : /^(\[\[package\]\]\r?\nname = "awsesh-desktop"\r?\nversion = ")([^"\r\n]+)(")/m
    if (pattern.exec(contents)?.[2] !== entry.version) throw new Error(`Unsupported Cargo version formatting: ${file}`)
    return { location, contents, pattern, version: entry.version }
  }))
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
  for (const manifest of await desktopManifests()) {
    if (manifest.version !== Script.version) throw new Error(`Cargo version does not match ${tag}: ${manifest.location}`)
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

export async function validateDesktopArchive(file: string, version = Script.version) {
  releaseMetadata(version)
  const validation = String.raw`
import plistlib, re, stat, struct, sys, zipfile

def require(condition, message):
    if not condition:
        raise ValueError(message)

with zipfile.ZipFile(sys.argv[1]) as archive:
    entries = archive.infolist()
    names = [entry.filename for entry in entries]
    require(len(names) == len(set(names)), "Duplicate desktop ZIP paths")
    for entry in entries:
        name = entry.filename
        parts = name.rstrip("/").split("/")
        require(name == entry.orig_filename and "\\" not in name and all(part not in ("", ".", "..") for part in parts), "Unsafe desktop ZIP path")
        kind = stat.S_IFMT(entry.external_attr >> 16)
        require(kind in (0, stat.S_IFREG, stat.S_IFDIR), "Unsupported desktop ZIP file type")
        if parts[0] == "Sesh.app":
            continue
        require(parts[0] == "__MACOSX", "Desktop ZIP path outside Sesh.app")
        if entry.is_dir():
            require(len(parts) == 1 or parts[1] == "Sesh.app", "Unexpected ditto metadata directory")
            continue
        require((len(parts) == 2 and parts[1] == "._Sesh.app") or (len(parts) > 2 and parts[1] == "Sesh.app" and parts[-1].startswith("._")), "Unexpected ditto metadata path")
        target = "/".join(parts[1:-1] + [parts[-1][2:]])
        require(target in names or target + "/" in names, "Orphaned ditto metadata")
        with archive.open(entry) as stream:
            require(stream.read(4) == b"\x00\x05\x16\x07", "Invalid AppleDouble metadata")
    require(archive.testzip() is None, "Corrupt desktop ZIP contents")
    required = ["Sesh.app/Contents/Info.plist", "Sesh.app/Contents/MacOS/sesh", "Sesh.app/Contents/MacOS/awsesh-sdk"]
    for name in required:
        require(name in names and archive.getinfo(name).file_size > 0 and not archive.getinfo(name).is_dir(), "Missing or empty desktop bundle member: " + name)
    require(archive.getinfo(required[0]).file_size <= 1048576, "Oversized desktop Info.plist")
    plist = plistlib.loads(archive.read(required[0]))
    require(isinstance(plist, dict), "Invalid desktop Info.plist")
    version = sys.argv[2]
    base = version.split("-")[0]
    expected = {
        "CFBundleIdentifier": "se.elva.awsesh.desktop",
        "CFBundleExecutable": "sesh",
        "CFBundlePackageType": "APPL",
        "LSMinimumSystemVersion": "13.0",
        "AWSESHReleaseVersion": version,
        "CFBundleShortVersionString": base,
    }
    for key, value in expected.items():
        require(plist.get(key) == value, "Desktop bundle metadata mismatch: " + key)
    build = plist.get("CFBundleVersion")
    require(isinstance(build, str) and (build == base or (re.fullmatch(r"[1-9][0-9]*", build) is not None and int(build) <= 9007199254740991)), "Invalid numeric Apple build version")
    for name in required[1:]:
        require(archive.getinfo(name).external_attr >> 16 & 0o111, "Desktop binary is not executable: " + name)
        with archive.open(name) as stream:
            header = stream.read(32)
        require(len(header) == 32, "Truncated Mach-O header: " + name)
        magic, cpu, subtype, filetype, commands, size, flags, reserved = struct.unpack("<8I", header)
        require(magic == 0xfeedfacf and cpu == 0x0100000c and filetype == 2, "Desktop binary must be ARM64 Mach-O: " + name)
`
  await $`python3 -c ${validation} ${file} ${version}`.quiet()
}

export async function validateWindowsDesktopArchive(file: string, version = Script.version) {
  releaseMetadata(version)
  const validation = String.raw`
import struct, sys, zipfile

def require(condition, message):
    if not condition:
        raise ValueError(message)

required = ["Sesh/awsesh-sdk.exe", "Sesh/LICENSE", "Sesh/sesh.exe"]

with zipfile.ZipFile(sys.argv[1]) as archive:
    infos = archive.infolist()
    names = [info.filename for info in infos]
    require(len(names) == len(set(names)), "Duplicate Windows ZIP paths")
    for info in infos:
        name = info.filename
        parts = name.rstrip("/").split("/")
        require(name == info.orig_filename and "\\" not in name and all(part not in ("", ".", "..") for part in parts), "Unsafe Windows ZIP path")
    require(sorted(names) == sorted(required), "Unexpected Windows package contents")
    for name in required:
        info = archive.getinfo(name)
        require(info.file_size > 0 and not info.is_dir(), "Missing or empty Windows package member: " + name)
    require(archive.testzip() is None, "Corrupt Windows ZIP contents")
    exe = archive.read("Sesh/sesh.exe")
    require(exe[:2] == b"MZ", "Windows desktop executable is not a PE image")
    offset = struct.unpack_from("<I", exe, 0x3c)[0]
    require(exe[offset:offset + 4] == b"PE\x00\x00", "Windows desktop executable has no PE signature")
    require(struct.unpack_from("<H", exe, offset + 4)[0] == 0x8664, "Windows desktop executable is not x86_64")
    optional = offset + 24
    require(struct.unpack_from("<H", exe, optional)[0] == 0x20b, "Windows desktop executable is not PE32+")
    require(struct.unpack_from("<H", exe, optional + 0x44)[0] == 2, "Windows desktop executable is not a GUI subsystem binary")
    require(sys.argv[2].encode("utf-16-le") in exe, "Windows desktop executable is missing release version " + sys.argv[2])
`
  await $`python3 -c ${validation} ${file} ${version}`.quiet()
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
  await validateDesktopArchive(path.join(directory, desktopArchive))
  await validateWindowsDesktopArchive(path.join(directory, desktopWindowsArchive))
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
