import { For, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"

interface ListItem {
  label: string
  description?: string
  value: any
}

interface ListProps {
  items: ListItem[]
  onSelect: (item: ListItem) => void
  onCancel?: () => void
  emptyMessage?: string
}

export function List(props: ListProps) {
  const [selected, setSelected] = createSignal(0)

  useKeyboard((key) => {
    if (key.name === "up") {
      setSelected(s => Math.max(0, s - 1))
    } else if (key.name === "down") {
      setSelected(s => Math.min(props.items.length - 1, s + 1))
    } else if (key.name === "return" || key.name === "enter") {
      const item = props.items[selected()]
      if (item) {
        props.onSelect(item)
      }
    } else if (key.name === "escape") {
      props.onCancel?.()
    }
  })

  if (props.items.length === 0) {
    return (
      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg="gray">{props.emptyMessage || "No items found"}</text>
      </box>
    )
  }

  return (
    <box width="100%" flexDirection="column" padding={1}>
      <For each={props.items}>
        {(item, i) => (
          <box 
            width="100%" 
            padding={1}
            style={selected() === i() ? { backgroundColor: "cyan" } : {}}
          >
            <box width="100%" flexDirection="column">
              <text fg={selected() === i() ? "black" : undefined}>
                {selected() === i() ? <b>{item.label}</b> : item.label}
              </text>
              {item.description && (
                <text fg={selected() === i() ? "black" : "gray"}>{item.description}</text>
              )}
            </box>
          </box>
        )}
      </For>

      <box width="100%" marginTop={1} padding={1} style={{ borderStyle: "single", borderColor: "gray" }}>
        <text fg="gray">↑↓ Navigate • Enter Select • Esc Cancel</text>
      </box>
    </box>
  )
}
