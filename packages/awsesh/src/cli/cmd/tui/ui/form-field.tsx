import { Show } from "solid-js"
import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { Input } from "./input"

export interface FormFieldProps {
  label: string
  value?: string
  placeholder?: string
  error?: string
  onInput?: (value: string) => void
  ref?: (el: InputRenderable) => void
}

export function FormField(props: FormFieldProps) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column">
      <text fg={theme.accent} attributes={TextAttributes.BOLD}>
        {props.label}
      </text>
      <Input
        value={props.value}
        placeholder={props.placeholder}
        onInput={props.onInput}
        ref={props.ref}
      />
      <Show when={props.error}>
        <text fg={theme.error}>{props.error}</text>
      </Show>
    </box>
  )
}
