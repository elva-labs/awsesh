import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { zipSync } from "fflate"
import { validatePackageNames, verifyWindowsPackage } from "./verify-windows"

const required = ["Sesh/LICENSE", "Sesh/awsesh-sdk.exe", "Sesh/sesh.exe"]

function utf16le(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2)
  for (let index = 0; index < value.length; index++) {
    bytes[index * 2] = value.charCodeAt(index) & 0xff
    bytes[index * 2 + 1] = value.charCodeAt(index) >> 8
  }
  return bytes
}

function portableExecutable(version: string, peSubsystem = 2): Uint8Array {
  const buffer = new Uint8Array(0x400)
  const view = new DataView(buffer.buffer)
  buffer[0] = 0x4d
  buffer[1] = 0x5a
  const pe = 0x80
  view.setUint32(0x3c, pe, true)
  view.setUint32(pe, 0x00004550, true)
  view.setUint16(pe + 4, 0x8664, true)
  const optional = pe + 24
  view.setUint16(optional, 0x20b, true)
  view.setUint16(optional + 0x44, peSubsystem, true)
  const key = utf16le("AWSESHReleaseVersion")
  const value = utf16le(version)
  buffer.set(key, 0x200)
  const valueOffset = Math.ceil((0x200 + key.length + 2) / 4) * 4
  buffer.set(value, valueOffset)
  return buffer
}

async function writeArchive(files: Record<string, Uint8Array>) {
  const directory = await mkdtemp(path.join(tmpdir(), "awsesh-verify-"))
  const archive = path.join(directory, "package.zip")
  await Bun.write(archive, zipSync(files))
  return { directory, archive }
}

describe("validatePackageNames", () => {
  test("accepts the required package layout", () => {
    expect(() => validatePackageNames(required)).not.toThrow()
  })

  test("rejects duplicate paths", () => {
    expect(() => validatePackageNames([...required, "Sesh/sesh.exe"])).toThrow()
  })

  test("rejects backslash separators", () => {
    expect(() => validatePackageNames(["Sesh\\sesh.exe", "Sesh/awsesh-sdk.exe", "Sesh/LICENSE"])).toThrow()
  })

  test("rejects parent traversal", () => {
    expect(() => validatePackageNames(["Sesh/../sesh.exe", "Sesh/awsesh-sdk.exe", "Sesh/LICENSE"])).toThrow()
  })

  test("rejects extra files", () => {
    expect(() => validatePackageNames([...required, "Sesh/extra.txt"])).toThrow()
  })

  test("rejects missing files", () => {
    expect(() => validatePackageNames(["Sesh/sesh.exe"])).toThrow()
  })
})

describe("verifyWindowsPackage", () => {
  test("accepts a valid package", async () => {
    const { directory, archive } = await writeArchive({
      "Sesh/sesh.exe": portableExecutable("1.1.3"),
      "Sesh/awsesh-sdk.exe": portableExecutable("1.1.3", 3),
      "Sesh/LICENSE": new TextEncoder().encode("MIT"),
    })
    try {
      await expect(verifyWindowsPackage(directory, archive, "1.1.3")).resolves.toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects a package missing the helper", async () => {
    const { directory, archive } = await writeArchive({
      "Sesh/sesh.exe": portableExecutable("1.1.3"),
      "Sesh/LICENSE": new TextEncoder().encode("MIT"),
    })
    try {
      await expect(verifyWindowsPackage(directory, archive, "1.1.3")).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects a non-PE executable", async () => {
    const { directory, archive } = await writeArchive({
      "Sesh/sesh.exe": new TextEncoder().encode("not a portable executable"),
      "Sesh/awsesh-sdk.exe": portableExecutable("1.1.3", 3),
      "Sesh/LICENSE": new TextEncoder().encode("MIT"),
    })
    try {
      await expect(verifyWindowsPackage(directory, archive, "1.1.3")).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects a console subsystem application", async () => {
    const { directory, archive } = await writeArchive({
      "Sesh/sesh.exe": portableExecutable("1.1.3", 3),
      "Sesh/awsesh-sdk.exe": portableExecutable("1.1.3", 3),
      "Sesh/LICENSE": new TextEncoder().encode("MIT"),
    })
    try {
      await expect(verifyWindowsPackage(directory, archive, "1.1.3")).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects a mismatched release version", async () => {
    const { directory, archive } = await writeArchive({
      "Sesh/sesh.exe": portableExecutable("9.9.9"),
      "Sesh/awsesh-sdk.exe": portableExecutable("1.1.3", 3),
      "Sesh/LICENSE": new TextEncoder().encode("MIT"),
    })
    try {
      await expect(verifyWindowsPackage(directory, archive, "1.1.3")).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects a version that only shares a prefix", async () => {
    const { directory, archive } = await writeArchive({
      "Sesh/sesh.exe": portableExecutable("1.1.30"),
      "Sesh/awsesh-sdk.exe": portableExecutable("1.1.30", 3),
      "Sesh/LICENSE": new TextEncoder().encode("MIT"),
    })
    try {
      await expect(verifyWindowsPackage(directory, archive, "1.1.3")).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
