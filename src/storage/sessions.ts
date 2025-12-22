import { Log } from "@/util/log"
import path from "path"
import fs from "fs/promises"
import { Global } from "@/global"
import type { SSOSession } from "@/types"

const log = Log.create({ service: "sessions" })

export namespace Sessions {
  const dir = path.join(Global.Path.config, "sessions")

  async function ensureDir() {
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
  }

  export async function save(session: SSOSession): Promise<void> {
    log.info("Saving session", { name: session.name })
    await ensureDir()
    const target = path.join(dir, `${session.name}.json`)
    await Bun.write(target, JSON.stringify(session, null, 2))
  }

  export async function load(name: string): Promise<SSOSession | null> {
    const target = path.join(dir, `${name}.json`)
    const file = Bun.file(target)
    if (!(await file.exists())) return null
    return file.json()
  }

  export async function list(): Promise<SSOSession[]> {
    log.info("Loading sessions")
    try {
      await ensureDir()
      const glob = new Bun.Glob("*.json")
      const files = await Array.fromAsync(
        glob.scan({ cwd: dir, onlyFiles: true })
      )

      const sessions = await Promise.all(
        files.map((file) => Bun.file(path.join(dir, file)).json())
      )

      log.info("Sessions loaded", { count: sessions.length })
      return sessions
    } catch {
      return []
    }
  }

  export async function remove(name: string): Promise<void> {
    log.info("Deleting session", { name })
    const target = path.join(dir, `${name}.json`)
    await fs.unlink(target).catch(() => {})
  }

  export async function exists(name: string): Promise<boolean> {
    const target = path.join(dir, `${name}.json`)
    return Bun.file(target).exists()
  }

  export async function count(): Promise<number> {
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
  }
}
