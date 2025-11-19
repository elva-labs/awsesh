import { Storage } from "@/storage/storage"
import { createHash } from "crypto"
import { Log } from "@/util/log"
import type { SSOProfile, TokenCache, Account, AccountCache, LastSelected } from "@/types"
import fs from "fs/promises"
import { Global } from "@/global"

const log = Log.create({ service: "config" })

export namespace ConfigManager {
  // Helper to hash URLs for storage keys
  function hashUrl(url: string): string {
    return createHash("sha256").update(url).digest("hex").slice(0, 16)
  }
  
  // Profile Management
  export async function saveProfile(profile: SSOProfile): Promise<void> {
    log.info("Saving profile", { name: profile.name })
    await Storage.write(["profile", profile.name], profile)
  }
  
  export async function loadProfiles(): Promise<SSOProfile[]> {
    log.info("Loading profiles")
    try {
      const keys = await Storage.list(["profile"])
      const profiles = await Promise.all(
        keys.map(k => Storage.read<SSOProfile>(k))
      )
      log.info("Profiles loaded", { count: profiles.length })
      return profiles
    } catch {
      return []
    }
  }
  
  export async function loadProfile(name: string): Promise<SSOProfile | null> {
    try {
      return await Storage.read<SSOProfile>(["profile", name])
    } catch {
      return null
    }
  }
  
  export async function deleteProfile(name: string): Promise<void> {
    log.info("Deleting profile", { name })
    await Storage.remove(["profile", name])
  }
  
  // Token Management
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
      
      // Check if token is expired
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
  
  // Account Cache Management
  export async function saveAccounts(
    profileName: string,
    accounts: Account[]
  ): Promise<void> {
    log.info("Saving accounts cache", { profileName, count: accounts.length })
    
    await Storage.write(["accounts", profileName], {
      accounts,
      lastUpdated: Date.now(),
    })
  }
  
  export async function loadAccounts(profileName: string): Promise<{
    accounts: Account[]
    lastUpdated: Date
    isStale: boolean
  } | null> {
    try {
      const data = await Storage.read<AccountCache>(["accounts", profileName])
      
      const lastUpdated = new Date(data.lastUpdated)
      const isStale = Date.now() - data.lastUpdated > 24 * 60 * 60 * 1000 // 24 hours
      
      log.info("Accounts loaded from cache", {
        profileName,
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
  
  // Last Selected Preferences
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
  
  // Profile Name Memory
  export async function saveProfileName(
    ssoProfile: string,
    accountName: string,
    roleName: string,
    profileName: string
  ): Promise<void> {
    log.info("Saving profile name memory", { 
      ssoProfile, 
      accountName, 
      roleName, 
      profileName 
    })
    
    await Storage.update<Record<string, any>>(
      ["preference", "profile-names"],
      (draft) => {
        if (!draft[ssoProfile]) {
          draft[ssoProfile] = {}
        }
        if (!draft[ssoProfile][accountName]) {
          draft[ssoProfile][accountName] = {}
        }
        draft[ssoProfile][accountName][roleName] = profileName
      }
    )
  }
  
  export async function loadProfileName(
    ssoProfile: string,
    accountName: string,
    roleName: string
  ): Promise<string | null> {
    try {
      const data = await Storage.read<Record<string, any>>(
        ["preference", "profile-names"]
      )
      
      return data[ssoProfile]?.[accountName]?.[roleName] || null
    } catch {
      return null
    }
  }

  // Old Config Detection
  export async function detectOldConfig(): Promise<{
    hasOldConfig: boolean
    foundFiles: string[]
  }> {
    const oldConfigDir = process.env.AWS_CONFIG_FILE
      ? Global.Path.awsConfig.split("/").slice(0, -1).join("/")
      : Global.Path.awsConfig.split("/").slice(0, -1).join("/")

    const oldProfilesPath = `${oldConfigDir}/awsesh`
    const oldTokensPath = `${oldConfigDir}/awsesh-tokens`
    const oldAccountsPath = `${oldConfigDir}/awsesh-accounts`

    const foundFiles: string[] = []

    try {
      await fs.access(oldProfilesPath)
      foundFiles.push(oldProfilesPath)
    } catch {}

    try {
      await fs.access(oldTokensPath)
      foundFiles.push(oldTokensPath)
    } catch {}

    try {
      await fs.access(oldAccountsPath)
      foundFiles.push(oldAccountsPath)
    } catch {}

    return {
      hasOldConfig: foundFiles.length > 0,
      foundFiles,
    }
  }

  // AWS Credentials File Management
  export async function writeCredentials(
    profileName: string,
    accessKeyId: string,
    secretAccessKey: string,
    sessionToken: string,
    region: string
  ): Promise<void> {
    log.info("Writing credentials", { profileName, region })
    
    const credentialsPath = Global.Path.awsCredentials
    
    // Ensure directory exists
    await fs.mkdir(credentialsPath.split("/").slice(0, -1).join("/"), { recursive: true })
    
    // Read existing credentials file
    let content = ""
    try {
      content = await fs.readFile(credentialsPath, "utf-8")
    } catch {
      // File doesn't exist yet
    }
    
    // Parse INI format
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
    
    // Update or add profile
    sections[profileName] = {
      aws_access_key_id: accessKeyId,
      aws_secret_access_key: secretAccessKey,
      aws_session_token: sessionToken,
      region,
    }
    
    // Write back
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
