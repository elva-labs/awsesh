import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "../ui/dialog"

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

  useKeyboard((evt) => {
    if (evt.name === "y") {
      evt.preventDefault()
      handleConfirm()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.error} attributes={TextAttributes.BOLD}>
          Cleanup All Credentials?
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box flexDirection="column">
        <text fg={theme.text}>
          Are you sure you want to flush all active credentials?
        </text>
        <text fg={theme.warning}>This will remove all CLI credentials.</text>
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={theme.text}>
          <span style={{ fg: theme.error }}>y</span>
          <span style={{ fg: theme.textMuted }}> confirm</span>
        </text>
        <text fg={theme.text}>
          <span style={{ fg: theme.accent }}>esc</span>
          <span style={{ fg: theme.textMuted }}> cancel</span>
        </text>
      </box>
    </box>
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
