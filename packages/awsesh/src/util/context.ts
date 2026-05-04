import { AsyncLocalStorage } from "async_hooks"

export namespace Context {
  export function create<T>(name: string) {
    const storage = new AsyncLocalStorage<T>()
    
    return {
      provide<R>(value: T, fn: () => R): R {
        return storage.run(value, fn)
      },
      use(): T {
        const value = storage.getStore()
        if (!value) {
          throw new Error(`${name} context not found - must be used within a provider`)
        }
        return value
      },
      tryUse(): T | undefined {
        return storage.getStore()
      },
    }
  }
}
