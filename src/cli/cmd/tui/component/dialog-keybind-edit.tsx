import { createSignal, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useConfig, type KeybindsConfig } from "../context/config"
import { Config } from "@/config/config"

interface DialogKeybindEditProps {
  keybindKey: keyof KeybindsConfig
  label: string
  onSave: () => void
  onBack: () => void
}

export function DialogKeybindEdit(props: DialogKeybindEditProps) {
  const { theme } = useTheme()
  const config = useConfig()

  const currentBindings = () => config.data.keybinds[props.keybindKey]
  const defaultBindings = Config.getDefaultKeybind(props.keybindKey)

  const [capturedKeys, setCapturedKeys] = createSignal<string[]>([...currentBindings()])
  const [isCapturing, setIsCapturing] = createSignal(false)
  const [isCapturingLeader, setIsCapturingLeader] = createSignal(false)
  const [message, setMessage] = createSignal("")

  function formatKeyName(name: string): string {
    if (name === " ") return "space"
    return name.toLowerCase()
  }

  function formatKey(evt: { name: string; ctrl: boolean; shift: boolean; meta: boolean }): string {
    const parts: string[] = []
    if (evt.ctrl) parts.push("ctrl")
    if (evt.shift) parts.push("shift")
    if (evt.meta) parts.push("meta")
    if (evt.name && evt.name !== "escape") {
      parts.push(formatKeyName(evt.name))
    }
    return parts.join("+")
  }

  function formatBindingForDisplay(binding: string): string {
    return binding
  }

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      if (isCapturing() || isCapturingLeader()) {
        setIsCapturing(false)
        setIsCapturingLeader(false)
        setMessage("")
        evt.preventDefault()
        return
      }
      props.onBack()
      evt.preventDefault()
      return
    }

    if (isCapturingLeader()) {
      evt.preventDefault()
      const keyName = formatKeyName(evt.name)
      if (keyName && keyName !== "escape") {
        const formatted = `<leader>+${keyName}`
        const current = capturedKeys()
        if (!current.includes(formatted)) {
          setCapturedKeys([...current, formatted])
        }
        setIsCapturingLeader(false)
        setMessage(`Added: ${formatted}`)
      }
      return
    }

    if (isCapturing()) {
      evt.preventDefault()
      const formatted = formatKey(evt)
      if (formatted) {
        const current = capturedKeys()
        if (!current.includes(formatted)) {
          setCapturedKeys([...current, formatted])
        }
        setIsCapturing(false)
        setMessage(`Added: ${formatted}`)
      }
      return
    }

    if (evt.name === "a" || evt.name === "return") {
      setIsCapturing(true)
      setMessage("Press any key combination...")
      evt.preventDefault()
      return
    }

    if (evt.name === "l") {
      setIsCapturingLeader(true)
      setMessage("Press key for <leader>+key binding...")
      evt.preventDefault()
      return
    }

    if (evt.name === "d" && capturedKeys().length > 0) {
      const current = capturedKeys()
      setCapturedKeys(current.slice(0, -1))
      setMessage("Removed last keybind")
      evt.preventDefault()
      return
    }

    if (evt.name === "r") {
      setCapturedKeys([...defaultBindings])
      setMessage("Reset to defaults")
      evt.preventDefault()
      return
    }

    if (evt.name === "s" || (evt.ctrl && evt.name === "s")) {
      saveAndBack()
      evt.preventDefault()
      return
    }

    if (evt.name === "c") {
      setCapturedKeys([])
      setMessage("Cleared all keybinds")
      evt.preventDefault()
      return
    }
  })

  async function saveAndBack() {
    const bindings = capturedKeys()
    await Config.setKeybind(props.keybindKey, bindings)
    config.set("keybinds", {
      ...config.data.keybinds,
      [props.keybindKey]: bindings,
    })
    props.onSave()
    props.onBack()
  }

  return (
    <box paddingLeft={3} paddingRight={3} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Edit: {props.label}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box paddingTop={1}>
        <text fg={theme.textMuted}>Current bindings:</text>
        <box paddingLeft={2} paddingTop={0.5}>
          <Show
            when={capturedKeys().length > 0}
            fallback={<text fg={theme.textMuted}>(none - unbound)</text>}
          >
            <text fg={theme.text}>
              {capturedKeys().map(formatBindingForDisplay).join(", ")}
            </text>
          </Show>
        </box>
      </box>

      <box>
        <text fg={theme.textMuted}>Default: {defaultBindings.join(", ")}</text>
      </box>

      <Show when={message()}>
        <box>
          <text fg={theme.accent}>{message()}</text>
        </box>
      </Show>

      <box paddingTop={1} gap={0.5}>
        <text fg={theme.textMuted}>Actions:</text>
        <text fg={theme.text}>
          <span style={{ fg: theme.accent }}>a</span>
          <span style={{ fg: theme.textMuted }}>/</span>
          <span style={{ fg: theme.accent }}>enter</span> add keybind
          {"  "}
          <span style={{ fg: theme.accent }}>l</span> add leader+key
          {"  "}
          <span style={{ fg: theme.accent }}>d</span> remove last
        </text>
        <text fg={theme.text}>
          <span style={{ fg: theme.accent }}>c</span> clear all
          {"  "}
          <span style={{ fg: theme.accent }}>r</span> reset to default
          {"  "}
          <span style={{ fg: theme.accent }}>s</span> save
          {"  "}
          <span style={{ fg: theme.accent }}>esc</span> back
        </text>
      </box>
    </box>
  )
}
