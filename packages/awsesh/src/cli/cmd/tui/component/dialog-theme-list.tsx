import { createMemo, onCleanup } from "solid-js"
import { DialogSelect, type DialogSelectRef } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useConfig } from "../context/config"

export function DialogThemeList() {
  const { theme, toggleTransparentBg, all, selected, set, preview } = useTheme()
  const config = useConfig()
  const dialog = useDialog()
  let confirmed = false
  let ref: DialogSelectRef<string>
  const initial = selected

  const options = createMemo(() =>
    Object.keys(all())
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((value) => ({ title: value, value }))
  )

  onCleanup(() => {
    if (!confirmed) preview(initial)
  })

  return (
    <box>
      <DialogSelect
        title="Themes"
        options={options()}
        current={initial}
        onMove={(opt) => {
          preview(opt.value)
        }}
        onSelect={(opt) => {
          set(opt.value)
          confirmed = true
          dialog.clear()
        }}
        onKeydown={(evt) => {
          if (evt.name === "space" || evt.name === " ") {
            evt.preventDefault()
            toggleTransparentBg()
          }
        }}
        ref={(r) => {
          ref = r
        }}
        onFilter={(query) => {
          if (query.length === 0) {
            preview(initial)
            return
          }
          const first = ref.filtered[0]
          if (first) preview(first.value)
        }}
      />
      <box paddingLeft={3} paddingRight={2} paddingTop={1} paddingBottom={1}>
        <text fg={theme.textMuted}>
          {"Enter to select · Space "}
          {config.data.transparentBg !== false ? "✓ " : ""}
          {"Transparent background"}
        </text>
      </box>
    </box>
  )
}
