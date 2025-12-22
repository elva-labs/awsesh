import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"

export interface ProfileNameDialogProps {
  currentProfileName?: string
  accountName: string
  roleName: string
  onConfirm: (profileName: string) => void
}

export function ProfileNameDialog(props: ProfileNameDialogProps) {
  const dialog = useDialog()
  const { theme } = useTheme()

  return (
    <DialogPrompt
      title="Set Profile Name"
      description={() => (
        <text fg={theme.textMuted}>
          Set custom profile name for {props.accountName} / {props.roleName}:
        </text>
      )}
      value={props.currentProfileName ?? "default"}
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
