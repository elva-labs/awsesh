import path from "node:path"
import fs from "node:fs/promises"

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
          const file = Bun.file(target)
          if (!(await file.exists())) return undefined
          return file.json() as Promise<T>
        } catch {
          return undefined
        }
      },

      async write<T>(key: string, value: T): Promise<void> {
        const target = path.join(dir, `${key}.json`)
        await ensureDir(path.dirname(target))
        await Bun.write(target, JSON.stringify(value, null, 2))
      },

      async update<T>(key: string, fn: (existing: T) => T): Promise<T> {
        const target = path.join(dir, `${key}.json`)
        let content: T
        try {
          const file = Bun.file(target)
          content = await file.json() as T
        } catch {
          content = {} as T
        }

        const updated = fn(content)
        await ensureDir(path.dirname(target))
        await Bun.write(target, JSON.stringify(updated, null, 2))
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
          const glob = new Bun.Glob("**/*.json")
          const results = await Array.fromAsync(
            glob.scan({ cwd: targetDir, onlyFiles: true })
          )
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
