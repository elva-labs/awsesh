import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import { DialogBase, DialogButton, DialogFooter } from "./dialog-base"

export type DialogConfirmVariant = "default" | "danger"

export type DialogConfirmProps = {
  title: string
  message: string
  warning?: string
  variant?: DialogConfirmVariant
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void
}

export function DialogConfirm(props: DialogConfirmProps) {
  const dialog = useDialog()
  const { theme } = useTheme()

  const handleConfirm = async () => {
    await props.onConfirm?.()
    dialog.clear()
  }

  const handleCancel = () => {
    props.onCancel?.()
    dialog.clear()
  }

  useKeyboard((evt) => {
    if (evt.name === "return") {
      evt.preventDefault()
      handleConfirm()
    }
  })

  const variant = () => props.variant ?? "default"
  const confirmLabel = () => props.confirmLabel ?? "Confirm"
  const cancelLabel = () => props.cancelLabel ?? "Cancel"

  return (
    <DialogBase
      title={props.title}
      titleColor={variant() === "danger" ? theme.error : undefined}
    >
      <box flexDirection="column" gap={1} paddingBottom={1}>
        <text fg={variant() === "danger" ? theme.text : theme.textMuted}>
          {props.message}
        </text>
      </box>
      <DialogFooter align="space-between">
        {props.warning && (
          <text fg={theme.warning}>{props.warning}</text>
        )}
        <box flexDirection="row" gap={1}>
          <DialogButton
            label={cancelLabel()}
            onClick={handleCancel}
          />
          <DialogButton
            label={confirmLabel()}
            variant={variant() === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
          />
        </box>
      </DialogFooter>
    </DialogBase>
  )
}

DialogConfirm.show = (
  dialog: DialogContext,
  options: {
    title: string
    message: string
    warning?: string
    variant?: DialogConfirmVariant
    confirmLabel?: string
    cancelLabel?: string
  },
) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      () => (
        <DialogConfirm
          {...options}
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      ),
      () => resolve(false),
    )
  })
}
