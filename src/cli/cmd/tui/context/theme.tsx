import { RGBA, type TerminalColors } from "@opentui/core"
import { createMemo } from "solid-js"
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"
import { createStore, produce } from "solid-js/store"
import { useRenderer } from "@opentui/solid"
import opencode from "./theme/opencode.json"
import dracula from "./theme/dracula.json"
import nord from "./theme/nord.json"
import tokyonight from "./theme/tokyo-night.json"

type Theme = {
  primary: RGBA
  secondary: RGBA
  accent: RGBA
  error: RGBA
  warning: RGBA
  success: RGBA
  info: RGBA
  text: RGBA
  textMuted: RGBA
  background: RGBA
  border: RGBA
  inputBg: RGBA
  inputCursor: RGBA
  inputFocusText: RGBA
}

type HexColor = `#${string}`
type ThemeJson = {
  $schema?: string
  theme: Record<keyof Theme, HexColor | RGBA>
}

const DEFAULT_THEMES: Record<string, ThemeJson> = {
  opencode: opencode as any,
  dracula: dracula as any,
  nord: nord as any,
  ["tokyo-night"]: tokyonight as any,
}

function resolveTheme(themeJson: ThemeJson): Theme {
  return Object.fromEntries(
    Object.entries(themeJson.theme).map(([key, value]) => {
      if (value instanceof RGBA) return [key, value]
      return [key, RGBA.fromHex(value)]
    })
  ) as Theme
}

function generateSystem(colors: TerminalColors): ThemeJson {
  const bg = RGBA.fromHex(colors.defaultBackground ?? colors.palette[0]!)
  const fg = RGBA.fromHex(colors.defaultForeground ?? colors.palette[7]!)
  const palette = colors.palette.filter((x) => x !== null).map((x) => RGBA.fromHex(x))

  const grays = generateGrayScale(bg)
  const textMuted = generateMutedTextColor(bg)

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
      background: bg,
      border: grays[7],
      inputBg: grays[2],
      inputCursor: ansiColors.cyan,
      inputFocusText: fg,
    },
  }
}

function generateGrayScale(bg: RGBA): Record<number, RGBA> {
  const grays: Record<number, RGBA> = {}
  const bgR = bg.r * 255
  const bgG = bg.g * 255
  const bgB = bg.b * 255
  const luminance = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB
  const isDark = luminance < 128

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

function generateMutedTextColor(bg: RGBA): RGBA {
  const bgR = bg.r * 255
  const bgG = bg.g * 255
  const bgB = bg.b * 255
  const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB
  const isDark = bgLum < 128

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

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: () => {
    const kv = useKV()
    const renderer = useRenderer()
    const [store, setStore] = createStore({
      themes: DEFAULT_THEMES,
      active: kv.get("theme", "system") as string,
      ready: false,
    })

    renderer.getPalette({ size: 16 }).then((colors) => {
      if (!colors.palette[0]) return
      setStore(produce((draft) => {
        draft.themes.system = generateSystem(colors)
        draft.ready = true
      }))
    })

    const values = createMemo(() => {
      return resolveTheme(store.themes[store.active] ?? store.themes.system ?? store.themes.opencode)
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
        return Object.keys(store.themes)
      },
      set(theme: string) {
        setStore("active", theme)
        kv.set("theme", theme)
      },
      get ready() {
        return store.ready
      },
    }
  },
})
