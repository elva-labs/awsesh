import path from "node:path"
import fs from "node:fs/promises"
import type { SSOSession } from "./types"

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
          const glob = new Bun.Glob("*.json")
          const files = await Array.fromAsync(
            glob.scan({ cwd: dir, onlyFiles: true })
          )

          const sessions = await Promise.all(
            files.map((file) => Bun.file(path.join(dir, file)).json() as Promise<SSOSession>)
          )

          return sessions
        } catch {
          return []
        }
      },

      async load(name: string): Promise<SSOSession | undefined> {
        const target = path.join(dir, `${name}.json`)
        const file = Bun.file(target)
        if (!(await file.exists())) return undefined
        return file.json() as Promise<SSOSession>
      },

      async save(session: SSOSession): Promise<void> {
        await ensureDir()
        const target = path.join(dir, `${session.name}.json`)
        await Bun.write(target, JSON.stringify(session, null, 2))
      },

      async remove(name: string): Promise<void> {
        const target = path.join(dir, `${name}.json`)
        await fs.unlink(target).catch(() => {})
      },

      async exists(name: string): Promise<boolean> {
        const target = path.join(dir, `${name}.json`)
        return Bun.file(target).exists()
      },

      async count(): Promise<number> {
        try {
          await ensureDir()
          const glob = new Bun.Glob("*.json")
          const files = await Array.fromAsync(
            glob.scan({ cwd: dir, onlyFiles: true })
          )
          return files.length
        } catch {
          return 0
        }
      },
    }
  }
}

export type Sessions = ReturnType<typeof Sessions.create>
