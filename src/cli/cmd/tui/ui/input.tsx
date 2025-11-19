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
      backgroundColor={props.backgroundColor ?? theme.inputBg}
      focusedBackgroundColor={props.focusedBackgroundColor ?? theme.inputBg}
      textColor={props.textColor ?? theme.text}
      focusedTextColor={props.focusedTextColor ?? theme.inputFocusText}
      cursorColor={props.cursorColor ?? theme.inputCursor}
      ref={props.ref}
    />
  )
}
