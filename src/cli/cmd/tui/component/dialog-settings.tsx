import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { DialogThemeList } from "./dialog-theme-list"
import { DialogKeybindList } from "./dialog-keybind-list"
import { useTheme } from "../context/theme"

export function DialogSettings() {
  const dialog = useDialog()
  const { mode, setMode } = useTheme()

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
      title: "Toggle appearance",
      description: `Current: ${mode()}`,
      value: "toggle_mode",
      category: "Appearance",
      onSelect: () => {
        setMode(mode() === "dark" ? "light" : "dark")
        dialog.clear()
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
