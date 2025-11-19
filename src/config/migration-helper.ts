/**
 * Migration Helper
 * 
 * Handles automatic detection of old awsesh INI-based config files and prompts
 * the user to migrate to the new JSON-based storage format.
 * 
 * Flow:
 * 1. Detects if old config files exist (~/.aws/awsesh, awsesh-tokens, awsesh-accounts)
 * 2. Checks if new profiles already exist (skip if migrated)
 * 3. Checks if user previously declined migration (skip if already asked)
 * 4. Prompts user to migrate with Y/n question
 * 5. If yes, spawns the `awsesh migrate` command
 * 6. If no, saves preference to not ask again
 * 
 * The check is run automatically on every command except:
 * - migrate (to avoid recursion)
 * - --help, -h (help commands)
 * - --version, -v (version commands)
 */

import { ConfigManager } from "./manager"
import { UI } from "@/cli/ui"
import { Log } from "@/util/log"
import { Storage } from "@/storage/storage"
import readline from "readline"

const log = Log.create({ service: "migration-helper" })

export namespace MigrationHelper {
  /**
   * Check if user needs migration and prompt them if old config is detected
   * Returns true if migration was performed or not needed, false if user declined
   */
  export async function checkAndPromptMigration(): Promise<boolean> {
    log.info("Checking for old config")
    
    const { hasOldConfig, foundFiles } = await ConfigManager.detectOldConfig()
    
    if (!hasOldConfig) {
      log.info("No old config found")
      return true
    }

    // Check if we already have new profiles
    const existingProfiles = await ConfigManager.loadProfiles()
    if (existingProfiles.length > 0) {
      log.info("New profiles already exist, skipping migration prompt")
      return true
    }

    // Check if user has already been prompted and declined
    const hasDeclined = await hasUserDeclinedMigration()
    if (hasDeclined) {
      log.info("User previously declined migration")
      return true
    }

    log.info("Old config detected, prompting user", { foundFiles })

    // Show detection message
    console.log()
    UI.warn("🔍 Old awsesh configuration detected!")
    console.log()
    UI.info("Found the following old config files:")
    for (const file of foundFiles) {
      UI.info(`  • ${file}`)
    }
    console.log()
    UI.info("Would you like to migrate your configuration to the new format?")
    UI.info("This will preserve all your profiles, tokens, and cached accounts.")
    console.log()

    // Prompt user
    const answer = await promptYesNo("Run migration now?")
    
    if (!answer) {
      console.log()
      UI.info("You can run the migration later with: awsesh migrate")
      console.log()
      
      // Save that user declined so we don't prompt again
      await markUserDeclinedMigration()
      
      return true  // Changed to true - let them continue using the app
    }

    // Run migration
    console.log()
    UI.info("🚀 Starting migration...")
    console.log()

    try {
      // We need to spawn the migrate command as a separate process
      // to avoid circular dependencies and ensure proper execution
      const { spawn } = await import("child_process")
      
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(process.argv[0], [process.argv[1], "migrate"], {
          stdio: "inherit",
        })

        proc.on("close", (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`Migration exited with code ${code}`))
          }
        })

        proc.on("error", (err) => {
          reject(err)
        })
      })

      // Migration successful
      console.log()
      UI.info("🎉 You're all set! Run awsesh again to continue.")
      console.log()
      process.exit(0)
      
    } catch (error) {
      log.error("Failed to run migration", { error })
      console.log()
      UI.error("✗ Migration failed")
      UI.info("You can try again later with: awsesh migrate")
      console.log()
      process.exit(1)
    }
  }

  /**
   * Prompt user for yes/no answer
   */
  async function promptYesNo(question: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise<boolean>((resolve) => {
      rl.question(`${question} [Y/n] `, (answer) => {
        rl.close()
        const normalized = answer.trim().toLowerCase()
        resolve(normalized === "" || normalized === "y" || normalized === "yes")
      })
    })
  }

  /**
   * Check if user has declined migration previously
   */
  async function hasUserDeclinedMigration(): Promise<boolean> {
    try {
      const data = await Storage.read<{ declined: boolean }>(["preference", "migration-declined"])
      return data.declined === true
    } catch {
      return false
    }
  }

  /**
   * Mark that user has declined migration
   */
  async function markUserDeclinedMigration(): Promise<void> {
    await Storage.write(["preference", "migration-declined"], { declined: true })
    log.info("Marked migration as declined")
  }
}
