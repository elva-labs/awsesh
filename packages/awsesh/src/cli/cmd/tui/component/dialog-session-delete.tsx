import { useAWS } from "../context/aws"
import { useDialog, type DialogContext } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogConfirm } from "../ui/dialog-confirm"

export type DialogSessionDeleteProps = {
  sessionName: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function DialogSessionDelete(props: DialogSessionDeleteProps) {
  const aws = useAWS()
  const toast = useToast()

  const handleDelete = async () => {
    try {
      await aws.deleteSession(props.sessionName)
      toast.show({
        variant: "success",
        message: `SSO Session "${props.sessionName}" deleted`,
      })
      props.onSuccess?.()
    } catch (e) {
      toast.error(e)
    }
  }

  return (
    <DialogConfirm
      variant="danger"
      title="Delete SSO Session?"
      message={`Are you sure you want to delete "${props.sessionName}"?`}
      warning="This action cannot be undone."
      confirmLabel="Delete"

      onConfirm={handleDelete}
      onCancel={props.onCancel}
    />
  )
}

DialogSessionDelete.show = (dialog: DialogContext, sessionName: string) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      <DialogSessionDelete
        sessionName={sessionName}
        onSuccess={() => resolve(true)}
        onCancel={() => resolve(false)}
      />,
      () => resolve(false),
    )
  })
}
