import { Log } from "@/util/log"
import path from "path"
import fs from "fs/promises"
import { Global } from "@/global"
import { Lock } from "@/util/lock"

const log = Log.create({ service: "storage" })

export namespace Storage {
  const state = {
    dir: path.join(Global.Path.data, "storage")
  }
  
  async function ensureDir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true }).catch(() => {})
  }
  
  export async function remove(key: string[]) {
    const target = path.join(state.dir, ...key) + ".json"
    log.debug("remove", { key, target })
    
    try {
      using _ = await Lock.write("storage")
      await fs.unlink(target)
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error
      }
    }
  }
  
  export async function read<T>(key: string[]): Promise<T> {
    const target = path.join(state.dir, ...key) + ".json"
    log.debug("read", { key, target })
    
    try {
      using _ = await Lock.read(target)
      const content = await Bun.file(target).json()
      return content as T
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(`Storage key not found: ${key.join("/")}`)
      }
      throw error
    }
  }
  
  export async function write<T>(key: string[], content: T) {
    const target = path.join(state.dir, ...key) + ".json"
    log.debug("write", { key, target })
    
    using _ = await Lock.write("storage")
    
    // Ensure directory exists
    await ensureDir(path.dirname(target))
    
    await Bun.write(target, JSON.stringify(content, null, 2))
  }
  
  export async function update<T>(key: string[], fn: (draft: T) => void) {
    const target = path.join(state.dir, ...key) + ".json"
    log.debug("update", { key, target })
    
    using _ = await Lock.write("storage")
    
    let content: T
    try {
      content = await Bun.file(target).json()
    } catch {
      // If file doesn't exist, start with empty object
      content = {} as T
    }
    
    fn(content)
    
    await ensureDir(path.dirname(target))
    await Bun.write(target, JSON.stringify(content, null, 2))
    
    return content
  }
  
  export async function list(prefix: string[]): Promise<string[][]> {
    const dir = path.join(state.dir, ...prefix)
    log.debug("list", { prefix, dir })
    
    try {
      const glob = new Bun.Glob("**/*.json")
      const results = await Array.fromAsync(
        glob.scan({
          cwd: dir,
          onlyFiles: true,
        })
      )
      
      return results
        .map(x => [...prefix, ...x.slice(0, -5).split(path.sep)])
        .sort()
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return []
      }
      throw error
    }
  }
  
  export async function exists(key: string[]): Promise<boolean> {
    const target = path.join(state.dir, ...key) + ".json"
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }
}
