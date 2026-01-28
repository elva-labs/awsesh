import path from "node:path"
import { RGBA, type TerminalColors } from "@opentui/core"
import { createEffect, createMemo } from "solid-js"
import { createSimpleContext } from "./helper"
import { useConfig } from "./config"
import { Config, type ThemeMode } from "@/config/config"
import { createStore, produce } from "solid-js/store"
import { useRenderer } from "@opentui/solid"

import { Global } from "@/global"
import aura from "./theme/aura.json" with { type: "json" }
import ayu from "./theme/ayu.json" with { type: "json" }
import carbonfox from "./theme/carbonfox.json" with { type: "json" }
import catppuccin from "./theme/catppuccin.json" with { type: "json" }
import catppuccinFrappe from "./theme/catppuccin-frappe.json" with { type: "json" }
import catppuccinMacchiato from "./theme/catppuccin-macchiato.json" with { type: "json" }
import cobalt2 from "./theme/cobalt2.json" with { type: "json" }
import cursor from "./theme/cursor.json" with { type: "json" }
import deltarune from "./theme/deltarune.json" with { type: "json" }
import dracula from "./theme/dracula.json" with { type: "json" }
import everforest from "./theme/everforest.json" with { type: "json" }
import flexoki from "./theme/flexoki.json" with { type: "json" }
import github from "./theme/github.json" with { type: "json" }
import gruvbox from "./theme/gruvbox.json" with { type: "json" }
import kanagawa from "./theme/kanagawa.json" with { type: "json" }
import lucentOrng from "./theme/lucent-orng.json" with { type: "json" }
import material from "./theme/material.json" with { type: "json" }
import matrix from "./theme/matrix.json" with { type: "json" }
import mercury from "./theme/mercury.json" with { type: "json" }
import monokai from "./theme/monokai.json" with { type: "json" }
import nightowl from "./theme/nightowl.json" with { type: "json" }
import nord from "./theme/nord.json" with { type: "json" }
import oneDark from "./theme/one-dark.json" with { type: "json" }
import opencode from "./theme/opencode.json" with { type: "json" }
import orng from "./theme/orng.json" with { type: "json" }
import osakaJade from "./theme/osaka-jade.json" with { type: "json" }
import palenight from "./theme/palenight.json" with { type: "json" }
import rosepine from "./theme/rosepine.json" with { type: "json" }
import solarized from "./theme/solarized.json" with { type: "json" }
import synthwave84 from "./theme/synthwave84.json" with { type: "json" }
import tokyonight from "./theme/tokyonight.json" with { type: "json" }
import undertale from "./theme/undertale.json" with { type: "json" }
import vercel from "./theme/vercel.json" with { type: "json" }
import vesper from "./theme/vesper.json" with { type: "json" }
import zenburn from "./theme/zenburn.json" with { type: "json" }

type ThemeColors = {
  primary: RGBA
  secondary: RGBA
  accent: RGBA
  error: RGBA
  warning: RGBA
  success: RGBA
  info: RGBA
  text: RGBA
  textMuted: RGBA
  selectedListItemText: RGBA
  background: RGBA
  backgroundPanel: RGBA
  backgroundElement: RGBA
  backgroundMenu: RGBA
  border: RGBA
  borderActive: RGBA
  borderSubtle: RGBA
  diffAdded: RGBA
  diffRemoved: RGBA
  diffContext: RGBA
  diffHunkHeader: RGBA
  diffHighlightAdded: RGBA
  diffHighlightRemoved: RGBA
  diffAddedBg: RGBA
  diffRemovedBg: RGBA
  diffContextBg: RGBA
  diffLineNumber: RGBA
  diffAddedLineNumberBg: RGBA
  diffRemovedLineNumberBg: RGBA
  markdownText: RGBA
  markdownHeading: RGBA
  markdownLink: RGBA
  markdownLinkText: RGBA
  markdownCode: RGBA
  markdownBlockQuote: RGBA
  markdownEmph: RGBA
  markdownStrong: RGBA
  markdownHorizontalRule: RGBA
  markdownListItem: RGBA
  markdownListEnumeration: RGBA
  markdownImage: RGBA
  markdownImageText: RGBA
  markdownCodeBlock: RGBA
  syntaxComment: RGBA
  syntaxKeyword: RGBA
  syntaxFunction: RGBA
  syntaxVariable: RGBA
  syntaxString: RGBA
  syntaxNumber: RGBA
  syntaxType: RGBA
  syntaxOperator: RGBA
  syntaxPunctuation: RGBA
}

