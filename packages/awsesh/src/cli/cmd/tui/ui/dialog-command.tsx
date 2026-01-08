import { RGBA, TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { createEffect, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useTerminalDimensions, useRenderer } from "@opentui/solid"
import { useDialog } from "./dialog"
import { useKeybind } from "../context/keybind"
import { Locale } from "../util/locale"
import type { CommandOption } from "../context/command"

export interface DialogCommandProps {
  options: CommandOption[]
}

export function DialogCommand(props: DialogCommandProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const keybind = useKeybind()
  const renderer = useRenderer()
  const [store, setStore] = createStore({
    selected: 0,
  })

  const filtered = createMemo(() => {
    return props.options.filter((x) => x.disabled !== true)
  })

  const grouped = createMemo(() => {
    const result = new Map<string, (CommandOption & { footer?: string })[]>()
    for (const option of filtered()) {
      const category = option.category ?? ""
      const list = result.get(category) ?? []
      list.push({
        ...option,
        footer: option.keybind ? keybind.print(option.keybind) : undefined,
      })
      result.set(category, list)
    }
    return Array.from(result.entries())
  })

  const flat = createMemo(() => {
    return grouped().flatMap(([_, options]) => options)
  })

  const dimensions = useTerminalDimensions()
  const height = createMemo(() =>
    Math.min(flat().length + grouped().length * 2 - 1, Math.floor(dimensions().height / 2) - 4)
  )

  const selected = createMemo(() => flat()[store.selected])

  function move(direction: number) {
    let next = store.selected + direction
    if (next < 0) next = flat().length - 1
    if (next >= flat().length) next = 0
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
    if (evt.name === "pageup" || (evt.ctrl && evt.name === "u")) {
      evt.preventDefault()
      move(-10)
      return
    }
    if (evt.name === "pagedown" || (evt.ctrl && evt.name === "d")) {
      evt.preventDefault()
      move(10)
      return
    }
    if (evt.name === "return") {
      evt.preventDefault()
      const option = selected()
      if (option) {
        dialog.clear()
        option.onSelect?.(dialog)
      }
      return
    }
  })

  return (
    <box gap={1}>
      <box paddingLeft={3} paddingRight={2}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            Commands
          </text>
          <text fg={theme.textMuted}>esc</text>
        </box>
      </box>
      <scrollbox paddingLeft={2} paddingRight={2} scrollbarOptions={{ visible: false }} maxHeight={height()}>
        <For each={grouped()}>
          {([category, options], index) => (
            <>
              <Show when={category}>
                <box paddingTop={index() > 0 ? 1 : 0} paddingLeft={1}>
                  <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                    {category}
                  </text>
                </box>
              </Show>
              <For each={options}>
                {(option) => {
                  const active = createMemo(() => option.id === selected()?.id)
                  return (
                    <box
                      flexDirection="row"
                      onMouseUp={() => {
                        if (renderer.getSelection()?.getSelectedText()) return
                        dialog.clear()
                        option.onSelect?.(dialog)
                      }}
                      onMouseOver={() => {
                        const idx = flat().findIndex((x) => x.id === option.id)
                        if (idx !== -1) setStore("selected", idx)
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
                        overflow="hidden"
                        wrapMode="none"
                      >
                        {Locale.truncate(option.title, 50)}
                        <Show when={option.description}>
                          <span style={{ fg: active() ? theme.background : theme.textMuted }}>
                            {" "}
                            {option.description}
                          </span>
                        </Show>
                      </text>
                      <Show when={option.footer}>
                        <text flexShrink={0} fg={active() ? theme.background : theme.textMuted}>
                          {option.footer}
                        </text>
                      </Show>
                    </box>
                  )
                }}
              </For>
            </>
          )}
        </For>
      </scrollbox>
    </box>
  )
}
