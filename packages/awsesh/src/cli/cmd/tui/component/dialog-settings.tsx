import { createMemo } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { DialogThemeList } from "./dialog-theme-list"
import { DialogKeybindList } from "./dialog-keybind-list"
import { useTheme } from "../context/theme"
import { useConfig } from "../context/config"
import { Config, type ThemeMode } from "@/config/config"

const MODE_CYCLE: ThemeMode[] = ["system", "dark", "light"]

export function DialogSettings() {
  const dialog = useDialog()
  const config = useConfig()
  const { modePreference, setMode, toggleTransparentBg } = useTheme()

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
      description: `Current: ${modePreference()}`,
      value: "toggle_mode",
      category: "Appearance",
      onSelect: () => {
        const current = modePreference()
        const index = MODE_CYCLE.indexOf(current)
        const next = MODE_CYCLE[(index + 1) % MODE_CYCLE.length]
        setMode(next)
      },
    },
    {
      title: "Transparent background",
      description: `Current: ${config.data.transparentBg !== false ? "On" : "Off"}`,
      value: "transparent_bg",
      category: "Appearance",
      onSelect: () => {
        toggleTransparentBg()
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
