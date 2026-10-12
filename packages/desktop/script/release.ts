import { createPrivateKey, randomBytes } from "node:crypto"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { releaseMetadata } from "../../script/src/version"
import { desktopArchive, validateDesktopArchive } from "../../scripts/release"
import { verifyHelper } from "./helper"

export { verifyHelper }

async function run(command: string[]) {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "inherit" })
  const [stdout, status] = await Promise.all([
    new Response(child.stdout).text(), child.exited,
  ])
  if (status !== 0) throw new Error(`${path.basename(command[0])} ${command[1]} failed (exit ${status})`)
  return stdout.trim()
}

export async function keychainSearchList() {
  const output = await run(["/usr/bin/security", "list-keychains", "-d", "user"])
  if (!output) return []
  return output.split("\n").map((line) => {
    const value: unknown = JSON.parse(line.trim())
    if (typeof value !== "string" || !value) throw new Error("Invalid keychain search list")
    return value
  })
}

function required(name: string) {
  const value = process.env[name]
  if (!value?.trim()) throw new Error(`${name} is required for desktop releases`)
  return value
}

export function decodeNotaryKey(value: string) {
  const encoded = value.replace(/\s/g, "")
  const decoded = Buffer.from(encoded, "base64")
  if (!decoded.length || decoded.toString("base64") !== encoded) throw new Error("NOTARY_KEY must be base64 encoded .p8 data")
  const key = decoded.toString("utf8").trim()
  if (!key.startsWith("-----BEGIN PRIVATE KEY-----\n") && !key.startsWith("-----BEGIN PRIVATE KEY-----\r\n")) {
    throw new Error("NOTARY_KEY must decode to raw unencrypted PEM .p8 text")
  }
  try {
    if (createPrivateKey(key).asymmetricKeyType !== "ec") throw new Error("Invalid key type")
  } catch {
    throw new Error("NOTARY_KEY must decode to a valid EC private key in PEM .p8 format")
  }
  return key
}

