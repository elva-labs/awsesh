import path from "node:path"
import { mkdir, rename } from "node:fs/promises"
import { loadThemes, resolveTheme, type AppearanceMode } from "@awsesh/themes"

function preferences(value: unknown): { theme: string; mode: AppearanceMode; translucency: number; dithering: boolean } {
  if (typeof value !== "object" || value === null || !("theme" in value) || !("mode" in value)) {
    throw new Error("Appearance preferences must contain theme and mode")
  }
  if (typeof value.theme !== "string") throw new Error("Theme must be a name")
  if (value.mode !== "system" && value.mode !== "light" && value.mode !== "dark") {
    throw new Error("Appearance must be system, light or dark")
  }
  const legacy = "translucent" in value
  const translucency = "translucency" in value ? value.translucency : legacy && value.translucent === true ? 10 : 0
  const dithering = "dithering" in value ? value.dithering : false
  if (legacy && typeof value.translucent !== "boolean") throw new Error("Translucent mode must be a boolean")
  if (typeof dithering !== "boolean") throw new Error("Dithering must be a boolean")
  if (typeof translucency !== "number" || !Number.isFinite(translucency) || translucency < 0 || translucency > (legacy ? 100 : 10)) {
    throw new Error("Translucency must be between 0 and 10")
  }
  return {
    theme: value.theme,
    mode: value.mode,
    translucency: legacy && value.translucent === false ? 0 : Math.min(translucency, 10),
    dithering,
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
