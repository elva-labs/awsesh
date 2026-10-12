import { describe, expect, test } from "bun:test"
import { macosInfoPlist } from "./build-macos"

describe("macosInfoPlist", () => {
  for (const { label, version, number, build } of [
    { label: "stable local", version: "1.2.0", number: undefined, build: "1.2.0" },
    { label: "beta local", version: "1.2.0-beta.1", number: undefined, build: "1.2.0" },
    { label: "stable CI", version: "1.2.0", number: "42", build: "42" },
    { label: "beta CI", version: "1.2.0-beta.1", number: "42", build: "42" },
  ]) {
    test(`${label} uses numeric Apple versions and preserves release identity`, () => {
      const plist = macosInfoPlist({ version, base: "1.2.0", number })
      expect(plist).toContain(`<key>CFBundleVersion</key><string>${build}</string>`)
      expect(plist).toContain("<key>CFBundleShortVersionString</key><string>1.2.0</string>")
      expect(plist).toContain(`<key>AWSESHReleaseVersion</key><string>${version}</string>`)
    })
  }
})
