import { unzipSync } from "fflate"

const requiredFiles = ["Sesh/LICENSE", "Sesh/awsesh-sdk-linux-x64", "Sesh/awsesh-sdk.exe", "Sesh/sesh.exe"]

function centralDirectoryNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  const lower = Math.max(0, bytes.length - 22 - 0xffff)
  for (let offset = bytes.length - 22; offset >= lower; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error("Missing ZIP end of central directory")
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const names: string[] = []
  for (let index = 0; index < count; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid ZIP central directory record")
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return names
}

function subsystem(image: Uint8Array): number {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength)
  if (image[0] !== 0x4d || image[1] !== 0x5a) throw new Error("Not a PE image")
  const pe = view.getUint32(0x3c, true)
  if (view.getUint32(pe, true) !== 0x00004550) throw new Error("Missing PE signature")
  if (view.getUint16(pe + 4, true) !== 0x8664) throw new Error("PE image is not x86_64")
  const optional = pe + 24
  if (view.getUint16(optional, true) !== 0x20b) throw new Error("PE image is not PE32+")
  return view.getUint16(optional + 0x44, true)
}

function utf16le(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2)
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    bytes[index * 2] = code & 0xff
    bytes[index * 2 + 1] = code >> 8
  }
  return bytes
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let start = 0; start + needle.length <= haystack.length; start++) {
    for (let index = 0; index < needle.length; index++) {
      if (haystack[start + index] !== needle[index]) continue outer
    }
    return start
  }
  return -1
}

function readUtf16le(bytes: Uint8Array, start: number): string | undefined {
  let value = ""
  for (let index = start; index + 1 < bytes.length; index += 2) {
    const code = bytes[index] | (bytes[index + 1] << 8)
    if (code === 0) return value
    value += String.fromCharCode(code)
  }
  return undefined
}

/** Reads the exact `AWSESHReleaseVersion` VERSIONINFO value from the executable. */
function releaseVersionField(image: Uint8Array): string | undefined {
  const key = utf16le("AWSESHReleaseVersion")
  const at = indexOfBytes(image, key)
  if (at < 0) return undefined
  let cursor = at + key.length
  while (cursor < image.length && image[cursor] === 0) cursor++
  return readUtf16le(image, cursor)
}

export function validatePackageNames(names: string[]) {
  const seen = new Set<string>()
  for (const name of names) {
    if (name.includes("\\")) throw new Error(`Backslash path in package: ${name}`)
    const parts = name.replace(/\/$/, "").split("/")
    if (name.startsWith("/") || parts.some((part) => part === "" || part === "." || part === "..")) {
      throw new Error(`Unsafe package path: ${name}`)
    }
    if (seen.has(name)) throw new Error(`Duplicate package path: ${name}`)
    seen.add(name)
  }
  const actual = [...seen].sort()
  const expected = [...requiredFiles].sort()
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error(`Unexpected package contents: ${actual.join(", ")}`)
  }
}

export async function verifyWindowsPackage(_staging: string, archive: string, version: string) {
  const bytes = new Uint8Array(await Bun.file(archive).arrayBuffer())
  validatePackageNames(centralDirectoryNames(bytes))
  const entries = unzipSync(bytes)
  const exe = entries["Sesh/sesh.exe"]
  if (!exe || exe.length === 0) throw new Error("Missing sesh.exe")
  if (subsystem(exe) !== 2) throw new Error("sesh.exe is not a GUI subsystem binary")
  const field = releaseVersionField(exe)
  if (field !== version) throw new Error(`sesh.exe AWSESHReleaseVersion is ${field ?? "missing"}, expected ${version}`)
  const helper = entries["Sesh/awsesh-sdk.exe"]
  if (!helper || helper.length === 0) throw new Error("Missing awsesh-sdk.exe")
  subsystem(helper)
  const linux = entries["Sesh/awsesh-sdk-linux-x64"]
  if (!linux || linux.length < 64 || linux[0] !== 0x7f || linux[1] !== 0x45 || linux[2] !== 0x4c || linux[3] !== 0x46
    || linux[4] !== 2 || linux[5] !== 1 || new DataView(linux.buffer, linux.byteOffset).getUint16(18, true) !== 62) {
    throw new Error("Missing or invalid x86_64 Linux SDK helper")
  }
}
