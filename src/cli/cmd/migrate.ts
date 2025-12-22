import { cmd } from "./cmd.js"
import { UI } from "../ui.js"
import path from "path"
import { homedir } from "os"
import fs from "fs/promises"
import type { SSOSession } from "@/types"
import { Sessions } from "@/storage/sessions"
import { Global } from "@/global"

function parseINI(content: string): Record<string, Record<string, string>> {
  const lines = content.split("\n")
  const sections: Record<string, Record<string, string>> = {}
  let currentSection = ""

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      continue
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentSection = trimmed.slice(1, -1)
      sections[currentSection] = sections[currentSection] || {}
    } else if (currentSection && trimmed.includes("=")) {
      const [key, ...valueParts] = trimmed.split("=")
      sections[currentSection][key.trim()] = valueParts.join("=").trim()
    }
  }

  return sections
}

export const migrate = cmd({
  command: "migrate",
  describe: "Migrate sessions from old INI-based config to new JSON format",
  builder: (yargs) =>
    yargs
      .option("dry-run", {
        type: "boolean",
        describe: "Show what would be migrated without making changes",
        default: false,
      })
      .option("force", {
        type: "boolean",
        describe: "Force migration even if sessions already exist",
        default: false,
      }),
  handler: async (args) => {
    const { dryRun, force } = args as { dryRun: boolean; force: boolean }

    UI.info("AWS Session Manager Migration Tool")
    console.log()

    const awsDir = path.dirname(Global.Path.awsConfig)
    const oldProfilesPath = path.join(awsDir, "awsesh")
    const oldTokensPath = path.join(awsDir, "awsesh-tokens")
    const oldAccountsPath = path.join(awsDir, "awsesh-accounts")

    const profilesExist = await Bun.file(oldProfilesPath).exists()

    if (!profilesExist) {
      UI.success("No old config found. Nothing to migrate.")
      return
    }

    UI.info("Found old config:")
    UI.info(`  ${oldProfilesPath}`)
    console.log()

    const existingCount = await Sessions.count()
    if (existingCount > 0 && !force) {
      UI.warn("You already have sessions in the new format.")
      UI.info(`  Found ${existingCount} existing session(s)`)
      console.log()
      UI.info("Use --force to migrate anyway (will merge with existing)")
      return
    }

    const profilesContent = await Bun.file(oldProfilesPath).text()
    const oldProfiles = parseINI(profilesContent)
    const profileCount = Object.keys(oldProfiles).length

    UI.info("Migration Preview:")
    console.log()
    UI.info(`  Sessions to migrate: ${profileCount}`)
    for (const name of Object.keys(oldProfiles)) {
      UI.info(`    - ${name}`)
    }
    console.log()

    if (dryRun) {
      UI.success("Dry run complete. No changes made.")
      UI.info("Run without --dry-run to perform migration.")
      return
    }

    UI.warn("This will:")
    UI.info(`  1. Create backup: ${oldProfilesPath}.bak`)
    UI.info(`  2. Migrate ${profileCount} session(s) to ~/.config/awsesh/sessions/`)
    UI.info(`  3. Delete old files: awsesh, awsesh-tokens, awsesh-accounts`)
    console.log()

    UI.info("Press Enter to continue, Ctrl+C to cancel...")
    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => resolve())
    })

    UI.info("Starting migration...")
    console.log()

    for (const [name, oldProfile] of Object.entries(oldProfiles)) {
      const session: SSOSession = {
        name,
        startUrl: oldProfile.start_url || oldProfile.startUrl || "",
        ssoRegion: oldProfile.sso_region || oldProfile.ssoRegion || "",
        defaultRegion: oldProfile.default_region || oldProfile.defaultRegion || "",
      }

      await Sessions.save(session)
      UI.success(`  Migrated: ${name}`)
    }

    console.log()

    UI.info("Creating backup...")
    await fs.copyFile(oldProfilesPath, `${oldProfilesPath}.bak`)
    UI.success(`  Created: ${oldProfilesPath}.bak`)
    console.log()

    UI.info("Cleaning up old files...")
    await fs.unlink(oldProfilesPath).catch(() => {})
    UI.success(`  Deleted: ${oldProfilesPath}`)

    if (await Bun.file(oldTokensPath).exists()) {
      await fs.unlink(oldTokensPath).catch(() => {})
      UI.success(`  Deleted: ${oldTokensPath}`)
    }

    if (await Bun.file(oldAccountsPath).exists()) {
      await fs.unlink(oldAccountsPath).catch(() => {})
      UI.success(`  Deleted: ${oldAccountsPath}`)
    }

    console.log()
    UI.success("Migration complete!")
    UI.info("Sessions are now stored in: " + Global.Path.config + "/sessions/")
    console.log()

    UI.info("Press any key to exit...")
    await new Promise<void>((resolve) => {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.once("data", () => {
        process.stdin.setRawMode(false)
        resolve()
      })
    })
  },
})
