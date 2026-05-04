import { useDialog, type DialogContext } from "../ui/dialog"
import { DialogConfirm } from "../ui/dialog-confirm"

export type DialogCredentialsCleanupProps = {
  onConfirm?: () => void
  onCancel?: () => void
}

export function DialogCredentialsCleanup(props: DialogCredentialsCleanupProps) {
  return (
    <DialogConfirm
      variant="danger"
      title="Cleanup All Credentials?"
      message="Are you sure you want to flush all active credentials?"
      warning="This will remove all CLI credentials."
      confirmLabel="Confirm"

      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    />
  )
}

DialogCredentialsCleanup.show = (dialog: DialogContext) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      <DialogCredentialsCleanup
        onConfirm={() => resolve(true)}
        onCancel={() => resolve(false)}
      />,
      () => resolve(false),
    )
  })
}