type Theme = ThemeColors & {
  _hasSelectedListItemText: boolean
  subtleOpacity: number
}

export function selectedForeground(theme: Theme): RGBA {
  if (theme._hasSelectedListItemText) {
    return theme.selectedListItemText
  }
  if (theme.background.a === 0) {
    const { r, g, b } = theme.primary
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return luminance > 0.5 ? RGBA.fromInts(0, 0, 0) : RGBA.fromInts(255, 255, 255)
  }
  return theme.background
}

type HexColor = `#${string}`
type RefName = string
type Variant = {
  dark: HexColor | RefName
  light: HexColor | RefName
}
type ColorValue = HexColor | RefName | Variant | RGBA

type ThemeJson = {
  $schema?: string
  defs?: Record<string, HexColor | RefName>
  theme: Omit<Record<keyof ThemeColors, ColorValue>, "selectedListItemText" | "backgroundMenu"> & {
    selectedListItemText?: ColorValue
    backgroundMenu?: ColorValue
    subtleOpacity?: number
  }
}

export const DEFAULT_THEMES: Record<string, ThemeJson> = {
  aura,
  ayu,
  carbonfox,
  catppuccin,
  "catppuccin-frappe": catppuccinFrappe,
  "catppuccin-macchiato": catppuccinMacchiato,
  cobalt2,
  cursor,
  deltarune,
  dracula,
  everforest,
  flexoki,
  github,
  gruvbox,
  kanagawa,
  "lucent-orng": lucentOrng,
  material,
  matrix,
  mercury,
  monokai,
  nightowl,
  nord,
  "one-dark": oneDark,
  opencode,
  orng,
  "osaka-jade": osakaJade,
  palenight,
  rosepine,
  solarized,
  synthwave84,
  tokyonight,
  undertale,
  vercel,
  vesper,
  zenburn,
}

function resolveTheme(theme: ThemeJson, mode: "dark" | "light"): Theme {
  const defs = theme.defs ?? {}

  function resolveColor(c: ColorValue): RGBA {
    if (c instanceof RGBA) return c
    if (typeof c === "string") {
      if (c === "transparent" || c === "none") return RGBA.fromInts(0, 0, 0, 0)
      if (c.startsWith("#")) return RGBA.fromHex(c)
      if (defs[c] != null) {
        return resolveColor(defs[c])
      }
      const themeColor = theme.theme[c as keyof ThemeColors]
      if (themeColor !== undefined) {
        return resolveColor(themeColor)
      }
      throw new Error(`Color reference "${c}" not found in defs or theme`)
    }
    if (typeof c === "number") {
      return ansiToRgba(c)
    }
    return resolveColor(c[mode])
  }

  const resolved = Object.fromEntries(
    Object.entries(theme.theme)
      .filter(([key]) => key !== "selectedListItemText" && key !== "backgroundMenu" && key !== "subtleOpacity")
      .map(([key, value]) => {
        return [key, resolveColor(value as ColorValue)]
      })
  ) as Partial<ThemeColors>

  const hasSelectedListItemText = theme.theme.selectedListItemText !== undefined
  if (hasSelectedListItemText && theme.theme.selectedListItemText) {
    resolved.selectedListItemText = resolveColor(theme.theme.selectedListItemText)
  } else {
    resolved.selectedListItemText = resolved.background
  }

  if (theme.theme.backgroundMenu !== undefined) {
    resolved.backgroundMenu = resolveColor(theme.theme.backgroundMenu)
  } else {
    resolved.backgroundMenu = resolved.backgroundElement
  }

  const subtleOpacity = theme.theme.subtleOpacity ?? 0.6

  return {
    ...resolved,
    _hasSelectedListItemText: hasSelectedListItemText,
    subtleOpacity,
  } as Theme
}

