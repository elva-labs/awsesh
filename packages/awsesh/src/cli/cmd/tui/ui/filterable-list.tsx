import { batch, createEffect, createMemo, createSelector, For, on, onCleanup, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useTerminalDimensions, useRenderer } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useConfig } from "../context/config"
import { useDialog } from "./dialog"
import { TextAttributes, RGBA, type BoxRenderable, type InputRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { Locale } from "../util/locale"
import * as fuzzysort from "fuzzysort"

export interface FilterableListProps<T> {
  title?: string
  items: FilterableListItem<T>[]
  onSelect?: (item: FilterableListItem<T>) => void
  onMove?: (item: FilterableListItem<T>) => void
  onEmpty?: () => void
  onCategoryMove?: (category: string) => void
  onFilter?: (query: string) => void
  filterPlaceholder?: string
  emptyMessage?: string
  footer?: JSX.Element
  showFilter?: boolean
  current?: T
  maxHeight?: number
  initialId?: string
  collapsedCategories?: string[]
  onCategoryToggle?: (category: string, collapsed: boolean) => void
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
  categoryId?: string
  favorite?: boolean
  disabled?: boolean
  indicator?: IndicatorState
}

const transparent = RGBA.fromInts(0, 0, 0, 0)
const normalizeSearch = (text: string) => text.toLowerCase().replace(/\s+/g, "")
const prepareSearch = (text?: string) => text ? fuzzysort.prepare(normalizeSearch(text)) : undefined

export function FilterableList<T>(props: FilterableListProps<T>) {
  type Entry = { kind: "item"; id: string; item: FilterableListItem<T> } | { kind: "category"; id: string; category: string }
  const { theme } = useTheme()
  const keybind = useKeybind()
  const command = useCommand()
  const config = useConfig()
  const dialog = useDialog()
  const renderer = useRenderer()
  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
    filterActive: false,
  })

  let input: InputRenderable
  let scroll: ScrollBoxRenderable
  const rows = new Map<string, BoxRenderable>()

  const enabled = createMemo(() => props.items.filter((item) => !item.disabled))
  const searchIndex = createMemo(() => enabled().map((item) => ({
    item,
    title: prepareSearch(item.title),
    category: prepareSearch(item.category),
    description: prepareSearch(item.description),
    subtitle: prepareSearch(item.subtitle),
  })))
  const searching = createMemo(() => Boolean(store.filter.trim()))
  const filtered = createMemo(() => {
    if (!searching()) return enabled()
    return fuzzysort.go(normalizeSearch(store.filter), searchIndex(), {
      keys: ["title", "category", "description", "subtitle"],
    }).map((match) => match.obj.item)
  })

  const grouped = createMemo(() => {
    const result = new Map<string, FilterableListItem<T>[]>()
    for (const item of filtered()) {
      const category = item.categoryId ?? item.category ?? ""
      const list = result.get(category)
      if (list) list.push(item)
      else result.set(category, [item])
    }
    return result
  })
  const categories = createMemo(() => [...grouped().keys()])

  const collapsedCategories = createMemo(() => new Set(props.collapsedCategories))
  const collapsed = (category: string) => !searching() && collapsedCategories().has(category)
  const flat = createMemo(() => {
    const entries: Entry[] = []
    for (const [category, items] of grouped()) {
      if (props.onCategoryToggle && items[0]?.category) entries.push({ kind: "category", id: `category:${category}`, category })
      if (!collapsed(category)) {
        for (const item of items) entries.push({ kind: "item", id: `item:${item.id}`, item })
      }
    }
    return entries
  })
  const indices = createMemo(() => new Map(flat().map((entry, index) => [entry.id, index])))

  function toggleCategory(category: string, collapse: boolean) {
    const item = grouped().get(category)?.[0]
    if (!item?.category || !props.onCategoryToggle || store.filter.trim()) return
    props.onCategoryToggle(category, collapse)
  }

  const dimensions = useTerminalDimensions()
  const height = createMemo(() => {
    if (props.maxHeight) return props.maxHeight
    const baseHeight = props.showFilter !== false ? 6 : 4
    const items = flat()
    const itemHeight = items.reduce((acc, item) => {
      const rowHeight = item.kind === "category" ? 1 : item.item.subtitle ? 3 : 2
      return acc + rowHeight
    }, 0)
    return Math.min(itemHeight + grouped().size * 2, Math.floor(dimensions().height) - baseHeight)
  })

  const selectedEntry = createMemo(() => flat()[store.selected])
  const isSelected = createSelector(() => selectedEntry()?.id)
  const selected = createMemo(() => {
    const entry = selectedEntry()
    return entry?.kind === "item" ? entry.item : undefined
  })

  let selectedId: string | undefined
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
        const idx = indices().get(`item:${initialId}`)
        if (idx !== undefined) {
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
          select(store.selected)
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
      const first = store.filter.trim() ? flat().findIndex((entry) => entry.kind === "item") : 0
      select(first === -1 ? 0 : first)
      if (scroll) scroll.scrollTo(0)
    },
    { defer: true }
  ))

  // Items can reorder or disappear while the filter is unchanged (e.g. a subtitle
  // change re-ranks fuzzy matches), so follow the selected item by id. Scrolling
  // waits for the next frame so the new rows have been laid out.
  createEffect(on(flat, (items) => {
    if (items.length === 0) {
      selectedId = undefined
      props.onEmpty?.()
      return
    }
    if (selectedId === undefined) {
      select(Math.min(store.selected, items.length - 1))
      return
    }
    const idx = indices().get(selectedId)
    if (idx === store.selected) return
    if (idx === undefined) select(Math.min(store.selected, items.length - 1))
    else setStore("selected", idx)
    renderer.once("frame", () => scrollToIndex(store.selected))
  }))

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

  function select(next: number) {
    setStore("selected", next)
    const entry = flat()[next]
    selectedId = entry?.id
    if (entry?.kind === "item") props.onMove?.(entry.item)
    else {
      props.onEmpty?.()
      if (entry?.kind === "category") props.onCategoryMove?.(entry.category)
    }
  }

  function moveTo(next: number, includeNeighbors?: boolean) {
    select(next)
    scrollToIndex(next, includeNeighbors)
  }

  function scrollToIndex(next: number, includeNeighbors?: boolean) {
    const item = flat()[next]
    if (!scroll || scroll.isDestroyed || !item) return

    const target = rows.get(item.id)
    if (!target) return

    const y = target.y - scroll.y

    if (includeNeighbors) {
      const nextItem = flat()[next + 1]
      const nextTarget = nextItem && rows.get(nextItem.id)
      if (nextTarget) {
        const nextY = nextTarget.y - scroll.y
        if (nextY + nextTarget.height > scroll.height) {
          scroll.scrollBy(nextY + nextTarget.height - scroll.height)
          return
        }
      }

      const prevItem = flat()[next - 1]
      const prevTarget = prevItem && rows.get(prevItem.id)
      if (prevTarget) {
        const prevY = prevTarget.y - scroll.y
        if (prevY < 0) {
          scroll.scrollBy(prevY)
          return
        }
      }
    }

    if (y + target.height > scroll.height) {
      scroll.scrollBy(y + target.height - scroll.height)
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

    if (keybind.match("back", evt) && store.filter) {
      evt.preventDefault()
      setStore("filter", "")
      return
    }
    if (keybind.match("nav_up", evt)) {
      evt.preventDefault()
      move(-1)
      return
    }
    if (keybind.match("nav_down", evt)) {
      evt.preventDefault()
      move(1)
      return
    }
    if (keybind.match("nav_page_up", evt)) {
      evt.preventDefault()
      move(-10)
      return
    }
    if (keybind.match("nav_page_down", evt)) {
      evt.preventDefault()
      move(10)
      return
    }
    if (keybind.match("select", evt)) {
      const entry = selectedEntry()
      if (entry?.kind === "category") {
        evt.preventDefault()
        toggleCategory(entry.category, !collapsed(entry.category))
        return
      }
      const item = selected()
      if (item) {
        evt.preventDefault()
        props.onSelect?.(item)
      }
      return
    }
    if (props.onCategoryToggle && !store.filter.trim()) {
      if (keybind.match("nav_left", evt)) {
        const entry = selectedEntry()
        const category = entry?.kind === "category" ? entry.category : selected()?.categoryId ?? selected()?.category
        const index = indices().get(`category:${category}`)
        if (index !== undefined) moveTo(index)
        if (category) toggleCategory(category, true)
        evt.preventDefault()
        return
      }
      if (keybind.match("nav_right", evt)) {
        const entry = selectedEntry()
        if (entry?.kind === "category") toggleCategory(entry.category, false)
        evt.preventDefault()
        return
      }
    }
    if (keybind.match("filter", evt) && props.showFilter !== false) {
      evt.preventDefault()
      setStore("filterActive", true)
        setTimeout(() => {
          input?.focus()
          if (input && store.filter) {
            input.gotoBufferEnd()
          }
        }, 1)
      }
  })

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show when={props.title}>
        <box paddingLeft={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
        </box>
      </Show>

      <Show when={props.showFilter !== false}>
        <box flexDirection="column" flexShrink={0}>
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
                  input.gotoBufferEnd()
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
              if (keybind.match("select", evt)) {
                evt.preventDefault()
                setStore("filterActive", false)
                input?.blur()
              }
              if (keybind.match("back", evt)) {
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

      <Show when={grouped().size === 0}>
        <box paddingLeft={1} paddingTop={2} paddingBottom={2}>
          <text fg={theme.textMuted}>{props.emptyMessage ?? "No items found"}</text>
        </box>
      </Show>

      <Show when={grouped().size > 0}>
        <scrollbox
          scrollbarOptions={{ visible: false }}
          flexGrow={1}
          overflow="hidden"
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
        >
          <For each={categories()}>
              {(category, index) => {
                const items = () => grouped().get(category) ?? []
                const id = `category:${category}`
                const active = () => isSelected(id)
                return (
                <>
                  <Show when={items()[0]?.category}>
                    <box id={id} marginTop={index() > 0 ? 1 : 0} paddingLeft={1} paddingRight={1} flexDirection="row"
                      ref={(row) => {
                        rows.set(id, row)
                        onCleanup(() => rows.delete(id))
                      }}
                      backgroundColor={active() ? theme.primary : undefined}
                      onMouseMove={() => {
                        const index = indices().get(id)
                        if (index !== undefined && index !== store.selected) moveTo(index, config.data.mouseEdgeScroll)
                      }}
                      onMouseUp={() => {
                        if (renderer.getSelection()?.getSelectedText()) return
                        const index = indices().get(id)
                        if (index !== undefined) moveTo(index)
                        toggleCategory(category, !collapsed(category))
                      }}>
                      <text fg={active() ? theme.background : items()[0]?.favorite ? theme.warning : theme.accent} attributes={TextAttributes.BOLD} flexGrow={1}>
                        {props.onCategoryToggle ? `${collapsed(category) ? "▸" : "▾"} ` : ""}{items()[0]?.category}
                      </text>
                      <Show when={props.onCategoryToggle}><text fg={active() ? theme.background : theme.textMuted}>{items().length}</text></Show>
                    </box>
                  </Show>
                  <Show when={!collapsed(category)}>
                   <For each={items()}>
                   {(item, itemIndex) => {
                     const id = `item:${item.id}`
                     const active = () => isSelected(id)
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
                           ref={(row) => {
                             rows.set(id, row)
                             onCleanup(() => rows.delete(id))
                           }}
                          flexDirection="column"
                          onMouseUp={() => {
                            if (renderer.getSelection()?.getSelectedText()) return
                            if (!item.disabled) props.onSelect?.(item)
                          }}
                          onMouseMove={() => {
                             const idx = indices().get(id)
                             if (idx !== undefined && idx !== store.selected) moveTo(idx, config.data.mouseEdgeScroll)
                          }}
                           backgroundColor={active() ? theme.primary : transparent}
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
                  </Show>
                </>
                )
              }}
            </For>
        </scrollbox>
      </Show>

      <Show when={props.footer}>
        <box>{props.footer}</box>
      </Show>
    </box>
  )
}
