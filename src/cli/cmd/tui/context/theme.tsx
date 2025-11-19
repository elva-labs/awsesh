import { RGBA } from "@opentui/core"
import { createSignal, createMemo } from "solid-js"
import { createSimpleContext } from "./helper"

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

const defaultTheme: ThemeJson = {
  theme: {
    primary: "#fab283",
    secondary: "#5c9cf5",
    accent: "#9d7cd8",
    error: "#e06c75",
    warning: "#f5a742",
    success: "#7fd88f",
    info: "#56b6c2",
    text: "#eeeeee",
    textMuted: "#808080",
    background: "#0a0a0a",
    border: "#484848",
    inputBg: "#1a1a1a",
    inputCursor: "#00ff00",
    inputFocusText: "#ffff00",
  }
}

function resolveTheme(themeJson: ThemeJson): Theme {
  return Object.fromEntries(
    Object.entries(themeJson.theme).map(([key, value]) => [key, RGBA.fromHex(value)])
  ) as Theme
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: () => {
    const [themeName] = createSignal("default")
    
    const values = createMemo(() => resolveTheme(defaultTheme))

    return {
      theme: new Proxy(values(), {
        get(_target, prop) {
          return values()[prop as keyof Theme]
        },
      }),
      get selected() {
        return themeName()
      },
    }
  },
})