function ansiToRgba(code: number): RGBA {
  if (code < 16) {
    const ansiColors = [
      "#000000", "#800000", "#008000", "#808000",
      "#000080", "#800080", "#008080", "#c0c0c0",
      "#808080", "#ff0000", "#00ff00", "#ffff00",
      "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
    ]
    return RGBA.fromHex(ansiColors[code] ?? "#000000")
  }
  if (code < 232) {
    const index = code - 16
    const b = index % 6
    const g = Math.floor(index / 6) % 6
    const r = Math.floor(index / 36)
    const val = (x: number) => (x === 0 ? 0 : x * 40 + 55)
    return RGBA.fromInts(val(r), val(g), val(b))
  }
  if (code < 256) {
    const gray = (code - 232) * 10 + 8
    return RGBA.fromInts(gray, gray, gray)
  }
  return RGBA.fromInts(0, 0, 0)
}

function generateSystem(colors: TerminalColors, mode: "dark" | "light"): ThemeJson {
  const bgColor = colors.defaultBackground ?? colors.palette[0] ?? "#000000"
  const fgColor = colors.defaultForeground ?? colors.palette[7] ?? "#ffffff"
  const bg = RGBA.fromHex(bgColor)
  const fg = RGBA.fromHex(fgColor)
  const palette = colors.palette.filter((x) => x !== null).map((x) => RGBA.fromHex(x))
  const isDark = mode === "dark"

  const grays = generateGrayScale(bg, isDark)
  const textMuted = generateMutedTextColor(bg, isDark)

  const ansiColors = {
    black: palette[0],
    red: palette[1],
    green: palette[2],
    yellow: palette[3],
    blue: palette[4],
    magenta: palette[5],
    cyan: palette[6],
    white: palette[7],
  }

  return {
    theme: {
      primary: ansiColors.cyan,
      secondary: ansiColors.magenta,
      accent: ansiColors.cyan,
      error: ansiColors.red,
      warning: ansiColors.yellow,
      success: ansiColors.green,
      info: ansiColors.cyan,
      text: fg,
      textMuted,
      selectedListItemText: bg,
      background: bg,
      backgroundPanel: grays[2],
      backgroundElement: grays[3],
      backgroundMenu: grays[3],
      borderSubtle: grays[6],
      border: grays[7],
      borderActive: grays[8],
      diffAdded: ansiColors.green,
      diffRemoved: ansiColors.red,
      diffContext: grays[7],
      diffHunkHeader: grays[7],
      diffHighlightAdded: ansiColors.green,
      diffHighlightRemoved: ansiColors.red,
      diffAddedBg: grays[2],
      diffRemovedBg: grays[2],
      diffContextBg: grays[1],
      diffLineNumber: grays[6],
      diffAddedLineNumberBg: grays[3],
      diffRemovedLineNumberBg: grays[3],
      markdownText: fg,
      markdownHeading: fg,
      markdownLink: ansiColors.blue,
      markdownLinkText: ansiColors.cyan,
      markdownCode: ansiColors.green,
      markdownBlockQuote: ansiColors.yellow,
      markdownEmph: ansiColors.yellow,
      markdownStrong: fg,
      markdownHorizontalRule: grays[7],
      markdownListItem: ansiColors.blue,
      markdownListEnumeration: ansiColors.cyan,
      markdownImage: ansiColors.blue,
      markdownImageText: ansiColors.cyan,
      markdownCodeBlock: fg,
      syntaxComment: textMuted,
      syntaxKeyword: ansiColors.magenta,
      syntaxFunction: ansiColors.blue,
      syntaxVariable: fg,
      syntaxString: ansiColors.green,
      syntaxNumber: ansiColors.yellow,
      syntaxType: ansiColors.cyan,
      syntaxOperator: ansiColors.cyan,
      syntaxPunctuation: fg,
    },
  }
}

