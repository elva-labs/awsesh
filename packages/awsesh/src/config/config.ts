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
  profile_clear: string[]
  region_set: string[]
  role_list: string[]
  session_add: string[]
  session_edit: string[]
  session_delete: string[]
  credentials: string[]
  session_kill: string[]
  credentials_cleanup: string[]
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

export type DateFormat = "dd/mm/yyyy" | "mm/dd/yyyy"
export type TimeFormat = "24h" | "12h"

export type ThemeMode = "dark" | "light" | "system"

export interface AppConfig {
  theme: string
  theme_mode?: ThemeMode
  dateFormat: DateFormat
  timeFormat: TimeFormat
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
  theme_mode?: ThemeMode
  dateFormat?: DateFormat
  timeFormat?: TimeFormat
  autoAssumeRole?: boolean
  cacheAccountDuration?: number
  defaultRegion?: string
  keybinds?: UserKeybindsConfig
}

const defaultKeybinds: KeybindsConfig = {
  quit: ["ctrl+c"],
  back: ["escape"],
  help: ["?"],
  filter: ["/", "<leader>+f"],
  refresh: ["R"],
  settings: [","],
  browser_open: ["o"],
  profile_set: ["p"],
  profile_clear: ["<leader>+C"],
  region_set: ["<leader>+r"],
  role_list: ["r"],
  session_add: ["a"],
  session_edit: ["e"],
  session_delete: ["d"],
  credentials: ["c"],
  session_kill: ["<leader>+k"],
  credentials_cleanup: ["<leader>+K"],
  nav_up: ["up", "k"],
  nav_down: ["down", "j"],
  nav_left: ["left", "h"],
  nav_right: ["right", "l"],
  nav_page_up: ["pageup", "ctrl+u"],
  nav_page_down: ["pagedown", "ctrl+d"],
  select: ["enter"],
  leader: [" "],
  command_list: ["ctrl+p"],
}

export const defaultConfig: AppConfig = {
  theme: "system",
  dateFormat: "dd/mm/yyyy",
  timeFormat: "24h",
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
    theme_mode: overrides.theme_mode,
    dateFormat: overrides.dateFormat ?? defaults.dateFormat,
    timeFormat: overrides.timeFormat ?? defaults.timeFormat,
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
    
    const file = Bun.file(configPath)
    let existing: UserConfig = {}
    
    if (await file.exists()) {
      try {
        existing = await file.json() as UserConfig
      } catch {
        existing = {}
      }
    }

    const merged: UserConfig = {
      ...existing,
      ...config,
      keybinds: {
        ...existing.keybinds,
        ...config.keybinds,
      },
    }
    
    await Bun.write(configPath, JSON.stringify(merged, null, 2))
    log.info("Config saved")
  }

  function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false
    return a.every((v, i) => v === b[i])
  }

  export async function setKeybind(
    key: keyof KeybindsConfig,
    bindings: string[]
  ): Promise<void> {
    const defaultBindings = defaultKeybinds[key]
    const isDefault = arraysEqual(bindings, defaultBindings)

    const file = Bun.file(configPath)
    let existing: UserConfig = {}

    if (await file.exists()) {
      try {
        existing = await file.json() as UserConfig
      } catch {
        existing = {}
      }
    }

    const keybinds: UserKeybindsConfig = {}
    
    for (const [k, v] of Object.entries(existing.keybinds ?? {})) {
      if (k !== key) {
        keybinds[k as keyof KeybindsConfig] = v
      }
    }

    if (!isDefault) {
      keybinds[key] = bindings
    }

    const hasKeybinds = Object.keys(keybinds).length > 0
    const { keybinds: _, ...rest } = existing
    const merged: UserConfig = hasKeybinds ? { ...rest, keybinds } : rest

    const dir = path.dirname(configPath)
    await Bun.write(path.join(dir, ".keep"), "")
    await Bun.write(configPath, JSON.stringify(merged, null, 2))
    log.info("Keybind saved", { key, isDefault })
  }

  export function getDefaultKeybind(key: keyof KeybindsConfig): string[] {
    return [...defaultKeybinds[key]]
  }

  export function isDefaultKeybind(key: keyof KeybindsConfig, bindings: string[]): boolean {
    return arraysEqual(bindings, defaultKeybinds[key])
  }

  export async function setTheme(theme: string): Promise<void> {
    const isDefault = theme === defaultConfig.theme

    const file = Bun.file(configPath)
    let existing: UserConfig = {}

    if (await file.exists()) {
      try {
        existing = await file.json() as UserConfig
      } catch {
        existing = {}
      }
    }

    const { theme: _, ...rest } = existing
    const merged: UserConfig = isDefault ? rest : { ...rest, theme }

    const dir = path.dirname(configPath)
    await Bun.write(path.join(dir, ".keep"), "")
    await Bun.write(configPath, JSON.stringify(merged, null, 2))
    log.info("Theme saved", { theme, isDefault })
  }

  export async function setThemeMode(mode: ThemeMode): Promise<void> {
    const isDefault = mode === "system"

    const file = Bun.file(configPath)
    let existing: UserConfig = {}

    if (await file.exists()) {
      try {
        existing = await file.json() as UserConfig
      } catch {
        existing = {}
      }
    }

    const { theme_mode: _, ...rest } = existing
    const merged: UserConfig = isDefault ? rest : { ...rest, theme_mode: mode }

    const dir = path.dirname(configPath)
    await Bun.write(path.join(dir, ".keep"), "")
    await Bun.write(configPath, JSON.stringify(merged, null, 2))
    log.info("Theme mode saved", { mode, isDefault })
  }

  export async function setDateFormat(format: DateFormat): Promise<void> {
    const isDefault = format === defaultConfig.dateFormat

    const file = Bun.file(configPath)
    let existing: UserConfig = {}

    if (await file.exists()) {
      try {
        existing = await file.json() as UserConfig
      } catch {
        existing = {}
      }
    }

    const { dateFormat: _, ...rest } = existing
    const merged: UserConfig = isDefault ? rest : { ...rest, dateFormat: format }

    const dir = path.dirname(configPath)
    await Bun.write(path.join(dir, ".keep"), "")
    await Bun.write(configPath, JSON.stringify(merged, null, 2))
    log.info("Date format saved", { format, isDefault })
  }

  export async function setTimeFormat(format: TimeFormat): Promise<void> {
    const isDefault = format === defaultConfig.timeFormat

    const file = Bun.file(configPath)
    let existing: UserConfig = {}

    if (await file.exists()) {
      try {
        existing = await file.json() as UserConfig
      } catch {
        existing = {}
      }
    }

    const { timeFormat: _, ...rest } = existing
    const merged: UserConfig = isDefault ? rest : { ...rest, timeFormat: format }

    const dir = path.dirname(configPath)
    await Bun.write(path.join(dir, ".keep"), "")
    await Bun.write(configPath, JSON.stringify(merged, null, 2))
    log.info("Time format saved", { format, isDefault })
  }

  export function getDefaults(): AppConfig {
    return { ...defaultConfig }
  }

  export function getDefaultKeybinds(): KeybindsConfig {
    return { ...defaultKeybinds }
  }
}