async function release() {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Desktop releases require ARM64 macOS")
  const directory = path.resolve(import.meta.dir, "..")
  const app = path.join(directory, "dist/Sesh.app")
  const archive = path.join(directory, "dist", desktopArchive)
  await rm(archive, { force: true })
  const certificate = required("MACOS_CERTIFICATE").replace(/\s/g, "")
  const password = required("MACOS_CERTIFICATE_PASSWORD")
  const identity = required("MACOS_SIGN_IDENTITY").trim()
  const key = decodeNotaryKey(required("NOTARY_KEY"))
  const keyId = required("NOTARY_KEY_ID").trim()
  const issuer = required("NOTARY_ISSUER_ID").trim()
  const decoded = Buffer.from(certificate, "base64")
  if (!decoded.length || decoded.toString("base64") !== certificate) throw new Error("MACOS_CERTIFICATE must be base64 encoded .p12 data")
  if (!/^[A-Za-z0-9]{10,}$/.test(keyId)) throw new Error("NOTARY_KEY_ID must be an alphanumeric API key ID")
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(issuer)) throw new Error("NOTARY_ISSUER_ID must be a UUID")
  const search = await keychainSearchList()
  const keychainPassword = randomBytes(32).toString("hex")
  const temporary = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), "awsesh-desktop-release-"))
  const keychain = path.join(temporary, "signing.keychain-db")
  const certificateFile = path.join(temporary, "certificate.p12")
  const keyFile = path.join(temporary, "notary.p8")
  try {
    try {
      await writeFile(certificateFile, decoded, { mode: 0o600 })
      await writeFile(keyFile, key, { mode: 0o600 })
      await run(["/usr/bin/openssl", "pkcs12", "-in", certificateFile, "-passin", "env:MACOS_CERTIFICATE_PASSWORD", "-noout"])
      await run(["/usr/bin/security", "create-keychain", "-p", keychainPassword, keychain])
      await run(["/usr/bin/security", "set-keychain-settings", "-lut", "21600", keychain])
      await run(["/usr/bin/security", "unlock-keychain", "-p", keychainPassword, keychain])
      await run(["/usr/bin/security", "list-keychains", "-d", "user", "-s", keychain, ...search])
      await run(["/usr/bin/security", "import", certificateFile, "-k", keychain, "-P", password, "-T", "/usr/bin/codesign"])
      await run(["/usr/bin/security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", keychainPassword, keychain])
      const identities = (await run(["/usr/bin/security", "find-identity", "-v", "-p", "codesigning", keychain])).split("\n")
        .map((line) => /^\s*\d+\) ([a-f0-9]{40}) "(Developer ID Application: [^"]+)"$/i.exec(line))
        .filter((match) => match && (match[1].toLowerCase() === identity.toLowerCase() || match[2] === identity))
      const selected = identities[0]
      if (identities.length !== 1 || !selected) throw new Error("MACOS_SIGN_IDENTITY must match one valid imported Developer ID Application identity")
      await run([process.execPath, "run", path.join(import.meta.dir, "build.ts")])
      const helper = path.join(app, "Contents/MacOS/awsesh-sdk")
      await run(["/usr/bin/codesign", "--force", "--keychain", keychain, "--sign", selected[1], "--options", "runtime", "--timestamp", "--entitlements", path.join(directory, "assets/entitlements.plist"), helper])
      await run(["/usr/bin/codesign", "--force", "--keychain", keychain, "--sign", selected[1], "--options", "runtime", "--timestamp", app])
      await run(["/usr/bin/codesign", "--verify", "--strict", helper])
      await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", app])
      for (const name of ["sesh", "awsesh-sdk"]) {
        if (await run(["/usr/bin/lipo", "-archs", path.join(app, "Contents/MacOS", name)]) !== "arm64") throw new Error(`Non-ARM64 desktop executable: ${name}`)
      }
      const metadata: unknown = await Bun.file(path.join(directory, "package.json")).json()
      if (!metadata || typeof metadata !== "object" || !("version" in metadata) || typeof metadata.version !== "string") throw new Error("Invalid desktop release version")
      const version = releaseMetadata(metadata.version, process.env.AWSESH_CHANNEL).version
      const base = version.split("-")[0]
      const plist: unknown = JSON.parse(await run(["/usr/bin/plutil", "-convert", "json", "-o", "-", path.join(app, "Contents/Info.plist")]))
      if (!plist || typeof plist !== "object" || !("CFBundleIdentifier" in plist) || plist.CFBundleIdentifier !== "se.elva.awsesh.desktop"
        || !("LSMinimumSystemVersion" in plist) || plist.LSMinimumSystemVersion !== "13.0"
        || !("AWSESHReleaseVersion" in plist) || plist.AWSESHReleaseVersion !== version
        || !("CFBundleShortVersionString" in plist) || plist.CFBundleShortVersionString !== base
        || !("CFBundleVersion" in plist) || plist.CFBundleVersion !== (process.env.GITHUB_RUN_NUMBER ?? base)) throw new Error("Desktop bundle metadata mismatch")
      await verifyHelper(helper)
      const submission = path.join(temporary, "submission.zip")
      await run(["/usr/bin/ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", app, submission])
      await validateDesktopArchive(submission, version)
      const credentials = ["--key", keyFile, "--key-id", keyId, "--issuer", issuer]
      const result: unknown = JSON.parse(await run(["/usr/bin/xcrun", "notarytool", "submit", submission, ...credentials, "--wait", "--output-format", "json"]))
      if (!result || typeof result !== "object" || !("status" in result) || result.status !== "Accepted"
        || !("id" in result) || typeof result.id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.id)) throw new Error("Apple notarization was not Accepted")
      const log: unknown = JSON.parse(await run(["/usr/bin/xcrun", "notarytool", "log", result.id, ...credentials]))
      if (!log || typeof log !== "object" || !("status" in log) || log.status !== "Accepted" || !("issues" in log)
        || (log.issues !== null && (!Array.isArray(log.issues) || log.issues.some((issue: unknown) => !issue || typeof issue !== "object" || !("severity" in issue) || issue.severity !== "warning")))) {
        throw new Error("Apple notarization log contains errors or invalid results")
      }
      await run(["/usr/bin/xcrun", "stapler", "staple", app])
      await run(["/usr/bin/xcrun", "stapler", "validate", app])
      await run(["/usr/sbin/spctl", "--assess", "--type", "execute", app])
      await run(["/usr/bin/codesign", "--verify", "--deep", "--strict", app])
      await run(["/usr/bin/ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", app, archive])
      await validateDesktopArchive(archive, version)
    } finally {
      try {
        if (await Bun.file(keychain).exists()) await run(["/usr/bin/security", "delete-keychain", keychain])
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }
  } catch (error) {
    await rm(archive, { force: true })
    throw error
  }
  console.log(`Built signed, notarized and stapled ${archive}`)
}

if (import.meta.main) await release()
