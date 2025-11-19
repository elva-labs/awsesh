import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { InputRenderable } from "@opentui/core"

interface InputProps {
  label: string
  placeholder?: string
  defaultValue?: string
  onSubmit: (value: string) => void
  onCancel?: () => void
}

export function Input(props: InputProps) {
  const [value, setValue] = createSignal(props.defaultValue || "")
  let inputRef: InputRenderable | undefined

  useKeyboard((key) => {
    if (key.name === "escape") {
      props.onCancel?.()
    }
  })

  return (
    <box width="100%" flexDirection="column" padding={1}>
      <text fg="cyan"><b>{props.label}</b></text>
      
      <box width="100%" marginTop={1}>
        <input
          ref={(r) => (inputRef = r)}
          value={value()}
          placeholder={props.placeholder}
          onInput={(v) => setValue(v)}
          onSubmit={(v) => props.onSubmit(v)}
          focused={true}
        />
      </box>

      <box width="100%" marginTop={1} padding={1} style={{ borderStyle: "single", borderColor: "gray" }}>
        <text fg="gray">Enter Submit • Esc Cancel</text>
      </box>
    </box>
  )
}
