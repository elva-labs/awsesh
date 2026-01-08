import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useAWS } from "../context/aws"
import { useDialog, type DialogContext } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogBase, DialogButton, DialogFooter } from "../ui/dialog-base"

export type DialogSessionDeleteProps = {
  sessionName: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function DialogSessionDelete(props: DialogSessionDeleteProps) {
  const dialog = useDialog()
  const aws = useAWS()
  const toast = useToast()
  const { theme } = useTheme()

  const handleDelete = async () => {
    try {
      await aws.deleteSession(props.sessionName)
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

  const handleCancel = () => {
    dialog.clear()
    props.onCancel?.()
  }

  useKeyboard((evt) => {
    if (evt.name === "d") {
      evt.preventDefault()
      handleDelete()
    }
  })

  return (
    <DialogBase title="Delete SSO Session?" titleColor={theme.error}>
      <box flexDirection="column">
        <text fg={theme.text}>
          Are you sure you want to delete "{props.sessionName}"?
        </text>
        <text fg={theme.warning}>This action cannot be undone.</text>
      </box>

      <DialogFooter align="right">
        <box flexDirection="row" gap={1}>
          <DialogButton
            label="Cancel"
            onClick={handleCancel}
          />
          <DialogButton
            label="Delete"
            keybind="d"
            variant="danger"
            onClick={handleDelete}
          />
        </box>
      </DialogFooter>
    </DialogBase>
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
