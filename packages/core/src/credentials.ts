import path from "node:path"
import fs from "node:fs/promises"
import type { RoleCredentials } from "./types"

export interface WriteCredentialsOptions {
  awsDir: string
  profileName: string
  credentials: RoleCredentials
  region?: string
}

export interface RemoveProfileOptions {
  awsDir: string
  profileName: string
}

function parseCredentialsFile(content: string): Record<string, Record<string, string>> {
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

  return sections
}

function serializeCredentialsFile(sections: Record<string, Record<string, string>>): string {
  const content = Object.entries(sections)
    .map(([section, values]) => {
      const header = `[${section}]`
      const entries = Object.entries(values)
        .map(([k, v]) => `${k} = ${v}`)
        .join("\n")
      return `${header}\n${entries}`
    })
    .join("\n\n")

  return `${content}\n`
}

export namespace Credentials {
  export async function write(options: WriteCredentialsOptions): Promise<void> {
    const { awsDir, profileName, credentials, region } = options
    const credentialsPath = path.join(awsDir, "credentials")

    await fs.mkdir(awsDir, { recursive: true })

    let content = ""
    try {
      content = await fs.readFile(credentialsPath, "utf-8")
    } catch {}

    const sections = parseCredentialsFile(content)

    sections[profileName] = {
      aws_access_key_id: credentials.accessKeyId,
      aws_secret_access_key: credentials.secretAccessKey,
      aws_session_token: credentials.sessionToken,
    }

    if (region) {
      sections[profileName].region = region
    }

    await fs.writeFile(credentialsPath, serializeCredentialsFile(sections))
  }

  export async function removeProfile(options: RemoveProfileOptions): Promise<void> {
    const { awsDir, profileName } = options
    const credentialsPath = path.join(awsDir, "credentials")

    let content = ""
    try {
      content = await fs.readFile(credentialsPath, "utf-8")
    } catch {
      return
    }

    const sections = parseCredentialsFile(content)

    if (!sections[profileName]) {
      return
    }

    delete sections[profileName]

    if (Object.keys(sections).length === 0) {
      await fs.writeFile(credentialsPath, "")
      return
    }

    await fs.writeFile(credentialsPath, serializeCredentialsFile(sections))
  }

  export async function listProfiles(awsDir: string): Promise<string[]> {
    const credentialsPath = path.join(awsDir, "credentials")

    let content = ""
    try {
      content = await fs.readFile(credentialsPath, "utf-8")
    } catch {
      return []
    }

    const sections = parseCredentialsFile(content)
    return Object.keys(sections)
  }
}
