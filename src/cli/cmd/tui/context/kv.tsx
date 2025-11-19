import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"

export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const [store, setStore] = createStore<Record<string, any>>({})

    return {
      get<T>(key: string, defaultValue: T): T {
        const value = store[key]
        if (value === undefined) return defaultValue
        return value as T
      },
      set<T>(key: string, value: T) {
        setStore(key, value)
      },
      delete(key: string) {
        setStore((s) => {
          const copy = { ...s }
          delete copy[key]
          return copy
        })
      },
      clear() {
        setStore({})
      },
    }
  },
})
