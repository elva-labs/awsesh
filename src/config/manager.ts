import { Storage } from "@/storage/storage"
import { Sessions } from "@/storage/sessions"
import { createHash } from "crypto"
import { Log } from "@/util/log"
import type { SSOSession, TokenCache, Account, AccountCache, LastSelected } from "@/types"
import fs from "fs/promises"
import path from "path"
import { Global } from "@/global"

const log = Log.create({ service: "config" })

export namespace ConfigManager {
  function hashUrl(url: string): string {
    return createHash("sha256").update(url).digest("hex").slice(0, 16)
  }

  export async function saveSession(session: SSOSession): Promise<void> {
    await Sessions.save(session)
  }

  export async function loadSessions(): Promise<SSOSession[]> {
    return Sessions.list()
  }

  export async function loadSession(name: string): Promise<SSOSession | null> {
    return Sessions.load(name)
  }

  export async function deleteSession(name: string): Promise<void> {
    await Sessions.remove(name)
  }

  export async function hasAnySessions(): Promise<boolean> {
    return (await Sessions.count()) > 0
  }

  export async function saveToken(
    startUrl: string,
    token: string,
    expiresAt: Date
  ): Promise<void> {
    const hash = hashUrl(startUrl)
    log.info("Saving token", { startUrl: startUrl.slice(0, 30) + "...", hash })

    await Storage.write(["token", hash], {
      token,
      expiresAt: expiresAt.toISOString(),
      startUrl,
    })
  }

  export async function loadToken(startUrl: string): Promise<TokenCache | null> {
    try {
      const hash = hashUrl(startUrl)
      const data = await Storage.read<{
        token: string
        expiresAt: string
        startUrl: string
      }>(["token", hash])

      const expiresAt = new Date(data.expiresAt)

      if (expiresAt <= new Date()) {
        log.info("Token expired", { startUrl: startUrl.slice(0, 30) + "..." })
        return null
      }

      log.info("Token loaded", { startUrl: startUrl.slice(0, 30) + "..." })
      return {
        token: data.token,
        expiresAt,
        startUrl: data.startUrl,
      }
    } catch {
      return null
    }
  }

  export async function saveAccounts(
    sessionName: string,
    accounts: Account[]
  ): Promise<void> {
    log.info("Saving accounts cache", { sessionName, count: accounts.length })

    await Storage.write(["accounts", sessionName], {
      accounts,
      lastUpdated: Date.now(),
    })
  }

  export async function loadAccounts(sessionName: string): Promise<{
    accounts: Account[]
    lastUpdated: Date
    isStale: boolean
  } | null> {
    try {
      const data = await Storage.read<AccountCache>(["accounts", sessionName])

      const lastUpdated = new Date(data.lastUpdated)
      const isStale = Date.now() - data.lastUpdated > 24 * 60 * 60 * 1000

      log.info("Accounts loaded from cache", {
        sessionName,
        count: data.accounts.length,
        isStale,
      })

      return {
        accounts: data.accounts,
        lastUpdated,
        isStale,
      }
    } catch {
      return null
    }
  }

  export async function saveLastSelected(data: Partial<LastSelected>): Promise<void> {
    log.info("Saving last selected", data)

    await Storage.update<LastSelected>(["preference", "last-selected"], (draft) => {
      Object.assign(draft, data)
    })
  }

  export async function loadLastSelected(): Promise<LastSelected> {
    try {
      return await Storage.read<LastSelected>(["preference", "last-selected"])
    } catch {
      return {}
    }
  }

  export async function saveProfileName(
    ssoSession: string,
    accountName: string,
    roleName: string,
    profileName: string
  ): Promise<void> {
    log.info("Saving profile name memory", {
      ssoSession,
      accountName,
      roleName,
      profileName
    })

    await Storage.update<Record<string, Record<string, Record<string, string>>>>(
      ["preference", "profile-names"],
      (draft) => {
        if (!draft[ssoSession]) {
          draft[ssoSession] = {}
        }
        if (!draft[ssoSession][accountName]) {
          draft[ssoSession][accountName] = {}
        }
        draft[ssoSession][accountName][roleName] = profileName
      }
    )
  }

  export async function loadProfileName(
    ssoSession: string,
    accountName: string,
    roleName: string
  ): Promise<string | null> {
    try {
      const data = await Storage.read<Record<string, Record<string, Record<string, string>>>>(
        ["preference", "profile-names"]
      )

      return data[ssoSession]?.[accountName]?.[roleName] || null
    } catch {
      return null
    }
  }

  export async function detectOldConfig(): Promise<{
    hasOldConfig: boolean
    profilesPath: string | null
  }> {
    const awsDir = path.dirname(Global.Path.awsConfig)
    const profilesPath = path.join(awsDir, "awsesh")

    try {
      await fs.access(profilesPath)
      return { hasOldConfig: true, profilesPath }
    } catch {
      return { hasOldConfig: false, profilesPath: null }
    }
  }

  export async function writeCredentials(
    profileName: string,
    accessKeyId: string,
    secretAccessKey: string,
    sessionToken: string,
    region: string
  ): Promise<void> {
    log.info("Writing credentials", { profileName, region })

    const credentialsPath = Global.Path.awsCredentials

    await fs.mkdir(path.dirname(credentialsPath), { recursive: true })

    let content = ""
    try {
      content = await fs.readFile(credentialsPath, "utf-8")
    } catch {}

    const lines = content.split("\n")
    const sections: Record<string, Record<string, string>> = {}
    let currentSection = ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        currentSection = trimmed.slice(1, -1)
        sections[currentSection] = sections[currentSection] || {}
      } else if (trimmed && currentSection && trimmed.includes("=")) {
        const [key, ...valueParts] = trimmed.split("=")
        sections[currentSection][key.trim()] = valueParts.join("=").trim()
      }
    }

    sections[profileName] = {
      aws_access_key_id: accessKeyId,
      aws_secret_access_key: secretAccessKey,
      aws_session_token: sessionToken,
      region,
    }

    const newContent = Object.entries(sections)
      .map(([section, values]) => {
        const header = `[${section}]`
        const entries = Object.entries(values)
          .map(([k, v]) => `${k} = ${v}`)
          .join("\n")
        return `${header}\n${entries}`
      })
      .join("\n\n")

    await fs.writeFile(credentialsPath, newContent + "\n")

    log.info("Credentials written", { profileName, path: credentialsPath })
  }
}
