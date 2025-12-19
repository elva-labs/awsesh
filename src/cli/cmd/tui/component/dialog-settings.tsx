import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { DialogThemeList } from "./dialog-theme-list"

export function DialogSettings() {
  const dialog = useDialog()

  const options: DialogSelectOption<string>[] = [
    {
      title: "Placeholder",
      value: "placeholder1",
      footer: "ctrl-x a",
      category: "Settings",
    },
    {
      title: "Theme",
      value: "theme",
      footer: "ctrl-x t",
      category: "Settings",
      onSelect: () => {
        dialog.replace(() => <DialogThemeList />)
      },
    },
    {
      title: "Placeholder 2",
      value: "placeholder2",
      footer: "ctrl-x b",
      category: "Settings",
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
