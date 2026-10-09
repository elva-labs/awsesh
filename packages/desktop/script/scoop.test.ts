import { describe, expect, test } from "bun:test"
import { scoopManifest } from "./scoop"

const hash = "a".repeat(64)

describe("scoopManifest", () => {
  test("targets the release asset with the expected extraction and shortcuts", () => {
    const manifest = scoopManifest("1.1.3", hash)
    expect(manifest.version).toBe("1.1.3")
    expect(manifest.architecture["64bit"]).toEqual({
      url: "https://github.com/elva-labs/awsesh/releases/download/v1.1.3/awsesh-desktop-win32-x64.zip",
      hash,
    })
    expect(manifest.extract_dir).toBe("Sesh")
    expect(manifest.shortcuts).toEqual([["sesh.exe", "Sesh"]])
    expect(manifest.bin).toEqual([["sesh.exe", "awsesh-desktop"]])
    expect(manifest.autoupdate.architecture["64bit"]?.url).toBe(
      "https://github.com/elva-labs/awsesh/releases/download/v$version/awsesh-desktop-win32-x64.zip",
    )
  })

  test("rejects an invalid hash or version", () => {
    expect(() => scoopManifest("1.1.3", "nope")).toThrow()
    expect(() => scoopManifest("not-a-version", hash)).toThrow()
  })
})
