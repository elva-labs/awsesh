import { RGBA, TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { batch, createEffect, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useDialog, type DialogContext } from "./dialog"
import { Locale } from "../util/locale"

export interface DialogSelectProps<T> {
  title: string
  options: DialogSelectOption<T>[]
  onSelect?: (option: DialogSelectOption<T>) => void
  current?: T
}

export interface DialogSelectOption<T = any> {
  title: string
  value: T
  description?: string
  category?: string
  disabled?: boolean
  onSelect?: (ctx: DialogContext) => void
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
  })

  let input: any

  const filtered = createMemo(() => {
    const needle = store.filter.toLowerCase()
    const options = props.options.filter((x) => x.disabled !== true)
    if (!needle) return options
    return options.filter((x) =>
      x.title.toLowerCase().includes(needle) || x.category?.toLowerCase().includes(needle)
    )
  })

  const grouped = createMemo(() => {
    const result = new Map<string, DialogSelectOption<T>[]>()
    for (const option of filtered()) {
      const category = option.category ?? ""
      const list = result.get(category) ?? []
      list.push(option)
      result.set(category, list)
    }
    return Array.from(result.entries())
  })

  const flat = createMemo(() => {
    return filtered()
  })

  const dimensions = useTerminalDimensions()
  const height = createMemo(() =>
    Math.min(flat().length + grouped().length * 2 - 1, Math.floor(dimensions().height / 2) - 6)
  )

  const selected = createMemo(() => flat()[store.selected])

  createEffect(() => {
    store.filter
    setStore("selected", 0)
  })

  function move(direction: number) {
    let next = store.selected + direction
    if (next < 0) next = flat().length - 1
    if (next >= flat().length) next = 0
    setStore("selected", next)
  }

  useKeyboard((evt) => {
    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) move(-1)
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) move(1)
    if (evt.name === "pageup") move(-10)
    if (evt.name === "pagedown") move(10)
    if (evt.name === "return") {
      const option = selected()
      if (option) {
        if (option.onSelect) option.onSelect(dialog)
        props.onSelect?.(option)
      }
    }
  })

  return (
    <box gap={1}>
      <box paddingLeft={3} paddingRight={2}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
          <text fg={theme.textMuted}>esc</text>
        </box>
        <box paddingTop={1} paddingBottom={1}>
          <input
            onInput={(e) => {
              batch(() => {
                setStore("filter", e)
              })
            }}
            focusedBackgroundColor={theme.inputBg}
            cursorColor={theme.inputCursor}
            focusedTextColor={theme.inputFocusText}
            ref={(r) => {
              input = r
              setTimeout(() => input.focus(), 1)
            }}
            placeholder="Search..."
          />
        </box>
      </box>
      <scrollbox
        paddingLeft={2}
        paddingRight={2}
        scrollbarOptions={{ visible: false }}
        maxHeight={height()}
      >
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
                  const active = createMemo(() => option.value === selected()?.value)
                  const current = createMemo(() => option.value === props.current)
                  return (
                    <box
                      flexDirection="row"
                      onMouseUp={() => {
                        option.onSelect?.(dialog)
                        props.onSelect?.(option)
                      }}
                      backgroundColor={active() ? theme.primary : RGBA.fromInts(0, 0, 0, 0)}
                      paddingLeft={1}
                      paddingRight={1}
                      gap={1}
                    >
                      <Show when={current()}>
                        <text
                          flexShrink={0}
                          fg={active() ? theme.background : theme.primary}
                          marginRight={0.5}
                        >
                          ●
                        </text>
                      </Show>
                      <text
                        flexGrow={1}
                        fg={active() ? theme.background : current() ? theme.primary : theme.text}
                        attributes={active() ? TextAttributes.BOLD : undefined}
                        overflow="hidden"
                        wrapMode="none"
                      >
                        {Locale.truncate(option.title, 62)}
                        <Show when={option.description}>
                          <span style={{ fg: active() ? theme.background : theme.textMuted }}>
                            {" "}
                            {option.description}
                          </span>
                        </Show>
                      </text>
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
