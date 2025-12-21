import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { DialogThemeList } from "./dialog-theme-list"
import { DialogKeybindList } from "./dialog-keybind-list"

export function DialogSettings() {
  const dialog = useDialog()

  const options: DialogSelectOption<string>[] = [
    {
      title: "Theme",
      value: "theme",
      category: "Appearance",
      onSelect: () => {
        dialog.replace(() => <DialogThemeList />)
      },
    },
    {
      title: "Keybinds",
      value: "keybinds",
      category: "Preferences",
      onSelect: () => {
        dialog.replace(() => <DialogKeybindList />)
      },
    },
  ]

  return (
    <DialogSelect
      title="Settings"
      options={options}
      onSelect={(opt) => {
        if (!opt.onSelect) {
          dialog.clear()
        }
      }}
    />
  )
}
