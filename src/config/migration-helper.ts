import { ConfigManager } from "./manager"
import { Sessions } from "@/storage/sessions"
import { Storage } from "@/storage/storage"
import { UI } from "@/cli/ui"
import { Log } from "@/util/log"
import readline from "readline"

const log = Log.create({ service: "migration-helper" })

export namespace MigrationHelper {
  export async function checkAndPromptMigration(): Promise<boolean> {
    log.info("Checking for old config")

    const { hasOldConfig, profilesPath } = await ConfigManager.detectOldConfig()

    if (!hasOldConfig) {
      log.info("No old config found")
      return true
    }

    const existingCount = await Sessions.count()
    if (existingCount > 0) {
      log.info("Sessions already exist, skipping migration prompt")
      return true
    }

    const hasDeclined = await hasUserDeclinedMigration()
    if (hasDeclined) {
      log.info("User previously declined migration")
      return true
    }

    log.info("Old config detected, prompting user", { profilesPath })

    console.log()
    UI.warn("Old awsesh configuration detected!")
    console.log()
    UI.info("Found: " + profilesPath)
    console.log()
    UI.info("Would you like to migrate your sessions to the new format?")
    console.log()

    const answer = await promptYesNo("Run migration now?")

    if (!answer) {
      console.log()
      UI.info("You can run the migration later with: awsesh migrate")
      console.log()

      await markUserDeclinedMigration()

      return true
    }

    console.log()
    UI.info("Starting migration...")
    console.log()

    try {
      const { spawn } = await import("child_process")

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(process.argv[0], [process.argv[1], "migrate"], {
          stdio: "inherit",
        })

        proc.on("close", (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error("Migration exited with code " + code))
          }
        })

        proc.on("error", reject)
      })

      console.log()
      UI.info("Run awsesh again to continue.")
      console.log()
      process.exit(0)
    } catch (error) {
      log.error("Failed to run migration", { error })
      console.log()
      UI.error("Migration failed")
      UI.info("You can try again later with: awsesh migrate")
      console.log()
      process.exit(1)
    }
  }

  async function promptYesNo(question: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise<boolean>((resolve) => {
      rl.question(question + " [Y/n] ", (answer) => {
        rl.close()
        const normalized = answer.trim().toLowerCase()
        resolve(normalized === "" || normalized === "y" || normalized === "yes")
      })
    })
  }

  async function hasUserDeclinedMigration(): Promise<boolean> {
    try {
      const data = await Storage.read<{ declined: boolean }>(["preference", "migration-declined"])
      return data.declined === true
    } catch {
      return false
    }
  }

  async function markUserDeclinedMigration(): Promise<void> {
    await Storage.write(["preference", "migration-declined"], { declined: true })
    log.info("Marked migration as declined")
  }
}
