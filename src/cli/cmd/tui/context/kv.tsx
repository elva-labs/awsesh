import path from "path"
import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { Global } from "@/global"

export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const [ready, setReady] = createSignal(false)
    const [store, setStore] = createStore<Record<string, any>>({})
    const file = Bun.file(path.join(Global.Path.data, "kv.json"))

    file
      .json()
      .then((data) => {
        setStore(data)
      })
      .catch(() => {})
      .finally(() => {
        setReady(true)
      })

    function persist() {
      Bun.write(file, JSON.stringify(store, null, 2))
    }

    return {
      get ready() {
        return ready()
      },
      get<T>(key: string, defaultValue: T): T {
        const value = store[key]
        if (value === undefined) return defaultValue
        return value as T
      },
      set<T>(key: string, value: T) {
        setStore(key, value)
        persist()
      },
      delete(key: string) {
        setStore((s) => {
          const copy = { ...s }
          delete copy[key]
          return copy
        })
        persist()
      },
      clear() {
        setStore({})
        persist()
      },
    }
  },
})
