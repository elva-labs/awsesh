#!/usr/bin/env bun
import { $ } from "bun"
import { Script, releaseMetadata } from "@awsesh/script"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { digest, getRelease, requireRepository } from "../../scripts/release"

const version = Script.version

function getTapToken(): string {
  const token = process.env.TAP_GITHUB_TOKEN?.trim()
  if (!token) {
    throw new Error("TAP_GITHUB_TOKEN is required to update homebrew-elva")
  }
  return token
}

async function updateHomebrewTap() {
  requireRepository()
  const directory = process.env.AWSESH_ARTIFACTS
  if (!directory) throw new Error("Verified staged artifacts are required")
  const release = await getRelease(`v${version}`)
  if (!release || release.draft) throw new Error("GitHub assets must be public before updating Homebrew")
  const arm64Sha = await digest(path.join(directory, "awsesh-linux-arm64.tar.gz"))
  const x64Sha = await digest(path.join(directory, "awsesh-linux-x64.tar.gz"))
  const macX64Sha = await digest(path.join(directory, "awsesh-darwin-x64.zip"))
  const macArm64Sha = await digest(path.join(directory, "awsesh-darwin-arm64.zip"))

  const channel = Script.channel
  const formulaName = Script.preview ? "awsesh-beta" : "awsesh"
  const className = Script.preview ? "AwseshBeta" : "Awsesh"
  const channelDesc = channel === "latest" ? "" : ` (${channel})`

  const homebrewFormula = [
    "# typed: false",
    "# frozen_string_literal: true",
    "",
    `class ${className} < Formula`,
    `  desc "AWS SSO session manager CLI${channelDesc}"`,
    '  homepage "https://github.com/elva-labs/awsesh"',
    '  license "MIT"',
    `  version "${version}"`,
    "",
    "  on_macos do",
    "    if Hardware::CPU.intel?",
    `      url "https://github.com/elva-labs/awsesh/releases/download/v${version}/awsesh-darwin-x64.zip"`,
    `      sha256 "${macX64Sha}"`,
    "",
    "      def install",
    '        bin.install "awsesh"',
    '        bin.install_symlink "awsesh" => "sesh"',
    "      end",
    "    end",
    "    if Hardware::CPU.arm?",
    `      url "https://github.com/elva-labs/awsesh/releases/download/v${version}/awsesh-darwin-arm64.zip"`,
    `      sha256 "${macArm64Sha}"`,
    "",
    "      def install",
    '        bin.install "awsesh"',
    '        bin.install_symlink "awsesh" => "sesh"',
    "      end",
    "    end",
    "  end",
    "",
    "  on_linux do",
    "    if Hardware::CPU.intel? and Hardware::CPU.is_64_bit?",
    `      url "https://github.com/elva-labs/awsesh/releases/download/v${version}/awsesh-linux-x64.tar.gz"`,
    `      sha256 "${x64Sha}"`,
    "      def install",
    '        bin.install "awsesh"',
    '        bin.install_symlink "awsesh" => "sesh"',
    "      end",
    "    end",
    "    if Hardware::CPU.arm? and Hardware::CPU.is_64_bit?",
    `      url "https://github.com/elva-labs/awsesh/releases/download/v${version}/awsesh-linux-arm64.tar.gz"`,
    `      sha256 "${arm64Sha}"`,
    "      def install",
    '        bin.install "awsesh"',
    '        bin.install_symlink "awsesh" => "sesh"',
    "      end",
    "    end",
    "  end",
    "",
    "  test do",
    '    system "#{bin}/awsesh", "--version"',
    "  end",
    "end",
    "",
  ].join("\n")

  const tap = await mkdtemp(path.join(tmpdir(), "awsesh-homebrew-"))
  try {
    const tapToken = getTapToken()
    const tapEnv = { ...process.env, GH_TOKEN: tapToken }
    const authentication = ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"]
    await $`git ${authentication} clone https://github.com/elva-labs/homebrew-elva.git ${tap}`.env(tapEnv)
    const formula = Bun.file(path.join(tap, "Formula", `${formulaName}.rb`))
    const previous = await formula.exists() ? await formula.text() : ""
    if (previous) {
      const match = /^\s*version "([^"]+)"/m.exec(previous)
      if (!match) throw new Error("Homebrew formula has no explicit version")
      releaseMetadata(match[1], channel)
      if (Bun.semver.order(match[1], version) > 0) {
        console.log(`Not moving Homebrew ${formulaName} backwards from ${match[1]}`)
        return
      }
      if (match[1] === version) {
        if (![arm64Sha, x64Sha, macX64Sha, macArm64Sha].every((checksum) => previous.includes(`sha256 "${checksum}"`))) {
          throw new Error("Existing Homebrew version has different artifact checksums")
        }
        console.log(`Homebrew ${formulaName} is already at ${version}`)
        return
      }
    }
    await formula.write(homebrewFormula)
    await $`git add Formula/${formulaName}.rb`.cwd(tap)
    await $`git -c user.name=elva-bot -c user.email=gh-bot@elva-group.com commit -m ${`chore(${formulaName}): release v${version}`}`.cwd(tap)
    await $`git ${authentication} push`.cwd(tap).env(tapEnv)
    console.log(`Updated Homebrew formula: ${formulaName}`)
  } finally {
    await rm(tap, { recursive: true, force: true })
  }
}

await updateHomebrewTap()
