import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import {
  Config,
  defaultConfig,
  type AppConfig,
  type KeybindsConfig,
  type UserConfig,
} from "@/config/config"

export type { AppConfig, KeybindsConfig, UserConfig }
export { defaultConfig }

export const { use: useConfig, provider: ConfigProvider } = createSimpleContext({
  name: "Config",
  init: () => {
    const [ready, setReady] = createSignal(false)
    const [store, setStore] = createStore<AppConfig>(defaultConfig)

    Config.load()
      .then((config) => {
        setStore(config)
      })
      .catch(() => {})
      .finally(() => {
        setReady(true)
      })

    return {
      get ready() {
        return ready()
      },
      get data() {
        return store
      },
      set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
        setStore(key, value)
      },
    }
  },
})
