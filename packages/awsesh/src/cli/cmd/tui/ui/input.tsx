import { useTheme } from "../context/theme"
import type { RGBA } from "@opentui/core"

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
  ref?: (el: any) => void
}

export function Input(props: InputProps) {
  const { theme } = useTheme()

  return (
    <input
      value={props.value}
      placeholder={props.placeholder}
      onInput={(e) => props.onInput?.(e)}
      backgroundColor={props.backgroundColor ?? theme.background}
      focusedBackgroundColor={props.focusedBackgroundColor ?? theme.background}
      textColor={props.textColor ?? theme.text}
      focusedTextColor={props.focusedTextColor ?? theme.text}
      cursorColor={props.cursorColor ?? theme.primary}
      ref={props.ref}
    />
  )
}
