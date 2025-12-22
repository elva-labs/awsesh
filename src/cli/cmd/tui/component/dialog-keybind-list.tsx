import { createSignal } from "solid-js"
import type { KeybindsConfig } from "../context/config"
import { useKeybind } from "../context/keybind"
import { useDialog } from "../ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { DialogKeybindEdit } from "./dialog-keybind-edit"

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

  { key: "session_set", label: "Set SSO Session", category: "Sessions" },
  { key: "session_add", label: "Add SSO Session", category: "Sessions" },
  { key: "session_edit", label: "Edit SSO Session", category: "Sessions" },
  { key: "session_delete", label: "Delete SSO Session", category: "Sessions" },

  { key: "region_set", label: "Set Region", category: "AWS" },
  { key: "role_list", label: "List Roles", category: "AWS" },
]

export function DialogKeybindList() {
  const keybind = useKeybind()
  const dialog = useDialog()
  const [, setRefresh] = createSignal(0)

  function getOptions(): DialogSelectOption<keyof KeybindsConfig>[] {
    return keybindDefinitions.map((def) => ({
      title: def.label,
      value: def.key,
      category: def.category,
      footer: keybind.print(def.key),
    }))
  }

  function showList() {
    dialog.replace(() => <DialogKeybindList />)
  }

  function handleSelect(opt: DialogSelectOption<keyof KeybindsConfig>) {
    const def = keybindDefinitions.find((d) => d.key === opt.value)
    if (!def) return

    dialog.replace(() => (
      <DialogKeybindEdit
        keybindKey={def.key}
        label={def.label}
        onSave={() => {
          setRefresh((n) => n + 1)
        }}
        onBack={showList}
      />
    ))
  }

  return (
    <DialogSelect
      title="Keybinds"
      options={getOptions()}
      placeholder="Search keybinds..."
      onSelect={handleSelect}
    />
  )
}
