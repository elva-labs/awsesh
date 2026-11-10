import path from "node:path"
import fs from "node:fs/promises"
import type { ManagedProfile, ProfileDefinition } from "./types"

// Marks the ~/.aws/config sections awsesh owns, so it never touches profiles someone wrote by hand
export const MANAGED_MARKER = "# Managed by awsesh. Edit profiles in awsesh, not here."

const NAME = /^[a-zA-Z0-9_-]{1,128}$/

export interface ConfigEntry {
  name: string
  command: string
  region?: string
}

export interface ApplyResult {
  content: string
  written: string[]
  removed: string[]
  conflicts: string[]
}

interface Section {
  header?: string
  name?: string
  lines: string[]
}

function sections(content: string): Section[] {
  const result: Section[] = [{ lines: [] }]
  for (const line of content.split(/\r?\n/)) {
    const header = /^\s*\[\s*(.+?)\s*\]\s*$/.exec(line)
    if (header) {
      const profile = /^profile\s+(.+)$/.exec(header[1])
      result.push({ header: line, name: profile ? profile[1] : header[1], lines: [] })
    } else {
      result[result.length - 1].lines.push(line)
    }
  }
  return result
}

const managed = (section: Section) => section.lines.some((line) => line.trim() === MANAGED_MARKER)

function body(entry: ConfigEntry): string[] {
  return [
    `[profile ${entry.name}]`,
    MANAGED_MARKER,
    `credential_process = ${entry.command}`,
    ...(entry.region ? [`region = ${entry.region}`] : []),
  ]
}

function trimTrailing(lines: string[]) {
  const copy = [...lines]
  while (copy.length > 0 && copy[copy.length - 1].trim() === "") copy.pop()
  return copy
}

export namespace Profiles {
  export function validateName(name: string) {
    if (!NAME.test(name)) throw new Error("Profile names may use letters, digits, - and _ (up to 128)")
    if (name === "default") throw new Error("The default profile is reserved for sesh set")
  }

  // `<accountName>_<accountId>_<role>`: the AWS access portal's `<accountId>_<role>` with the account name in front
  export function suggestName(accountName: string, accountId: string, role: string) {
    const part = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
    return [part(accountName), accountId, part(role)].filter(Boolean).join("_").slice(0, 128)
  }

  export function quoteCommand(argv: string[]) {
    return argv.map((part) => (/[\s"]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part)).join(" ")
  }

  /**
   * Rewrites the awsesh-managed `[profile x]` sections of an AWS config file and leaves everything else as it was.
   * A section with the same name that awsesh does not manage is a conflict and is left alone.
   */
  export function apply(content: string, entries: ConfigEntry[]): ApplyResult {
    const wanted = new Map(entries.map((entry) => [entry.name, entry]))
    const written: string[] = []
    const removed: string[] = []
    const conflicts: string[] = []
    const out: string[] = []
    const block = (entry: ConfigEntry) => {
      if (out.length > 0 && out[out.length - 1].trim() !== "") out.push("")
      out.push(...body(entry), "")
      written.push(entry.name)
      wanted.delete(entry.name)
    }

    for (const section of sections(content)) {
      const isProfile = section.header !== undefined && /^\s*\[\s*profile\s/.test(section.header)
      const entry = isProfile ? wanted.get(section.name!) : undefined
      if (isProfile && managed(section)) {
        if (entry) block(entry)
        else removed.push(section.name!)
        continue
      }
      if (entry) {
        conflicts.push(entry.name)
        wanted.delete(entry.name)
      }
      if (section.header !== undefined) out.push(section.header)
      out.push(...section.lines)
    }
    for (const entry of [...wanted.values()]) block(entry)

    const lines = trimTrailing(out)
    return { content: lines.length > 0 ? `${lines.join("\n")}\n` : "", written, removed, conflicts }
  }

  export function file(configDir: string) {
    return path.join(configDir, "profiles.json")
  }

  export async function read(configDir: string): Promise<ManagedProfile[]> {
    let raw: unknown
    try {
      raw = JSON.parse(await fs.readFile(file(configDir), "utf-8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw new Error(`${file(configDir)} is not valid JSON`)
    }
    const profiles = typeof raw === "object" && raw !== null && "profiles" in raw ? raw.profiles : undefined
    if (typeof profiles !== "object" || profiles === null || Array.isArray(profiles)) return []
    return Object.entries(profiles as Record<string, Partial<ProfileDefinition>>)
      .filter(([, value]) =>
        typeof value?.session === "string" && typeof value.account === "string" && typeof value.role === "string")
      .map(([name, value]) => ({
        name,
        session: value.session!,
        account: value.account!,
        role: value.role!,
        ...(typeof value.region === "string" && value.region ? { region: value.region } : {}),
      }))
  }

  export async function write(configDir: string, profiles: ManagedProfile[]) {
    const target = file(configDir)
    let existing: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(await fs.readFile(target, "utf-8"))
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) existing = parsed
    } catch {}
    const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name))
    const value = {
      ...existing,
      profiles: Object.fromEntries(sorted.map(({ name, ...definition }) => [name, definition])),
    }
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`)
  }
}
