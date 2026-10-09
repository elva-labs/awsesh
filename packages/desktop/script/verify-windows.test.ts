import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { zipSync } from "fflate"
import { validatePackageNames, verifyWindowsPackage } from "./verify-windows"

const required = ["Sesh/LICENSE", "Sesh/awsesh-sdk.exe", "Sesh/sesh.exe"]

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
  const characters = new TextEncoder().encode(version)
  for (let index = 0; index < characters.length; index++) {
    buffer[0x200 + index * 2] = characters[index]
    buffer[0x200 + index * 2 + 1] = 0
  }
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
})
