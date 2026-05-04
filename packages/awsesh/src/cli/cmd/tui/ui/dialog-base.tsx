import { TextAttributes, type RGBA } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createSignal, For, Show, type JSX, type ParentProps } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"

export interface DialogBaseProps {
  title: string
  titleColor?: RGBA
  onClose?: () => void
}

export function DialogBase(props: ParentProps<DialogBaseProps>) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const renderer = useRenderer()
  const [escHover, setEscHover] = createSignal(false)

  const handleClose = () => {
    props.onClose?.()
    dialog.clear()
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={props.titleColor ?? theme.text}>
          {props.title}
        </text>
        <box
          onMouseOver={() => setEscHover(true)}
          onMouseOut={() => setEscHover(false)}
          onMouseUp={() => {
            if (renderer.getSelection()?.getSelectedText()) return
            handleClose()
          }}
          backgroundColor={escHover() ? theme.accent : undefined}
        >
          <text fg={escHover() ? theme.background : theme.textMuted}>esc</text>
        </box>
      </box>
      {props.children}
    </box>
  )
}

export interface DialogButtonProps {
  label: string
  onClick?: () => void
  variant?: "default" | "primary" | "danger"
  keybind?: string
}

export function DialogButton(props: DialogButtonProps) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)

  const bgColor = () => {
    if (hover()) return theme.accent
    if (props.variant === "primary") return theme.primary
    if (props.variant === "danger") return theme.error
    return undefined
  }

  const keybindColor = () => {
    if (hover()) return theme.background
    if (props.variant === "primary" || props.variant === "danger") return theme.background
    return theme.text
  }

  const labelColor = () => {
    if (hover()) return theme.background
    if (props.variant === "primary" || props.variant === "danger") return theme.background
    return theme.textMuted
  }

  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={bgColor()}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseUp={() => {
        if (renderer.getSelection()?.getSelectedText()) return
        props.onClick?.()
      }}
    >
      <text>
        <Show when={props.keybind}>
          <span style={{ fg: keybindColor(), attributes: TextAttributes.BOLD }}>{props.keybind}</span>
          <span style={{ fg: labelColor() }}> </span>
        </Show>
        <span style={{ fg: labelColor() }}>{props.label}</span>
      </text>
    </box>
  )
}

export interface DialogFooterProps {
  children: JSX.Element
  align?: "left" | "right" | "space-between"
  direction?: "row" | "column"
}

export function DialogFooter(props: DialogFooterProps) {
  const justify = () => {
    if (props.align === "left") return "flex-start"
    if (props.align === "right") return "flex-end"
    return "space-between"
  }

  const direction = () => props.direction ?? "row"

  return (
    <box
      flexDirection={direction()}
      justifyContent={direction() === "row" ? justify() : undefined}
      alignItems={direction() === "column" ? (props.align === "right" ? "flex-end" : props.align === "left" ? "flex-start" : undefined) : undefined}
      gap={direction() === "column" ? 0 : 1}
      paddingBottom={1}
    >
      {props.children}
    </box>
  )
}

export interface DialogActionsProps {
  actions: DialogButtonProps[]
}

export function DialogActions(props: DialogActionsProps) {
  return (
    <DialogFooter align="right">
      <box flexDirection="row" gap={1}>
        <For each={props.actions}>
          {(action) => <DialogButton {...action} />}
        </For>
      </box>
    </DialogFooter>
  )
}
