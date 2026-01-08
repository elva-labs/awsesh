import { createSignal, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useConfig, type KeybindsConfig } from "../context/config"
import { Config } from "@/config/config"
import { DialogBase, DialogButton, DialogFooter } from "../ui/dialog-base"

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

  function handleAddKeybind() {
    setIsCapturing(true)
    setMessage("Press any key combination...")
  }

  function handleAddLeader() {
    setIsCapturingLeader(true)
    setMessage("Press key for <leader>+key binding...")
  }

  function handleRemoveLast() {
    if (capturedKeys().length > 0) {
      const current = capturedKeys()
      setCapturedKeys(current.slice(0, -1))
      setMessage("Removed last keybind")
    }
  }

  function handleClear() {
    setCapturedKeys([])
    setMessage("Cleared all keybinds")
  }

  function handleReset() {
    setCapturedKeys([...defaultBindings])
    setMessage("Reset to defaults")
  }

  async function handleSave() {
    const bindings = capturedKeys()
    await Config.setKeybind(props.keybindKey, bindings)
    config.set("keybinds", {
      ...config.data.keybinds,
      [props.keybindKey]: bindings,
    })
    props.onSave()
    props.onBack()
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
      handleAddKeybind()
      evt.preventDefault()
      return
    }

    if (evt.name === "l") {
      handleAddLeader()
      evt.preventDefault()
      return
    }

    if (evt.name === "d") {
      handleRemoveLast()
      evt.preventDefault()
      return
    }

    if (evt.name === "r") {
      handleReset()
      evt.preventDefault()
      return
    }

    if (evt.name === "s" || (evt.ctrl && evt.name === "s")) {
      handleSave()
      evt.preventDefault()
      return
    }

    if (evt.name === "c") {
      handleClear()
      evt.preventDefault()
      return
    }
  })

  return (
    <DialogBase title={`Edit: ${props.label}`} onClose={props.onBack}>
      <box flexDirection="column" gap={1} paddingBottom={1}>
        <box flexDirection="column">
          <text fg={theme.accent} attributes={TextAttributes.BOLD}>
            Current Bindings
          </text>
          <Show
            when={capturedKeys().length > 0}
            fallback={<text fg={theme.textMuted}>(none - unbound)</text>}
          >
            <text fg={theme.text}>
              {capturedKeys().map(formatBindingForDisplay).join(", ")}
            </text>
          </Show>
        </box>

        <box flexDirection="column">
          <text fg={theme.accent} attributes={TextAttributes.BOLD}>
            Default
          </text>
          <text fg={theme.textMuted}>{defaultBindings.join(", ")}</text>
        </box>

        <Show when={message()}>
          <text fg={theme.primary}>{message()}</text>
        </Show>
      </box>

      <DialogFooter direction="column" align="left">
        <box flexDirection="row" gap={1}>
          <DialogButton label="Add" keybind="a" onClick={handleAddKeybind} />
          <DialogButton label="Leader+" keybind="l" onClick={handleAddLeader} />
          <DialogButton label="Remove" keybind="d" onClick={handleRemoveLast} />
        </box>
        <box flexDirection="row" justifyContent="space-between" width="100%">
          <box flexDirection="row" gap={1}>
            <DialogButton label="Clear" keybind="c" onClick={handleClear} />
            <DialogButton label="Reset" keybind="r" onClick={handleReset} />
          </box>
          <DialogButton label="Save" keybind="s" variant="primary" onClick={handleSave} />
        </box>
      </DialogFooter>
    </DialogBase>
  )
}
