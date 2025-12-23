import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useAwsesh } from "../context/awsesh"
import { useAWS } from "../context/aws"
import { useDialog, type DialogContext } from "../ui/dialog"
import { useToast } from "../ui/toast"

export type DialogSessionDeleteProps = {
  sessionName: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function DialogSessionDelete(props: DialogSessionDeleteProps) {
  const dialog = useDialog()
  const awsesh = useAwsesh()
  const aws = useAWS()
  const toast = useToast()
  const { theme } = useTheme()

  const handleDelete = async () => {
    try {
      await awsesh.sessions.remove(props.sessionName)
      await aws.refreshSessions()
      toast.show({
        variant: "success",
        message: `SSO Session "${props.sessionName}" deleted`,
      })
      dialog.clear()
      props.onSuccess?.()
    } catch (e) {
      toast.error(e)
    }
  }

  useKeyboard((evt) => {
    if (evt.name === "d") {
      evt.preventDefault()
      handleDelete()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.error} attributes={TextAttributes.BOLD}>
          Delete SSO Session?
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box flexDirection="column">
        <text fg={theme.text}>
          Are you sure you want to delete "{props.sessionName}"?
        </text>
        <text fg={theme.warning}>This action cannot be undone.</text>
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={theme.text}>
          <span style={{ fg: theme.error }}>d</span>
          <span style={{ fg: theme.textMuted }}> delete</span>
        </text>
        <text fg={theme.text}>
          <span style={{ fg: theme.accent }}>esc</span>
          <span style={{ fg: theme.textMuted }}> cancel</span>
        </text>
      </box>
    </box>
  )
}

DialogSessionDelete.show = (dialog: DialogContext, sessionName: string) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      () => (
        <DialogSessionDelete
          sessionName={sessionName}
          onSuccess={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      ),
      () => resolve(false)
    )
  })
}
