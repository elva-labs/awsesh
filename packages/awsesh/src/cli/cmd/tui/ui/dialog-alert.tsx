import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import { DialogBase, DialogButton, DialogFooter } from "./dialog-base"

export type DialogAlertProps = {
  title: string
  message: string
  onClose?: () => void
}

export function DialogAlert(props: DialogAlertProps) {
  const dialog = useDialog()
  const { theme } = useTheme()

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "escape") {
      props.onClose?.()
      dialog.clear()
    }
  })

  return (
    <DialogBase title={props.title}>
      <box paddingBottom={1}>
        <text fg={theme.text}>{props.message}</text>
      </box>
      <DialogFooter align="right">
        <DialogButton
          label="OK"
          variant="primary"
          onClick={() => {
            props.onClose?.()
            dialog.clear()
          }}
        />
      </DialogFooter>
    </DialogBase>
  )
}

DialogAlert.show = (dialog: DialogContext, title: string, message: string) => {
  return new Promise<void>((resolve) => {
    dialog.replace(
      DialogAlert,
      { title, message, onClose: () => resolve() },
      () => resolve(),
    )
  })
}
