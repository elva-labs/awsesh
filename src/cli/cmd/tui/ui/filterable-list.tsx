import { batch, createEffect, createMemo, For, onCleanup, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useDialog } from "./dialog"
import { TextAttributes, RGBA, type InputRenderable } from "@opentui/core"
import { Locale } from "../util/locale"
import * as fuzzysort from "fuzzysort"

export interface FilterableListProps<T> {
  title?: string
  items: FilterableListItem<T>[]
  onSelect?: (item: FilterableListItem<T>) => void
  onMove?: (item: FilterableListItem<T>) => void
  onFilter?: (query: string) => void
  filterPlaceholder?: string
  emptyMessage?: string
  footer?: JSX.Element
  showFilter?: boolean
  current?: T
  maxHeight?: number
}

export interface FilterableListItem<T = any> {
  id: string
  title: string
  value: T
  description?: string
  footer?: string | JSX.Element
  category?: string
  disabled?: boolean
}

export function FilterableList<T>(props: FilterableListProps<T>) {
  const { theme } = useTheme()
  const keybind = useKeybind()
  const command = useCommand()
  const dialog = useDialog()
  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
    filterActive: false,
  })

  let input: InputRenderable
  let scroll: any

  const filtered = createMemo(() => {
    const needle = store.filter.toLowerCase()
    const items = props.items.filter((x) => !x.disabled)
    if (!needle) return items
    return fuzzysort.go(needle, items, { keys: ["title", "category", "description"] }).map((x) => x.obj)
  })

  const grouped = createMemo(() => {
    const result = new Map<string, FilterableListItem<T>[]>()
    for (const item of filtered()) {
      const category = item.category ?? ""
      const list = result.get(category) ?? []
      list.push(item)
      result.set(category, list)
    }
    return Array.from(result.entries())
  })

  const flat = createMemo(() => filtered())

  const dimensions = useTerminalDimensions()
  const height = createMemo(() => {
    if (props.maxHeight) return props.maxHeight
    const baseHeight = props.showFilter !== false ? 6 : 4
    return Math.min(flat().length + grouped().length * 2, Math.floor(dimensions().height) - baseHeight)
  })

  const selected = createMemo(() => flat()[store.selected])

  createEffect(() => {
    store.filter
    setStore("selected", 0)
    if (scroll) scroll.scrollTo(0)
  })

  createEffect(() => {
    if (input) {
      input.value = store.filter
    }
  })

  let commandsSuspended = false
  createEffect(() => {
    const hasFilter = store.filter.length > 0
    if (hasFilter && !commandsSuspended) {
      command.suspend(true)
      commandsSuspended = true
    } else if (!hasFilter && commandsSuspended) {
      command.suspend(false)
      commandsSuspended = false
    }
  })

  onCleanup(() => {
    if (commandsSuspended) {
      command.suspend(false)
    }
  })

  function move(direction: number) {
    let next = store.selected + direction
    if (next < 0) next = flat().length - 1
    if (next >= flat().length) next = 0
    moveTo(next)
  }

  function moveTo(next: number) {
    setStore("selected", next)
    const item = flat()[next]
    if (item) props.onMove?.(item)
    const target = scroll?.getChildren().find((child: any) => {
      return child.id === selected()?.id
    })
    if (!target || !scroll) return
    const y = target.y - scroll.y
    if (y >= scroll.height) {
      scroll.scrollBy(y - scroll.height + 1)
    }
    if (y < 0) {
      scroll.scrollBy(y)
    }
  }

  useKeyboard((evt) => {
    if (store.filterActive) return
    if (dialog.stack.length > 0) return

    if (evt.name === "escape" && store.filter) {
      evt.preventDefault()
      setStore("filter", "")
      return
    }
    if (evt.name === "up" || (evt.ctrl && evt.name === "p") || evt.name === "k") {
      evt.preventDefault()
      move(-1)
    }
    if (evt.name === "down" || (evt.ctrl && evt.name === "n") || evt.name === "j") {
      evt.preventDefault()
      move(1)
    }
    if (evt.name === "pageup" || (evt.ctrl && evt.name === "u")) {
      evt.preventDefault()
      move(-10)
    }
    if (evt.name === "pagedown" || (evt.ctrl && evt.name === "d")) {
      evt.preventDefault()
      move(10)
    }
    if (evt.name === "return") {
      const item = selected()
      if (item) {
        evt.preventDefault()
        props.onSelect?.(item)
      }
    }
    if (keybind.match("filter", evt) && props.showFilter !== false) {
      evt.preventDefault()
      setStore("filterActive", true)
      setTimeout(() => {
        input?.focus()
        if (input && store.filter) {
          input.cursorPosition = store.filter.length
        }
      }, 1)
    }
  })

  return (
    <box flexDirection="column" gap={1}>
      <Show when={props.title}>
        <box paddingLeft={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
        </box>
      </Show>

      <Show when={props.showFilter !== false}>
        <box paddingLeft={1} paddingRight={1}>
          <input
            value={store.filter}
            onInput={(e) => {
              batch(() => {
                setStore("filter", e)
                props.onFilter?.(e)
              })
            }}
            onKeyDown={(evt: any) => {
              if (evt.name === "return") {
                evt.preventDefault()
                setStore("filterActive", false)
                input?.blur()
              }
              if (evt.name === "escape") {
                evt.preventDefault()
                if (store.filter) {
                  setStore("filter", "")
                } else {
                  setStore("filterActive", false)
                  input?.blur()
                }
              }
            }}
            backgroundColor={theme.background}
            textColor={theme.text}
            focusedBackgroundColor={theme.background}
            cursorColor={theme.primary}
            focusedTextColor={theme.text}
            placeholder={props.filterPlaceholder ?? "Search..."}
            ref={(r) => (input = r)}
          />
        </box>
      </Show>

      <Show when={flat().length === 0}>
        <box paddingLeft={1} paddingTop={2} paddingBottom={2}>
          <text fg={theme.textMuted}>{props.emptyMessage ?? "No items found"}</text>
        </box>
      </Show>

      <Show when={flat().length > 0}>
        <scrollbox
          scrollbarOptions={{ visible: false }}
          maxHeight={height()}
          ref={(r: any) => (scroll = r)}
        >
          <For each={grouped()}>
            {([category, items], index) => (
              <>
                <Show when={category}>
                  <box paddingTop={index() > 0 ? 1 : 0} paddingLeft={1}>
                    <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                      {category}
                    </text>
                  </box>
                </Show>
                <For each={items}>
                  {(item) => {
                    const active = createMemo(() => item.id === selected()?.id)
                    const current = createMemo(() => {
                      if (props.current === undefined) return false
                      return item.value === props.current
                    })

                    return (
                      <box
                        id={item.id}
                        flexDirection="row"
                        onMouseUp={() => {
                          if (!item.disabled) props.onSelect?.(item)
                        }}
                        onMouseOver={() => {
                          const idx = flat().findIndex((x) => x.id === item.id)
                          if (idx !== -1) moveTo(idx)
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
                          overflow="hidden"
                          wrapMode="none"
                        >
                          {Locale.truncate(item.title, 62)}
                          <Show when={item.description}>
                            <span style={{ fg: active() ? theme.background : theme.textMuted }}>
                              {" "}
                              {item.description}
                            </span>
                          </Show>
                        </text>
                        <Show when={item.footer}>
                          <box flexShrink={0}>
                            <text fg={active() ? theme.background : theme.textMuted}>
                              {item.footer}
                            </text>
                          </box>
                        </Show>
                      </box>
                    )
                  }}
                </For>
              </>
            )}
          </For>
        </scrollbox>
      </Show>

      <Show when={props.footer}>
        <box>{props.footer}</box>
      </Show>
    </box>
  )
}
