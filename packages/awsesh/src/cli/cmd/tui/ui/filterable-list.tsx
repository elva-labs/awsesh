import { batch, createEffect, createMemo, For, on, onCleanup, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useTerminalDimensions, useRenderer } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useDialog } from "./dialog"
import { TextAttributes, RGBA, type InputRenderable, type ScrollBoxRenderable } from "@opentui/core"
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
  initialId?: string
}

export type IndicatorState = "active" | "default" | "inactive"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface FilterableListItem<T = any> {
  id: string
  title: string
  value: T
  description?: string
  subtitle?: string
  footer?: string | JSX.Element
  category?: string
  disabled?: boolean
  indicator?: IndicatorState
}

export function FilterableList<T>(props: FilterableListProps<T>) {
  const { theme } = useTheme()
  const keybind = useKeybind()
  const command = useCommand()
  const dialog = useDialog()
  const renderer = useRenderer()
  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
    filterActive: false,
  })

  let input: InputRenderable
  let scroll: ScrollBoxRenderable

  const filtered = createMemo(() => {
    const needle = store.filter.toLowerCase()
    const items = props.items.filter((x) => !x.disabled)
    if (!needle) return items
    const needleNoSpaces = needle.replace(/\s+/g, "")
    return fuzzysort.go(needleNoSpaces, items, { keys: ["title", "category", "description", "subtitle"].map(k => (item: FilterableListItem<T>) => (item[k as keyof FilterableListItem<T>] ?? "").toString().toLowerCase().replace(/\s+/g, "")) }).map((x) => x.obj)
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
    const items = flat()
    const itemHeight = items.reduce((acc, item) => {
      const rowHeight = item.subtitle ? 3 : 2
      return acc + rowHeight
    }, 0)
    return Math.min(itemHeight + grouped().length * 2, Math.floor(dimensions().height) - baseHeight)
  })

  const selected = createMemo(() => flat()[store.selected])

  let initialNotified = false
  let initialIdApplied = false
  let defaultTimer: ReturnType<typeof setTimeout> | null = null
  createEffect(on(
    () => [flat(), props.initialId] as const,
    ([items, initialId]) => {
      if (items.length === 0) return
      if (initialIdApplied) return
      if (initialId) {
        if (defaultTimer) {
          clearTimeout(defaultTimer)
          defaultTimer = null
        }
        const idx = items.findIndex((x) => x.id === initialId)
        if (idx !== -1) {
          initialIdApplied = true
          initialNotified = true
          moveTo(idx)
          return
        }
      }
      if (!initialNotified && !defaultTimer) {
        defaultTimer = setTimeout(() => {
          if (initialIdApplied || initialNotified) return
          initialNotified = true
          const item = selected()
          if (item) props.onMove?.(item)
        }, 50)
      }
    }
  ))

  onCleanup(() => {
    if (defaultTimer) clearTimeout(defaultTimer)
  })

  createEffect(on(
    () => store.filter,
    () => {
      setStore("selected", 0)
      if (scroll) scroll.scrollTo(0)
    },
    { defer: true }
  ))

  createEffect(() => {
    if (input) {
      input.value = store.filter
    }
  })

  let commandsSuspended = false
  createEffect(() => {
    const shouldSuspend = store.filterActive
    if (shouldSuspend && !commandsSuspended) {
      command.suspend(true)
      commandsSuspended = true
    } else if (!shouldSuspend && commandsSuspended) {
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
    if (!scroll) return

    const children = scroll.getChildren()
    const target = children.find((child) => child.id === item.id)
    if (!target) return

    const y = target.y - scroll.y

    const nextItem = flat()[next + 1]
    const nextTarget = nextItem ? children.find((child) => child.id === nextItem.id) : null
    if (nextTarget) {
      const nextY = nextTarget.y - scroll.y
      if (nextY + nextTarget.height > scroll.height) {
        scroll.scrollBy(nextY + nextTarget.height - scroll.height)
      }
    } else if (y + target.height > scroll.height) {
      scroll.scrollBy(y + target.height - scroll.height)
    }

    const prevItem = flat()[next - 1]
    const prevTarget = prevItem ? children.find((child) => child.id === prevItem.id) : null
    if (prevTarget) {
      const prevY = prevTarget.y - scroll.y
      if (prevY < 0) {
        scroll.scrollBy(prevY)
      }
    } else if (y < 0) {
      scroll.scrollBy(y)
      if (next === 0) {
        scroll.scrollTo(0)
      }
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
    <box flexDirection="column" flexGrow={1} backgroundColor={theme.background}>
      <Show when={props.title}>
        <box paddingLeft={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
        </box>
      </Show>

      <Show when={props.showFilter !== false}>
        <box flexDirection="column">
          <box
            paddingLeft={1}
            paddingRight={1}
            height={1}
            onMouseUp={() => {
              if (renderer.getSelection()?.getSelectedText()) return
              setStore("filterActive", true)
              setTimeout(() => {
                input?.focus()
                if (input && store.filter) {
                  input.cursorPosition = store.filter.length
                }
              }, 1)
            }}
          >
            <input
            value={store.filter}
            focused={store.filterActive}
            onInput={(e) => {
              batch(() => {
                setStore("filter", e)
                props.onFilter?.(e)
              })
            }}
            onKeyDown={(evt) => {
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
            placeholderColor={theme.textMuted}
            ref={(r) => (input = r)}
          />
          </box>
          <box
            borderStyle="single"
            borderColor={theme.border}
            border={["top"]}
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
          flexGrow={1}
          overflow="hidden"
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
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
                  {(item, itemIndex) => {
                    const active = createMemo(() => item.id === selected()?.id)
                    const current = createMemo(() => {
                      if (props.current === undefined) return false
                      return item.value === props.current
                    })
                    const isFirstGlobal = createMemo(() => index() === 0 && itemIndex() === 0)
                    const isFirstInCategory = createMemo(() => itemIndex() === 0)
                    const showSeparator = createMemo(() => {
                      if (!item.subtitle) return false
                      if (isFirstGlobal() && !category) return false
                      if (isFirstInCategory() && category) return true
                      return true
                    })

                    return (
                      <>
                        <Show when={showSeparator()}>
                          <box
                            borderStyle="single"
                            borderColor={theme.border}
                            border={["top"]}
                          />
                        </Show>
                        <box
                          id={item.id}
                          flexDirection="column"
                          onMouseUp={() => {
                            if (renderer.getSelection()?.getSelectedText()) return
                            if (!item.disabled) props.onSelect?.(item)
                          }}
                          onMouseOver={() => {
                            const idx = flat().findIndex((x) => x.id === item.id)
                            if (idx !== -1) moveTo(idx)
                          }}
                          backgroundColor={active() ? theme.primary : RGBA.fromInts(0, 0, 0, 0)}
                          paddingLeft={1}
                          paddingRight={1}
                        >
                        <box flexDirection="row" gap={1}>
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
                            attributes={TextAttributes.BOLD}
                          >
                            {Locale.truncate(item.title, 62)}
                            <Show when={item.description}>
                              <span style={{ fg: active() ? theme.background : theme.textMuted }}>
                                {" "}
                                {item.description}
                              </span>
                            </Show>
                          </text>
                          <Show when={item.indicator !== undefined}>
                            <text
                              flexShrink={0}
                              fg={
                                item.indicator === "default"
                                  ? theme.success
                                  : item.indicator === "active"
                                    ? theme.secondary
                                    : theme.error
                              }
                            >
                              ●
                            </text>
                          </Show>
                          <Show when={item.footer}>
                            <box flexShrink={0}>
                              <text fg={active() ? theme.background : theme.textMuted}>
                                {item.footer}
                              </text>
                            </box>
                          </Show>
                        </box>
                        <Show when={item.subtitle}>
                          <box paddingLeft={current() ? 2.5 : 0}>
                            <text
                              fg={active() ? theme.background : theme.textMuted}
                              overflow="hidden"
                              wrapMode="none"
                            >
                              {item.subtitle}
                            </text>
                          </box>
                        </Show>
                      </box>
                      </>
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
