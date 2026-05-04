import { useTheme } from "../context/theme"
import type { RGBA, InputRenderable } from "@opentui/core"

export interface InputProps {
  value?: string
  placeholder?: string
  onInput?: (value: string) => void
  onEnter?: (value: string) => void
  backgroundColor?: RGBA
  focusedBackgroundColor?: RGBA
  textColor?: RGBA
  focusedTextColor?: RGBA
  cursorColor?: RGBA
  ref?: (el: InputRenderable) => void
  focused?: boolean
}

export function Input(props: InputProps) {
  const { theme } = useTheme()

  return (
    <input
      focused={props.focused ?? true}
      value={props.value}
      placeholder={props.placeholder}
      onInput={(e) => props.onInput?.(e)}
      backgroundColor={props.backgroundColor ?? theme.background}
      focusedBackgroundColor={props.focusedBackgroundColor ?? theme.background}
      textColor={props.textColor ?? theme.text}
      focusedTextColor={props.focusedTextColor ?? theme.text}
      cursorColor={props.cursorColor ?? theme.primary}
      ref={(r) => {
        props.ref?.(r)
      }}
    />
  )
}
