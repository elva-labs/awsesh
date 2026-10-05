import path from "node:path"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { bundledThemes, loadThemes, resolveTheme, type AppearanceMode } from "@awsesh/themes"

function preferences(value: unknown): { theme: string; mode: AppearanceMode; translucency: number; dithering: boolean; sidebarVisible: boolean; sidebarWidth: number; shortcuts: Record<string, string> } {
  if (typeof value !== "object" || value === null || !("theme" in value) || !("mode" in value)) {
    throw new Error("Appearance preferences must contain theme and mode")
  }
  if (typeof value.theme !== "string") throw new Error("Theme must be a name")
  if (value.mode !== "system" && value.mode !== "light" && value.mode !== "dark") {
    throw new Error("Appearance must be system, light or dark")
  }
  const legacy = "translucent" in value
  const translucency = "translucency" in value ? value.translucency : legacy && value.translucent === false ? 0 : 10
  const dithering = "dithering" in value ? value.dithering : false
  const sidebarVisible = "sidebarVisible" in value ? value.sidebarVisible : true
  const sidebarWidth = "sidebarWidth" in value ? value.sidebarWidth : 216
  const shortcuts = "shortcuts" in value ? value.shortcuts : {}
  if (typeof shortcuts !== "object" || shortcuts === null || Array.isArray(shortcuts)) {
    throw new Error("Shortcuts must be an object")
  }
  const bindings: Record<string, string> = {}
  for (const [action, shortcut] of Object.entries(shortcuts)) {
    if (!/^[a-z][a-z_]{0,63}$/.test(action) || typeof shortcut !== "string" || shortcut.length > 64 || /\s/.test(shortcut)) {
      throw new Error("Invalid shortcut preference")
    }
    bindings[action] = shortcut
  }
  if (legacy && typeof value.translucent !== "boolean") throw new Error("Translucent mode must be a boolean")
  if (typeof dithering !== "boolean") throw new Error("Dithering must be a boolean")
  if (typeof sidebarVisible !== "boolean") throw new Error("Sidebar visibility must be a boolean")
  if (typeof sidebarWidth !== "number" || !Number.isFinite(sidebarWidth) || sidebarWidth < 192 || sidebarWidth > 400) {
    throw new Error("Sidebar width must be between 192 and 400")
  }
  if (typeof translucency !== "number" || !Number.isFinite(translucency) || translucency < 0 || translucency > 100) {
    throw new Error("Translucency must be between 0 and 100")
  }
  return {
    theme: value.theme,
    mode: value.mode,
    translucency: legacy && value.translucent === false ? 0 : translucency,
    dithering,
    sidebarVisible,
    sidebarWidth,
    shortcuts: bindings,
  }
}

export async function configureAppearance(configDir: string, dataDir: string, selection?: unknown) {
  const catalog = await loadThemes(configDir)
  const filename = path.join(configDir, "desktop.json")
  const file = Bun.file(filename)
  const exists = await file.exists()
  let value: unknown = { theme: "system", mode: "system" }
  if (exists) value = await file.json()
  if (!exists) {
    const legacy = Bun.file(path.join(dataDir, "storage", "preference", "desktop-appearance.json"))
    if (await legacy.exists()) {
      const previous: unknown = await legacy.json()
      if (typeof previous === "object" && previous !== null && "appearance" in previous) {
        const mode = previous.appearance === "light" || previous.appearance === "dark" ? previous.appearance : "system"
        value = { theme: "system", mode }
      }
    }
  }
  const current = preferences(value)
  value = current
  if (selection !== undefined) {
    if (typeof selection !== "object" || selection === null || Array.isArray(selection)) {
      throw new Error("Invalid appearance preferences")
    }
    value = {
      theme: "theme" in selection ? selection.theme : current.theme,
      mode: "mode" in selection ? selection.mode : current.mode,
      translucency: "translucency" in selection ? selection.translucency : current.translucency,
      dithering: "dithering" in selection ? selection.dithering : current.dithering,
      sidebarVisible: "sidebarVisible" in selection ? selection.sidebarVisible : current.sidebarVisible,
      sidebarWidth: "sidebarWidth" in selection ? selection.sidebarWidth : current.sidebarWidth,
      shortcuts: "shortcuts" in selection ? selection.shortcuts : current.shortcuts,
    }
  }
  const requested = preferences(value)
  const selected = { ...requested }
  if (selected.theme !== "system" && !Object.hasOwn(catalog.themes, selected.theme)) {
    if (typeof selection === "object" && selection !== null && "theme" in selection) {
      throw new Error(`Theme not found: ${selected.theme}`)
    }
    catalog.warnings.push(`Theme "${selected.theme}" is unavailable; using the system theme`)
    selected.theme = "system"
  }
  const definition = catalog.themes[selected.theme]
  const palettes = selected.theme === "system" ? undefined : {
    light: resolveTheme(definition, "light"),
    dark: resolveTheme(definition, "dark"),
  }
  if (selection !== undefined) {
    await mkdir(configDir, { recursive: true })
    const temporary = `${filename}.${process.pid}.tmp`
    await Bun.write(temporary, JSON.stringify(requested, null, 2))
    await rename(temporary, filename)
  }
  return {
    ...selected,
    themes: ["system", ...Object.keys(catalog.themes).sort((first, second) => first.localeCompare(second))],
    palettes,
    warnings: catalog.warnings,
  }
}

export async function prepareThemeDirectory(configDir: string) {
  const directory = path.join(configDir, "themes")
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, "theme.json.example"), `${JSON.stringify(bundledThemes.github, null, 2)}\n`, { flag: "wx" }).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") return
    throw error
  })
  return directory
}
