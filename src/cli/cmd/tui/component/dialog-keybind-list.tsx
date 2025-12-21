import type { KeybindsConfig } from "../context/config"
import { useKeybind } from "../context/keybind"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"

interface KeybindInfo {
  key: keyof KeybindsConfig
  label: string
  category: string
}

const keybindDefinitions: KeybindInfo[] = [
  { key: "leader", label: "Leader Key", category: "Core" },
  { key: "quit", label: "Quit", category: "Core" },
  { key: "back", label: "Back / Cancel", category: "Core" },
  { key: "help", label: "Help", category: "Core" },
  { key: "command_list", label: "Command List", category: "Core" },

  { key: "nav_up", label: "Navigate Up", category: "Navigation" },
  { key: "nav_down", label: "Navigate Down", category: "Navigation" },
  { key: "nav_left", label: "Navigate Left", category: "Navigation" },
  { key: "nav_right", label: "Navigate Right", category: "Navigation" },
  { key: "nav_page_up", label: "Page Up", category: "Navigation" },
  { key: "nav_page_down", label: "Page Down", category: "Navigation" },
  { key: "select", label: "Select", category: "Navigation" },

  { key: "filter", label: "Filter", category: "Actions" },
  { key: "refresh", label: "Refresh", category: "Actions" },
  { key: "settings", label: "Settings", category: "Actions" },
  { key: "browser_open", label: "Open in Browser", category: "Actions" },

  { key: "profile_set", label: "Set Profile", category: "Profiles" },
  { key: "profile_add", label: "Add Profile", category: "Profiles" },
  { key: "profile_edit", label: "Edit Profile", category: "Profiles" },
  { key: "profile_delete", label: "Delete Profile", category: "Profiles" },

  { key: "region_set", label: "Set Region", category: "AWS" },
  { key: "role_list", label: "List Roles", category: "AWS" },
]

export function DialogKeybindList() {
  const keybind = useKeybind()

  const options: DialogSelectOption<keyof KeybindsConfig>[] = keybindDefinitions.map(
    (def) => ({
      title: def.label,
      value: def.key,
      category: def.category,
      footer: keybind.print(def.key),
    })
  )

  return (
    <DialogSelect
      title="Keybinds"
      options={options}
      placeholder="Search keybinds..."
      onSelect={() => {}}
    />
  )
}
