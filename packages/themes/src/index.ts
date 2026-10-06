import path from "node:path"
import { readdir } from "node:fs/promises"
import { bundledThemes } from "./catalog"

export { bundledThemes } from "./catalog"

export type ThemeMode = "dark" | "light"
export type AppearanceMode = ThemeMode | "system"

const colorDefaults = {
  primary: "primary",
  secondary: "secondary",
  accent: "accent",
  error: "error",
  warning: "warning",
  success: "success",
  info: "info",
  text: "text",
  textMuted: "textMuted",
  selectedListItemText: "background",
  background: "background",
  backgroundPanel: "backgroundPanel",
  backgroundElement: "backgroundElement",
  backgroundMenu: "backgroundElement",
  border: "border",
  borderActive: "borderActive",
  borderSubtle: "borderSubtle",
  diffAdded: "diffAdded",
  diffRemoved: "diffRemoved",
  diffContext: "diffContext",
  diffHunkHeader: "diffHunkHeader",
  diffHighlightAdded: "diffHighlightAdded",
  diffHighlightRemoved: "diffHighlightRemoved",
  diffAddedBg: "diffAddedBg",
  diffRemovedBg: "diffRemovedBg",
  diffContextBg: "diffContextBg",
  diffLineNumber: "diffLineNumber",
  diffAddedLineNumberBg: "diffAddedLineNumberBg",
  diffRemovedLineNumberBg: "diffRemovedLineNumberBg",
  markdownText: "markdownText",
  markdownHeading: "markdownHeading",
  markdownLink: "markdownLink",
  markdownLinkText: "markdownLinkText",
  markdownCode: "markdownCode",
  markdownBlockQuote: "markdownBlockQuote",
  markdownEmph: "markdownEmph",
  markdownStrong: "markdownStrong",
  markdownHorizontalRule: "markdownHorizontalRule",
  markdownListItem: "markdownListItem",
  markdownListEnumeration: "markdownListEnumeration",
  markdownImage: "markdownImage",
  markdownImageText: "markdownImageText",
  markdownCodeBlock: "markdownCodeBlock",
  syntaxComment: "syntaxComment",
  syntaxKeyword: "syntaxKeyword",
  syntaxFunction: "syntaxFunction",
  syntaxVariable: "syntaxVariable",
  syntaxString: "syntaxString",
  syntaxNumber: "syntaxNumber",
  syntaxType: "syntaxType",
  syntaxOperator: "syntaxOperator",
  syntaxPunctuation: "syntaxPunctuation",
}

export type ThemeColors<T> = { [Key in keyof typeof colorDefaults]: T }
export type ResolvedTheme = ThemeColors<string> & {
  hasSelectedListItemText: boolean
  subtleOpacity: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function complete<T>(colors: Record<string, T>): colors is ThemeColors<T> {
  return Object.keys(colorDefaults).every((key) => Object.hasOwn(colors, key))
}

export function mapThemeColors<T>(colors: ThemeColors<string>, convert: (hex: string) => T): ThemeColors<T> {
  const result: Record<string, T> = {}
  for (const [key, value] of Object.entries(colors)) {
    if (Object.hasOwn(colorDefaults, key) && typeof value === "string") result[key] = convert(value)
  }
  if (!complete(result)) throw new Error("Incomplete theme palette")
  return result
}

function ansiColor(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 255) throw new Error("ANSI colors must be integers from 0 to 255")
  if (code < 16) {
    return [
      "#000000", "#800000", "#008000", "#808000",
      "#000080", "#800080", "#008080", "#c0c0c0",
      "#808080", "#ff0000", "#00ff00", "#ffff00",
      "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
    ][code]
  }
  if (code >= 232) {
    const gray = ((code - 232) * 10 + 8).toString(16).padStart(2, "0")
    return `#${gray.repeat(3)}`
  }
  const index = code - 16
  return "#" + [Math.floor(index / 36), Math.floor(index / 6) % 6, index % 6]
    .map((value) => (value === 0 ? 0 : value * 40 + 55).toString(16).padStart(2, "0"))
    .join("")
}

export function resolveTheme(definition: unknown, mode: ThemeMode): ResolvedTheme {
  if (!record(definition) || !record(definition.theme)) throw new Error("A theme must contain a theme object")
  if (definition.defs !== undefined && !record(definition.defs)) throw new Error("Theme definitions must be an object")
  const tokens = definition.theme
  const defs = record(definition.defs) ? definition.defs : {}

  function resolve(value: unknown, references: string[] = []): string {
    if (typeof value === "number") return ansiColor(value)
    if (record(value)) return resolve(value[mode], references)
    if (typeof value !== "string") throw new Error("Theme colors must be hex, ANSI, references or light/dark variants")
    if (value === "transparent" || value === "none") return "#00000000"
    if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) {
      return value.length <= 5 ? "#" + value.slice(1).split("").map((digit) => digit.repeat(2)).join("") : value
    }
    if (references.includes(value)) throw new Error(`Circular theme reference: ${[...references, value].join(" → ")}`)
    if (references.length >= 128) throw new Error("Theme references are too deeply nested")
    const source = Object.hasOwn(defs, value) ? defs : tokens
    if (!Object.hasOwn(source, value)) throw new Error(`Color reference "${value}" not found in defs or theme`)
    return resolve(source[value], [...references, value])
  }

  const colors: Record<string, string> = {}
  for (const [key, fallback] of Object.entries(colorDefaults)) {
    colors[key] = resolve(tokens[key] === undefined ? tokens[fallback] : tokens[key])
  }
  if (!complete(colors)) throw new Error("Incomplete theme palette")
  const opacity = tokens.subtleOpacity === undefined ? 0.6 : tokens.subtleOpacity
  if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error("Theme subtleOpacity must be between 0 and 1")
  }
  return { ...colors, hasSelectedListItemText: tokens.selectedListItemText !== undefined, subtleOpacity: opacity }
}

export async function loadThemes(configDir: string) {
  const custom: [string, unknown][] = []
  const warnings: string[] = []
  const directory = path.join(configDir, "themes")
  const files = await readdir(directory).catch((error: unknown) => {
    if (record(error) && error.code === "ENOENT") return []
    throw error
  })
  for (const entry of files.filter((name) => name.endsWith(".json")).sort()) {
    const file = path.join(directory, entry)
    try {
      const name = path.basename(file, ".json")
      if (name === "system") throw new Error("The system theme is reserved for the interface's native appearance")
      const definition: unknown = await Bun.file(file).json()
      resolveTheme(definition, "light")
      resolveTheme(definition, "dark")
      custom.push([name, definition])
    } catch (error) {
      warnings.push(`${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { themes: { ...bundledThemes, ...Object.fromEntries(custom) }, warnings }
}
