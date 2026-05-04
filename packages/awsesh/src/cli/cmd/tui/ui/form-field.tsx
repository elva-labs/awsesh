import { Show, type JSX } from "solid-js"
import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { Input } from "./input"

export interface FormFieldProps {
  label: string
  value?: string
  placeholder?: string
  error?: string
  hint?: JSX.Element
  onInput?: (value: string) => void
  ref?: (el: InputRenderable) => void
}

export function FormField(props: FormFieldProps) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  let inputRef: InputRenderable | undefined

  const handleClick = () => {
    if (renderer.getSelection()?.getSelectedText()) return
    if (inputRef) {
      inputRef.focus()
      inputRef.cursorOffset = inputRef.value.length
    }
  }

  return (
    <box
      flexDirection="column"
      height={props.hint !== undefined ? 3 : 2}
      onMouseUp={handleClick}
    >
      <box flexDirection="row" gap={1}>
        <text fg={theme.accent} attributes={TextAttributes.BOLD}>
          {props.label}
        </text>
        <Show when={props.error}>
          <text fg={theme.error}>{props.error}</text>
        </Show>
      </box>
      <Input
        value={props.value}
        placeholder={props.placeholder}
        onInput={props.onInput}
        ref={(r) => {
          inputRef = r
          props.ref?.(r)
        }}
      />
      <Show when={props.hint !== undefined}>
        <text fg={theme.textMuted}>{props.hint}</text>
      </Show>
    </box>
  )
}
