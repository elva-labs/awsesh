import { useTerminalDimensions, useKeyboard } from "@opentui/solid"
import { For, createSignal } from "solid-js"
import { useRoute } from "../context/route"
import { useTheme } from "../context/theme"
import { useKeybind } from "../context/keybind"
import { TextAttributes } from "@opentui/core"
import { useToast } from "../ui/toast"

export function SettingsScreen() {
  const dimensions = useTerminalDimensions()
  const route = useRoute()
  const { theme, all, set, selected: activeTheme } = useTheme()
  const keybind = useKeybind()
  const toast = useToast()

  const themes = () => all()
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  useKeyboard((evt) => {
    if (keybind.match("nav_up", evt)) {
      evt.preventDefault()
      setSelectedIndex((prev) => Math.max(0, prev - 1))
    }

    if (keybind.match("nav_down", evt)) {
      evt.preventDefault()
      setSelectedIndex((prev) => Math.min(themes().length - 1, prev + 1))
    }

    if (keybind.match("select", evt)) {
      evt.preventDefault()
      const themeName = themes()[selectedIndex()]
      set(themeName)
      toast.show({ message: `Theme changed to ${themeName}`, variant: "success" })
    }

    if (keybind.match("back", evt)) {
      evt.preventDefault()
      route.navigate({ type: "sso-select" })
    }
  })

  const width = dimensions().width
  const height = dimensions().height

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box paddingLeft={1} paddingTop={1} paddingBottom={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>Settings</text>
      </box>

      <box paddingLeft={2} paddingTop={1}>
        <text fg={theme.textMuted}>Theme</text>
      </box>

      <box flexDirection="column" paddingLeft={2} paddingTop={1} flexGrow={1}>
        <For each={themes()}>
          {(themeName, index) => {
            const isSelected = index() === selectedIndex()
            const bg = isSelected ? theme.accent : theme.background
            const fg = isSelected ? theme.background : theme.text

            const prefix = isSelected ? "● " : "  "
            const suffix = themeName === activeTheme ? " (active)" : ""
            const label = prefix + themeName + suffix

            return (
              <box paddingTop={index() === 0 ? 0 : 1}>
                <text fg={fg} bg={bg}>{label}</text>
              </box>
            )
          }}
        </For>
      </box>

      <box paddingLeft={1} paddingBottom={1} flexDirection="row" gap={2}>
        <text fg={theme.textMuted}>
          <text fg={theme.text}>enter</text> Select
        </text>
        <text fg={theme.textMuted}>
          <text fg={theme.text}>esc</text> Back
        </text>
      </box>
    </box>
  )
}
