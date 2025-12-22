import { Show, type JSX } from "solid-js"
import { useTheme } from "../context/theme"
import { Input } from "./input"

export interface FormFieldProps {
  label: string
  value?: string
  placeholder?: string
  error?: string
  onInput?: (value: string) => void
  ref?: (el: any) => void
}

export function FormField(props: FormFieldProps) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={0.5}>
      <text fg={theme.text}>{props.label}:</text>
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
