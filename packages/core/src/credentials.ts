import path from "node:path"
import fs from "node:fs/promises"
import type { RoleCredentials } from "./types"

export interface WriteCredentialsOptions {
  awsDir: string
  profileName: string
  credentials: RoleCredentials
  region?: string
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
      aws_access_key_id: credentials.accessKeyId,
      aws_secret_access_key: credentials.secretAccessKey,
      aws_session_token: credentials.sessionToken,
    }

    if (region) {
      sections[profileName].region = region
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

    await fs.writeFile(credentialsPath, `${newContent}\n`)
  }
}
