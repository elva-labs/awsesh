import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import { DialogBase, DialogButton, DialogFooter } from "./dialog-base"

export type DialogConfirmProps = {
  title: string
  message: string
  onConfirm?: () => void
  onCancel?: () => void
}

export function DialogConfirm(props: DialogConfirmProps) {
  const dialog = useDialog()
  const { theme } = useTheme()

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "y") {
      evt.preventDefault()
      props.onConfirm?.()
      dialog.clear()
    }
    if (evt.name === "n") {
      evt.preventDefault()
      props.onCancel?.()
      dialog.clear()
    }
  })

  return (
    <DialogBase title={props.title}>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>{props.message}</text>
      </box>
      <DialogFooter align="right">
        <box flexDirection="row" gap={1}>
          <DialogButton
            label="Cancel"
            keybind="n"
            onClick={() => {
              props.onCancel?.()
              dialog.clear()
            }}
          />
          <DialogButton
            label="Confirm"
            keybind="y"
            variant="primary"
            onClick={() => {
              props.onConfirm?.()
              dialog.clear()
            }}
          />
        </box>
      </DialogFooter>
    </DialogBase>
  )
}

DialogConfirm.show = (dialog: DialogContext, title: string, message: string) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      () => (
        <DialogConfirm
          title={title}
          message={message}
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      ),
      () => resolve(false),
    )
  })
}
