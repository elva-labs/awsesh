import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"

export interface ProfileNameDialogProps {
  currentProfileName?: string
  accountName: string
  roleName: string
  onConfirm: (profileName: string) => void
}

export function ProfileNameDialog(props: ProfileNameDialogProps) {
  const dialog = useDialog()

  return (
    <DialogPrompt
      title="Set Profile Name"
      message={`Set custom profile name for ${props.accountName} / ${props.roleName}:`}
      defaultValue={props.currentProfileName ?? "default"}
      placeholder="Enter profile name..."
      onConfirm={(value) => {
        if (value.trim()) {
          props.onConfirm(value.trim())
        }
        dialog.clear()
      }}
      onCancel={() => dialog.clear()}
    />
  )
}
