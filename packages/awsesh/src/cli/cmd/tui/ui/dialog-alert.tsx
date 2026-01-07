import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { useKeyboard, useRenderer } from "@opentui/solid"

export type DialogAlertProps = {
  title: string
  message: string
  onClose?: () => void
}

export function DialogAlert(props: DialogAlertProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const renderer = useRenderer()

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "escape") {
      props.onClose?.()
      dialog.clear()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD}>{props.title}</text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.text}>{props.message}</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={theme.primary}
          onMouseUp={() => {
            if (renderer.getSelection()?.getSelectedText()) return
            props.onClose?.()
            dialog.clear()
          }}
        >
          <text fg={theme.background}>OK</text>
        </box>
      </box>
    </box>
  )
}

DialogAlert.show = (dialog: DialogContext, title: string, message: string) => {
  return new Promise<void>((resolve) => {
    dialog.replace(
      () => <DialogAlert title={title} message={message} onClose={() => resolve()} />,
      () => resolve(),
    )
  })
}
