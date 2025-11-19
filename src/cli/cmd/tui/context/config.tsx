import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"

export interface KeybindsConfig {
  quit: string[]
  back: string[]
  help: string[]
  filter: string[]
  refresh: string[]
  settings: string[]
  browser_open: string[]
  profile_set: string[]
  region_set: string[]
  role_list: string[]
  profile_add: string[]
  profile_edit: string[]
  profile_delete: string[]
  nav_up: string[]
  nav_down: string[]
  nav_left: string[]
  nav_right: string[]
  nav_page_up: string[]
  nav_page_down: string[]
  select: string[]
  leader: string[]
  command_list: string[]
}

export interface AppConfig {
  theme: string
  autoAssumeRole: boolean
  cacheAccountDuration: number
  defaultRegion: string
  keybinds: KeybindsConfig
}

const defaultKeybinds: KeybindsConfig = {
  quit: ["q", "ctrl+c"],
  back: ["escape"],
  help: ["?"],
  filter: ["/"],
  refresh: ["R"],
  settings: [","],
  browser_open: ["o"],
  profile_set: ["p"],
  region_set: ["r"],
  role_list: ["l"],
  profile_add: ["a"],
  profile_edit: ["e"],
  profile_delete: ["d"],
  nav_up: ["up", "k"],
  nav_down: ["down", "j"],
  nav_left: ["left", "h"],
  nav_right: ["right", "l"],
  nav_page_up: ["pageup", "ctrl+u"],
  nav_page_down: ["pagedown", "ctrl+d"],
  select: ["enter"],
  leader: ["space"],
  command_list: ["ctrl+p"],
}

const defaultConfig: AppConfig = {
  theme: "default",
  autoAssumeRole: true,
  cacheAccountDuration: 15,
  defaultRegion: "us-east-1",
  keybinds: defaultKeybinds,
}

export const { use: useConfig, provider: ConfigProvider } = createSimpleContext({
  name: "Config",
  init: () => {
    const [store, setStore] = createStore<AppConfig>(defaultConfig)

    return {
      get data() {
        return store
      },
      set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
        setStore(key, value)
      },
    }
  },
})
