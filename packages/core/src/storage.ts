import path from "node:path"
import fs from "node:fs/promises"
import { listJsonFiles, readJsonFile, writeJsonFile } from "./filesystem"

export interface StorageOptions {
  dir: string
}

export namespace Storage {
  export function create(options: StorageOptions) {
    const { dir } = options

    async function ensureDir(dirPath: string) {
      await fs.mkdir(dirPath, { recursive: true }).catch(() => {})
    }

    return {
      async read<T>(key: string): Promise<T | undefined> {
        const target = path.join(dir, `${key}.json`)
        try {
          return await readJsonFile<T>(target)
        } catch {
          return undefined
        }
      },

      async write<T>(key: string, value: T): Promise<void> {
        const target = path.join(dir, `${key}.json`)
        await ensureDir(path.dirname(target))
        await writeJsonFile(target, value)
      },

      async update<T>(key: string, fn: (existing: T) => T): Promise<T> {
        const target = path.join(dir, `${key}.json`)
        let content: T
        try {
          content = await readJsonFile<T>(target)
        } catch {
          content = {} as T
        }

        const updated = fn(content)
        await ensureDir(path.dirname(target))
        await writeJsonFile(target, updated)
        return updated
      },

      async remove(key: string): Promise<void> {
        const target = path.join(dir, `${key}.json`)
        try {
          await fs.unlink(target)
        } catch (error: unknown) {
          const err = error as { code?: string }
          if (err.code !== "ENOENT") throw error
        }
      },

      async list(prefix: string): Promise<string[]> {
        const targetDir = path.join(dir, prefix)
        try {
          const results = await listJsonFiles(targetDir, { recursive: true })
          return results.map(x => x.slice(0, -5)).sort()
        } catch (error: unknown) {
          const err = error as { code?: string }
          if (err.code === "ENOENT") return []
          throw error
        }
      },

      async exists(key: string): Promise<boolean> {
        const target = path.join(dir, `${key}.json`)
        try {
          await fs.access(target)
          return true
        } catch {
          return false
        }
      },
    }
  }
}

export type Storage = ReturnType<typeof Storage.create>
