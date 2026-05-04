#!/usr/bin/env bun
import { $ } from "bun"

const version = process.env.AWSESH_VERSION
if (!version) throw new Error("AWSESH_VERSION is required")

function getChannel(): string {
  if (version.includes("-alpha")) return "alpha"
  if (version.includes("-beta")) return "beta"
  return "latest"
}

function getFormulaName(): string {
  const channel = getChannel()
  if (channel === "latest") return "awsesh"
  if (channel === "beta") return "awsesh-beta"
  return "awsesh-alpha"
}

function getFormulaClassName(): string {
  const channel = getChannel()
  if (channel === "latest") return "Awsesh"
  if (channel === "beta") return "AwseshBeta"
  return "AwseshAlpha"
}

function getTapToken(): string {
  const token = process.env.TAP_GITHUB_TOKEN
  if (!token) {
    throw new Error("TAP_GITHUB_TOKEN is required to update homebrew-elva")
  }
  return token
}

function getTapRepoUrl(token: string): string {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/elva-labs/homebrew-elva.git`
}

async function updateHomebrewTap() {
  const arm64Sha = await $`sha256sum ./dist/awsesh-linux-arm64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
  const x64Sha = await $`sha256sum ./dist/awsesh-linux-x64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
  const macX64Sha = await $`sha256sum ./dist/awsesh-darwin-x64.zip | cut -d' ' -f1`.text().then((x) => x.trim())
  const macArm64Sha = await $`sha256sum ./dist/awsesh-darwin-arm64.zip | cut -d' ' -f1`.text().then((x) => x.trim())

  const channel = getChannel()
  const formulaName = getFormulaName()
  const className = getFormulaClassName()
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

  await $`rm -rf ./dist/homebrew-tap`

  try {
    const tapToken = getTapToken()
    const tapRepoUrl = getTapRepoUrl(tapToken)
    await $`git clone ${tapRepoUrl} ./dist/homebrew-tap`
    await Bun.file(`./dist/homebrew-tap/Formula/${formulaName}.rb`).write(homebrewFormula)
    await $`cd ./dist/homebrew-tap && git add Formula/${formulaName}.rb`
    await $`cd ./dist/homebrew-tap && git config user.name "elva-bot"`
    await $`cd ./dist/homebrew-tap && git config user.email "gh-bot@elva-group.com"`
    await $`cd ./dist/homebrew-tap && git commit -m "Update ${formulaName} to v${version}"`
    await $`cd ./dist/homebrew-tap && git push`
    console.log(`Updated Homebrew formula: ${formulaName}`)
  } finally {
    await $`rm -rf ./dist/homebrew-tap`
  }
}

await updateHomebrewTap()
