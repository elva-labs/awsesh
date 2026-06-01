import path from "node:path"
import fs from "node:fs/promises"
import type { SSOSession } from "./types"
import { fileExists, listJsonFiles, readJsonFile, writeJsonFile } from "./filesystem"

export interface SessionsOptions {
  dir: string
}

export namespace Sessions {
  export function create(options: SessionsOptions) {
    const { dir } = options

    async function ensureDir() {
      await fs.mkdir(dir, { recursive: true }).catch(() => {})
    }

    return {
      async list(): Promise<SSOSession[]> {
        try {
          await ensureDir()
          const files = await listJsonFiles(dir)

          const sessions = await Promise.all(
            files.map((file) => readJsonFile<SSOSession>(path.join(dir, file)))
          )

          return sessions
        } catch {
          return []
        }
      },

      async load(name: string): Promise<SSOSession | undefined> {
        const target = path.join(dir, `${name}.json`)
        if (!(await fileExists(target))) return undefined
        return readJsonFile<SSOSession>(target)
      },

      async save(session: SSOSession): Promise<void> {
        await ensureDir()
        const target = path.join(dir, `${session.name}.json`)
        await writeJsonFile(target, session)
      },

      async remove(name: string): Promise<void> {
        const target = path.join(dir, `${name}.json`)
        await fs.unlink(target).catch(() => {})
      },

      async exists(name: string): Promise<boolean> {
        const target = path.join(dir, `${name}.json`)
        return fileExists(target)
      },

      async count(): Promise<number> {
        try {
          await ensureDir()
          const files = await listJsonFiles(dir)
          return files.length
        } catch {
          return 0
        }
      },
    }
  }
}

export type Sessions = ReturnType<typeof Sessions.create>
