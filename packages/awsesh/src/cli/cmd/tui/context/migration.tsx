import path from "node:path"
import fs from "node:fs/promises"
import { createEffect, type ParentProps } from "solid-js"
import { Global } from "@/global"
import { useKV } from "./kv"
import { useAwsesh } from "./awsesh"
import { useAWS } from "./aws"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogConfirm } from "../ui/dialog-confirm"
import type { SSOSession } from "@awsesh/core"

const MIGRATION_CHECKED_KEY = "migration-checked"

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

async function runMigration(awsesh: ReturnType<typeof useAwsesh>): Promise<{ migrated: number; errors: string[] }> {
  const awsDir = Global.Path.aws
  const oldProfilesPath = path.join(awsDir, "awsesh")
  const oldTokensPath = path.join(awsDir, "awsesh-tokens")
  const oldAccountsPath = path.join(awsDir, "awsesh-accounts")

  const profilesContent = await Bun.file(oldProfilesPath).text()
  const oldProfiles = parseINI(profilesContent)
  const profilesToMigrate = Object.keys(oldProfiles).filter((name) => name !== "metadata")

  const errors: string[] = []
  let migrated = 0

  for (const name of profilesToMigrate) {
    const oldProfile = oldProfiles[name]
    const session: SSOSession = {
      name,
      startUrl: oldProfile.start_url || oldProfile.startUrl || "",
      ssoRegion: oldProfile.sso_region || oldProfile.ssoRegion || "",
      defaultRegion: oldProfile.default_region || oldProfile.defaultRegion || "",
    }

    try {
      await awsesh.sessions.save(session)
      migrated++
    } catch (e) {
      errors.push(`Failed to migrate ${name}: ${e}`)
    }
  }

  await fs.copyFile(oldProfilesPath, `${oldProfilesPath}.bak`).catch(() => {})
  await fs.unlink(oldProfilesPath).catch(() => {})
  await fs.unlink(oldTokensPath).catch(() => {})
  await fs.unlink(oldAccountsPath).catch(() => {})

  return { migrated, errors }
}

export function MigrationProvider(props: ParentProps) {
  const kv = useKV()
  const awsesh = useAwsesh()
  const aws = useAWS()
  const dialog = useDialog()
  const toast = useToast()

  createEffect(() => {
    if (!kv.ready) return

    ;(async () => {
      if (kv.get(MIGRATION_CHECKED_KEY, false)) {
        return
      }

      const awsDir = Global.Path.aws
      const oldProfilesPath = path.join(awsDir, "awsesh")
      const hasOldConfig = await Bun.file(oldProfilesPath).exists()

      if (!hasOldConfig) {
        kv.set(MIGRATION_CHECKED_KEY, true)
        return
      }

      const existingCount = await awsesh.sessions.count()
      if (existingCount > 0) {
        kv.set(MIGRATION_CHECKED_KEY, true)
        return
      }

      const confirmed = await DialogConfirm.show(
        dialog,
        {
          title: "Old config detected",
          message: "Would you like to migrate your sessions to the new format?",
          confirmLabel: "Migrate",
          cancelLabel: "Skip",
        }
      )

      kv.set(MIGRATION_CHECKED_KEY, true)

      if (confirmed) {
        try {
          const result = await runMigration(awsesh)
          if (result.errors.length > 0) {
            toast.show({
              variant: "warning",
              message: `Migrated ${result.migrated} sessions with ${result.errors.length} errors`,
              duration: 5000,
            })
          } else {
            toast.show({
              variant: "success",
              message: `Migrated ${result.migrated} sessions`,
            })
          }
          await aws.refreshSessions()
        } catch (e) {
          toast.error(e)
        }
      } else {
        toast.show({
          variant: "info",
          message: "Migration skipped. Run 'awsesh migrate' to migrate later.",
          duration: 5000,
        })
      }
    })()
  })

  return <>{props.children}</>
}