function generateGrayScale(bg: RGBA, isDark: boolean): Record<number, RGBA> {
  const grays: Record<number, RGBA> = {}
  const bgR = bg.r * 255
  const bgG = bg.g * 255
  const bgB = bg.b * 255
  const luminance = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB

  for (let i = 1; i <= 12; i++) {
    const factor = i / 12.0
    let newR: number
    let newG: number
    let newB: number

    if (isDark) {
      if (luminance < 10) {
        const grayValue = Math.floor(factor * 0.4 * 255)
        newR = grayValue
        newG = grayValue
        newB = grayValue
      } else {
        const newLum = luminance + (255 - luminance) * factor * 0.4
        const ratio = newLum / luminance
        newR = Math.min(bgR * ratio, 255)
        newG = Math.min(bgG * ratio, 255)
        newB = Math.min(bgB * ratio, 255)
      }
    } else {
      if (luminance > 245) {
        const grayValue = Math.floor(255 - factor * 0.4 * 255)
        newR = grayValue
        newG = grayValue
        newB = grayValue
      } else {
        const newLum = luminance * (1 - factor * 0.4)
        const ratio = newLum / luminance
        newR = Math.max(bgR * ratio, 0)
        newG = Math.max(bgG * ratio, 0)
        newB = Math.max(bgB * ratio, 0)
      }
    }

    grays[i] = RGBA.fromInts(Math.floor(newR), Math.floor(newG), Math.floor(newB))
  }

  return grays
}

function generateMutedTextColor(bg: RGBA, isDark: boolean): RGBA {
  const bgR = bg.r * 255
  const bgG = bg.g * 255
  const bgB = bg.b * 255
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB

  let grayValue: number

  if (isDark) {
    if (bgLum < 10) {
      grayValue = 180
    } else {
      grayValue = Math.min(Math.floor(160 + bgLum * 0.3), 200)
    }
  } else {
    if (bgLum > 245) {
      grayValue = 75
    } else {
      grayValue = Math.max(Math.floor(100 - (255 - bgLum) * 0.2), 60)
    }
  }

  return RGBA.fromInts(grayValue, grayValue, grayValue)
}

const CUSTOM_THEME_GLOB = new Bun.Glob("themes/*.json")

async function getCustomThemes(): Promise<Record<string, ThemeJson>> {
  const result: Record<string, ThemeJson> = {}
  
  const themesDir = Global.Path.config
  
  for await (const item of CUSTOM_THEME_GLOB.scan({
    absolute: true,
    followSymlinks: true,
    dot: true,
    cwd: themesDir,
  })) {
    const name = path.basename(item, ".json")
    result[name] = await Bun.file(item).json()
  }
  
  return result
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: (props: { mode: "dark" | "light" }) => {
    const config = useConfig()

    const renderer = useRenderer()
    
    const autoDetectedMode = props.mode
    
    const [store, setStore] = createStore({
      themes: DEFAULT_THEMES,
      modePreference: (config.data.theme_mode ?? "system") as ThemeMode,
      active: config.data.theme,
      ready: false,
    })

    createEffect(() => {
      getCustomThemes()
        .then((custom) => {
          setStore(
            produce((draft) => {
              Object.assign(draft.themes, custom)
            })
          )
        })
        .catch(() => {})
        .finally(() => {
          if (store.active !== "system") {
            setStore("ready", true)
          }
        })
    })

    const effectiveMode = createMemo(() => {
      return store.modePreference === "system" ? autoDetectedMode : store.modePreference
    })

    renderer
      .getPalette({ size: 16 })
      .then((colors) => {
        if (!colors.palette[0]) {
          if (store.active === "system") {
            setStore(
              produce((draft) => {
                draft.active = "opencode"
                draft.ready = true
              })
            )
          }
          return
        }
        setStore(
          produce((draft) => {
            draft.themes.system = generateSystem(colors, effectiveMode())
            if (store.active === "system") {
              draft.ready = true
            }
          })
        )
      })

    const values = createMemo(() => {
      return resolveTheme(store.themes[store.active] ?? store.themes.opencode, effectiveMode())
    })

    return {
      theme: new Proxy(values(), {
        get(_target, prop) {
          return values()[prop as keyof Theme]
        },
      }),
      get selected() {
        return store.active
      },
      all() {
        return store.themes
      },
      mode() {
        return effectiveMode()
      },
      modePreference() {
        return store.modePreference
      },
      setMode(mode: ThemeMode) {
        setStore("modePreference", mode)
        Config.setThemeMode(mode)
      },
      set(theme: string) {
        setStore("active", theme)
        Config.setTheme(theme)
      },
      preview(theme: string) {
        setStore("active", theme)
      },
      get ready() {
        return store.ready
      },
      get autoDetectedMode() {
        return autoDetectedMode
      },
    }
  },
})
