import path from "node:path"
import fs from "node:fs/promises"
import type { SSOSession } from "./types"
import { fileExists, legacySessionKey, listJsonFiles, readJsonFile, sessionStorageKey, writeJsonFile } from "./filesystem"

export interface SessionsOptions {
  dir: string
}

export namespace Sessions {
  export function create(options: SessionsOptions) {
    const { dir } = options

    async function ensureDir() {
      await fs.mkdir(dir, { recursive: true }).catch(() => {})
    }

    async function legacy(name: string) {
      const key = legacySessionKey(name)
      if (key === undefined) return undefined
      const target = path.join(dir, `${key}.json`)
      if (!await fileExists(target)) return undefined
      const value = await readJsonFile<SSOSession>(target)
      return value.name === name ? target : undefined
    }

    return {
      async list(): Promise<SSOSession[]> {
        try {
          await ensureDir()
          const files = await listJsonFiles(dir, { recursive: true })

          const sessions = await Promise.all(
            files.map((file) => readJsonFile<SSOSession>(path.join(dir, file)))
          )

          return [...new Map(sessions.map((session) => [session.name, session])).values()]
        } catch {
          return []
        }
      },

      async load(name: string): Promise<SSOSession | undefined> {
        const indexed = path.join(dir, `${sessionStorageKey(name)}.json`)
        const target = await fileExists(indexed) ? indexed : await legacy(name)
        if (!target) return undefined
        return readJsonFile<SSOSession>(target)
      },

      async save(session: SSOSession): Promise<void> {
        if (!session.name.trim()) throw new Error("Session name is required")
        const target = path.join(dir, `${sessionStorageKey(session.name)}.json`)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await writeJsonFile(target, session)
        const previous = await legacy(session.name)
        if (previous) await fs.unlink(previous)
      },

      async remove(name: string): Promise<void> {
        const target = path.join(dir, `${sessionStorageKey(name)}.json`)
        if (await fileExists(target)) await fs.unlink(target)
        const previous = await legacy(name)
        if (previous) await fs.unlink(previous)
      },

      async exists(name: string): Promise<boolean> {
        return await fileExists(path.join(dir, `${sessionStorageKey(name)}.json`)) || !!await legacy(name)
      },

      async count(): Promise<number> {
        try {
          await ensureDir()
          const files = await listJsonFiles(dir, { recursive: true })
          return files.length
        } catch {
          return 0
        }
      },
    }
  }
}

export type Sessions = ReturnType<typeof Sessions.create>
