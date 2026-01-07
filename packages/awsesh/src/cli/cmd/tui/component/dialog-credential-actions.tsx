import { RGBA, TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { createMemo, For } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useDialog, type DialogContext } from "../ui/dialog"
import { useKeybind } from "../context/keybind"

interface ActionOption {
  id: string
  title: string
  keybind?: string
}

export type DialogCredentialActionsProps = {
  credentialName: string
  onRefresh?: () => void
  onKill?: () => void
}

export function DialogCredentialActions(props: DialogCredentialActionsProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const keybind = useKeybind()
  const renderer = useRenderer()
  const [store, setStore] = createStore({
    selected: 0,
  })

  const options: ActionOption[] = [
    { id: "refresh", title: "Refresh Credential", keybind: keybind.print("refresh") },
    { id: "kill", title: "Kill Credential", keybind: keybind.print("session_kill") },
  ]

  const selected = createMemo(() => options[store.selected])

  function move(direction: number) {
    let next = store.selected + direction
    if (next < 0) next = options.length - 1
    if (next >= options.length) next = 0
    setStore("selected", next)
  }

  useKeyboard((evt) => {
    if (evt.name === "up" || (evt.ctrl && evt.name === "p") || evt.name === "k") {
      evt.preventDefault()
      move(-1)
      return
    }
    if (evt.name === "down" || (evt.ctrl && evt.name === "n") || evt.name === "j") {
      evt.preventDefault()
      move(1)
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      const option = selected()
      dialog.clear()
      if (option.id === "refresh") props.onRefresh?.()
      if (option.id === "kill") props.onKill?.()
      return
    }
  })

  return (
    <box gap={1}>
      <box paddingLeft={3} paddingRight={2}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.credentialName}
          </text>
          <text fg={theme.textMuted}>esc</text>
        </box>
      </box>
      <box paddingLeft={2} paddingRight={2}>
        <For each={options}>
          {(option, index) => {
            const active = createMemo(() => index() === store.selected)
            return (
              <box
                flexDirection="row"
                onMouseUp={() => {
                  if (renderer.getSelection()?.getSelectedText()) return
                  dialog.clear()
                  if (option.id === "refresh") props.onRefresh?.()
                  if (option.id === "kill") props.onKill?.()
                }}
                backgroundColor={active() ? theme.primary : RGBA.fromInts(0, 0, 0, 0)}
                paddingLeft={1}
                paddingRight={1}
                gap={1}
              >
                <text
                  flexGrow={1}
                  fg={active() ? theme.background : theme.text}
                  attributes={active() ? TextAttributes.BOLD : undefined}
                >
                  {option.title}
                </text>
                <text flexShrink={0} fg={active() ? theme.background : theme.textMuted}>
                  {option.keybind}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </box>
  )
}

DialogCredentialActions.show = (
  dialog: DialogContext,
  credentialName: string,
  onRefresh: () => void,
  onKill: () => void
) => {
  dialog.replace(() => (
    <DialogCredentialActions
      credentialName={credentialName}
      onRefresh={onRefresh}
      onKill={onKill}
    />
  ))
}
