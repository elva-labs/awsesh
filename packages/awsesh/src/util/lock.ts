import fs from "fs/promises"
import path from "path"

export namespace Lock {
  const locks = new Map<string, Promise<void>>()
  
  async function acquireLock(key: string): Promise<() => void> {
    // Wait for any existing lock on this key
    while (locks.has(key)) {
      await locks.get(key)
    }
    
    // Create new lock
    let releaseLock: () => void
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve
    })
    locks.set(key, lockPromise)
    
    return () => {
      locks.delete(key)
      releaseLock!()
    }
  }
  
  export async function read(filePath: string): Promise<Disposable> {
    const key = `read:${filePath}`
    const release = await acquireLock(key)
    
    return {
      [Symbol.dispose]() {
        release()
      },
    }
  }
  
  export async function write(key: string): Promise<Disposable> {
    const lockKey = `write:${key}`
    const release = await acquireLock(lockKey)
    
    return {
      [Symbol.dispose]() {
        release()
      },
    }
  }
}
