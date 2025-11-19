import { RGBA } from "@opentui/core"
import { createSignal, createMemo } from "solid-js"
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"
import { createStore } from "solid-js/store"
import opencode from "./theme/opencode.json"
import dracula from "./theme/dracula.json"
import nord from "./theme/nord.json"

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
  theme: Record<keyof Theme, HexColor>
}

const DEFAULT_THEMES: Record<string, ThemeJson> = {
  opencode,
  dracula,
  nord,
}

function resolveTheme(themeJson: ThemeJson): Theme {
  return Object.fromEntries(
    Object.entries(themeJson.theme).map(([key, value]) => [key, RGBA.fromHex(value)])
  ) as Theme
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: () => {
    const kv = useKV()
    const [store, setStore] = createStore({
      themes: DEFAULT_THEMES,
      active: kv.get("theme", "opencode") as string,
    })

    const values = createMemo(() => {
      return resolveTheme(store.themes[store.active] ?? store.themes.opencode)
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
      set(theme: string) {
        setStore("active", theme)
        kv.set("theme", theme)
      },
    }
  },
})
