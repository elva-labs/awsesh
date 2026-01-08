import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "../ui/dialog"
import { DialogBase, DialogButton, DialogFooter } from "../ui/dialog-base"

export type DialogCredentialsCleanupProps = {
  onConfirm?: () => void
  onCancel?: () => void
}

export function DialogCredentialsCleanup(props: DialogCredentialsCleanupProps) {
  const dialog = useDialog()
  const { theme } = useTheme()

  const handleConfirm = () => {
    dialog.clear()
    props.onConfirm?.()
  }

  const handleCancel = () => {
    dialog.clear()
    props.onCancel?.()
  }

  useKeyboard((evt) => {
    if (evt.name === "y") {
      evt.preventDefault()
      handleConfirm()
    }
  })

  return (
    <DialogBase title="Cleanup All Credentials?" titleColor={theme.error}>
      <box flexDirection="column">
        <text fg={theme.text}>
          Are you sure you want to flush all active credentials?
        </text>
        <text fg={theme.warning}>This will remove all CLI credentials.</text>
      </box>

      <DialogFooter align="right">
        <box flexDirection="row" gap={1}>
          <DialogButton
            label="Cancel"
            onClick={handleCancel}
          />
          <DialogButton
            label="Confirm"
            keybind="y"
            variant="danger"
            onClick={handleConfirm}
          />
        </box>
      </DialogFooter>
    </DialogBase>
  )
}

DialogCredentialsCleanup.show = (dialog: DialogContext) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      () => (
        <DialogCredentialsCleanup
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      ),
      () => resolve(false)
    )
  })
}
