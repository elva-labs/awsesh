import { RGBA, type TerminalColors } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { bundledThemes, loadThemes, mapThemeColors, resolveTheme, type ThemeColors } from "@awsesh/themes"
import { createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { Config, type ThemeMode } from "@/config/config"
import { Global } from "@/global"
import { Log } from "@/util/log"
import { createSimpleContext } from "./helper"
import { useConfig } from "./config"

type Theme = ThemeColors<RGBA> & {
  _hasSelectedListItemText: boolean
  subtleOpacity: number
}

const log = Log.create({ service: "theme-context" })

export function selectedForeground(theme: Theme): RGBA {
  if (theme._hasSelectedListItemText) return theme.selectedListItemText
  if (theme.background.a === 0) {
    const luminance = 0.299 * theme.primary.r + 0.587 * theme.primary.g + 0.114 * theme.primary.b
    return luminance > 0.5 ? RGBA.fromInts(0, 0, 0) : RGBA.fromInts(255, 255, 255)
  }
  return theme.background
}

function generateSystem(colors: TerminalColors, mode: "dark" | "light"): Theme {
  const bg = RGBA.fromHex(colors.defaultBackground ?? colors.palette[0] ?? "#000000")
  const fg = RGBA.fromHex(colors.defaultForeground ?? colors.palette[7] ?? "#ffffff")
  const palette = colors.palette.map((value) => RGBA.fromHex(value ?? "#000000"))
  const isDark = mode === "dark"
  const grays = generateGrayScale(bg, isDark)
  const textMuted = generateMutedTextColor(bg, isDark)

  const ansiColors = {
    red: palette[1],
    green: palette[2],
    yellow: palette[3],
    blue: palette[4],
    magenta: palette[5],
    cyan: palette[6],
  }

  return {
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
    _hasSelectedListItemText: true,
    subtleOpacity: 0.6,
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
        const ratio = luminance === 0 ? 0 : newLum / luminance
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
  const bgLum = 0.299 * bg.r * 255 + 0.587 * bg.g * 255 + 0.114 * bg.b * 255
  let grayValue: number
  if (isDark) {
    grayValue = bgLum < 10 ? 180 : Math.min(Math.floor(160 + bgLum * 0.3), 200)
  } else {
    grayValue = bgLum > 245 ? 75 : Math.max(Math.floor(100 - (255 - bgLum) * 0.2), 60)
  }
  return RGBA.fromInts(grayValue, grayValue, grayValue)
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: (props: { mode: "dark" | "light" }) => {
    const config = useConfig()
    const renderer = useRenderer()
    const autoDetectedMode = props.mode
    const [store, setStore] = createStore<{
      themes: Record<string, unknown>
      terminal: TerminalColors | undefined
      modePreference: ThemeMode
      active: string
      ready: boolean
    }>({
      themes: { ...bundledThemes },
      terminal: undefined,
      modePreference: config.data.theme_mode === "dark" || config.data.theme_mode === "light" ? config.data.theme_mode : "system",
      active: config.data.theme,
      ready: false,
    })

    createEffect(() => {
      loadThemes(Global.Path.config)
        .then((catalog) => {
          setStore("themes", catalog.themes)
          for (const warning of catalog.warnings) log.warn("Skipped custom theme", { warning })
        })
        .catch((error) => log.warn("Failed to load custom themes", { error }))
        .finally(() => {
          if (store.active !== "system") setStore("ready", true)
        })
    })

    const effectiveMode = createMemo(() => store.modePreference === "system" ? autoDetectedMode : store.modePreference)

    renderer.getPalette({ size: 16 })
      .then((colors) => {
        if (colors.palette[0]) setStore("terminal", colors)
        if (!colors.palette[0] && store.active === "system") setStore("active", "opencode")
      })
      .catch((error) => {
        log.warn("Failed to read terminal palette", { error })
        if (store.active === "system") setStore("active", "opencode")
      })
      .finally(() => setStore("ready", true))

    const values = createMemo((): Theme => {
      if (store.active === "system" && store.terminal) return generateSystem(store.terminal, effectiveMode())
      const definition = Object.hasOwn(store.themes, store.active) ? store.themes[store.active] : bundledThemes.opencode
      const resolved = resolveTheme(definition, effectiveMode())
      return {
        ...mapThemeColors(resolved, RGBA.fromHex),
        _hasSelectedListItemText: resolved.hasSelectedListItemText,
        subtleOpacity: resolved.subtleOpacity,
      }
    })

    return {
      theme: new Proxy(values(), { get: (_target, prop) => Reflect.get(values(), prop) }),
      get selected() {
        return store.active
      },
      all() {
        return store.terminal ? { ...store.themes, system: store.terminal } : store.themes
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
