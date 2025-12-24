import { createMemo } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { DialogThemeList } from "./dialog-theme-list"
import { DialogKeybindList } from "./dialog-keybind-list"
import { useTheme } from "../context/theme"
import { useConfig } from "../context/config"
import { Config } from "@/config/config"

export function DialogSettings() {
  const dialog = useDialog()
  const config = useConfig()
  const { mode, setMode } = useTheme()

  const options = createMemo<DialogSelectOption<string>[]>(() => [
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
      },
    },
    {
      title: "Date format",
      description: `Current: ${config.data.dateFormat}`,
      value: "date_format",
      category: "Preferences",
      onSelect: () => {
        const next = config.data.dateFormat === "dd/mm/yyyy" ? "mm/dd/yyyy" : "dd/mm/yyyy"
        config.set("dateFormat", next)
        Config.setDateFormat(next)
      },
    },
    {
      title: "Time format",
      description: `Current: ${config.data.timeFormat}`,
      value: "time_format",
      category: "Preferences",
      onSelect: () => {
        const next = config.data.timeFormat === "24h" ? "12h" : "24h"
        config.set("timeFormat", next)
        Config.setTimeFormat(next)
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
  ])

  return (
    <DialogSelect
      title="Settings"
      options={options()}
      onSelect={(opt) => {
        if (!opt.onSelect) {
          dialog.clear()
        }
      }}
    />
  )
}
