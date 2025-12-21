import path from "node:path"
import { Global } from "@/global"
import { Log } from "@/util/log"

const log = Log.create({ service: "config" })

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

export type UserKeybindsConfig = Partial<{
  [K in keyof KeybindsConfig]: string[]
}>

export interface UserConfig {
  theme?: string
  autoAssumeRole?: boolean
  cacheAccountDuration?: number
  defaultRegion?: string
  keybinds?: UserKeybindsConfig
}

const defaultKeybinds: KeybindsConfig = {
  quit: ["ctrl+c", "<leader>q"],
  back: ["escape"],
  help: ["?"],
  filter: ["<leader>/"],
  refresh: ["<leader>r"],
  settings: ["<leader>,"],
  browser_open: ["<leader>o"],
  profile_set: ["<leader>p"],
  region_set: ["<leader>r"],
  role_list: ["<leader>l"],
  profile_add: ["<leader>a"],
  profile_edit: ["<leader>e"],
  profile_delete: ["<leader>d"],
  nav_up: ["up", "k"],
  nav_down: ["down", "j"],
  nav_left: ["left", "h"],
  nav_right: ["right", "l"],
  nav_page_up: ["pageup", "ctrl+u"],
  nav_page_down: ["pagedown", "ctrl+d"],
  select: ["enter"],
  leader: ["ctrl+x"],
  command_list: ["ctrl+p"],
}

export const defaultConfig: AppConfig = {
  theme: "default",
  autoAssumeRole: true,
  cacheAccountDuration: 15,
  defaultRegion: "us-east-1",
  keybinds: defaultKeybinds,
}

function mergeKeybinds(
  defaults: KeybindsConfig,
  overrides?: UserKeybindsConfig
): KeybindsConfig {
  if (!overrides) return { ...defaults }
  
  const merged = { ...defaults }
  for (const key of Object.keys(overrides) as (keyof KeybindsConfig)[]) {
    const value = overrides[key]
    if (value !== undefined) {
      merged[key] = value
    }
  }
  return merged
}

function mergeConfig(defaults: AppConfig, overrides?: UserConfig): AppConfig {
  if (!overrides) return { ...defaults }

  return {
    theme: overrides.theme ?? defaults.theme,
    autoAssumeRole: overrides.autoAssumeRole ?? defaults.autoAssumeRole,
    cacheAccountDuration: overrides.cacheAccountDuration ?? defaults.cacheAccountDuration,
    defaultRegion: overrides.defaultRegion ?? defaults.defaultRegion,
    keybinds: mergeKeybinds(defaults.keybinds, overrides.keybinds),
  }
}

export namespace Config {
  const configPath = path.join(Global.Path.config, "config.json")

  export async function load(): Promise<AppConfig> {
    log.info("Loading config", { path: configPath })
    
    const file = Bun.file(configPath)
    const exists = await file.exists()
    
    if (!exists) {
      log.info("Config file not found, using defaults")
      return { ...defaultConfig }
    }

    try {
      const userConfig = await file.json() as UserConfig
      log.info("Config loaded", { path: configPath })
      return mergeConfig(defaultConfig, userConfig)
    } catch (error) {
      log.error("Failed to parse config file, using defaults", { error })
      return { ...defaultConfig }
    }
  }

  export async function save(config: UserConfig): Promise<void> {
    log.info("Saving config", { path: configPath })
    
    const dir = path.dirname(configPath)
    await Bun.write(path.join(dir, ".keep"), "")
    
    await Bun.write(configPath, JSON.stringify(config, null, 2))
    log.info("Config saved")
  }

  export function getDefaults(): AppConfig {
    return { ...defaultConfig }
  }

  export function getDefaultKeybinds(): KeybindsConfig {
    return { ...defaultKeybinds }
  }
}
