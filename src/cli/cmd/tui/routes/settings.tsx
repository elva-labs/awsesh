import { useKeyboard } from "@opentui/solid"
import { For, createSignal, createMemo } from "solid-js"
import { useRoute } from "../context/route"
import { useTheme } from "../context/theme"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useToast } from "../ui/toast"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"

export function SettingsScreen() {
  const route = useRoute()
  const { theme, all, set, selected: activeTheme } = useTheme()
  const keybind = useKeybind()
  const command = useCommand()
  const toast = useToast()

  const themes = createMemo(() => all())
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  command.register(() => [
    {
      id: "nav.back",
      title: "Back to Profiles",
      description: "Return to profile selection",
      category: "Navigation",
      keybind: "back",
      onSelect: () => {
        route.navigate({ type: "sso-select" })
      },
    },
  ])

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
  })

  return (
    <Layout
      header={<Header title="Settings" subtitle="Customize your experience" />}
      footer={
        <Footer right={<KeybindHint keybind={keybind.print("command_list")} label="Commands" />}>
          <KeybindHint keybind={keybind.print("select")} label="Select" />
          <KeybindHint keybind={keybind.print("back")} label="Back" />
        </Footer>
      }
    >
      <box paddingLeft={2} paddingTop={1}>
        <text fg={theme.textMuted}>Theme</text>
      </box>

      <box flexDirection="column" paddingLeft={2} paddingTop={1} flexGrow={1}>
        <For each={themes()}>
          {(themeName, index) => {
            const isSelected = index() === selectedIndex()
            const bg = isSelected ? theme.accent : theme.background
            const fg = isSelected ? theme.background : theme.text

            const prefix = isSelected ? "> " : "  "
            const suffix = themeName === activeTheme ? " (active)" : ""
            const label = `${prefix}${themeName}${suffix}`

            return (
              <box paddingTop={index() === 0 ? 0 : 0} backgroundColor={bg}>
                <text fg={fg}>
                  {label}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </Layout>
  )
}
