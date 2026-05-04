import { InputRenderable, RGBA, ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useConfig } from "../context/config"
import { entries, filter, flatMap, groupBy, pipe } from "remeda"
import { batch, createEffect, createMemo, For, onMount, Show, type JSX, on } from "solid-js"
import { createStore } from "solid-js/store"
import { useKeyboard, useTerminalDimensions, useRenderer } from "@opentui/solid"
import * as fuzzysort from "fuzzysort"
import { isDeepEqual } from "remeda"
import { useDialog, type DialogContext } from "./dialog"
import { Locale } from "../util/locale"

export interface DialogSelectProps<T> {
  title: string
  placeholder?: string
  options: DialogSelectOption<T>[]
  ref?: (ref: DialogSelectRef<T>) => void
  onMove?: (option: DialogSelectOption<T>) => void
  onFilter?: (query: string) => void
  onSelect?: (option: DialogSelectOption<T>) => void
  current?: T
}

export interface DialogSelectOption<T = any> {
  title: string
  value: T
  description?: string
  footer?: JSX.Element | string
  category?: string
  disabled?: boolean
  bg?: RGBA
  gutter?: JSX.Element
  onSelect?: (ctx: DialogContext) => void
}

export type DialogSelectRef<T> = {
  filter: string
  filtered: DialogSelectOption<T>[]
}

function selectedForeground(theme: ReturnType<typeof useTheme>["theme"]): RGBA {
  const { r, g, b } = theme.primary
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 0.5 ? RGBA.fromInts(0, 0, 0) : RGBA.fromInts(255, 255, 255)
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const config = useConfig()
  const renderer = useRenderer()
  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
  })

  createEffect(
    on(
      () => props.current,
      (current) => {
        if (current) {
          const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, current))
          if (currentIndex >= 0) {
            setStore("selected", currentIndex)
          }
        }
      }
    )
  )

  let input: InputRenderable

  const filtered = createMemo(() => {
    const needle = store.filter.toLowerCase()
    const result = pipe(
      props.options,
      filter((x) => x.disabled !== true),
      (x) => (!needle ? x : fuzzysort.go(needle.replace(/\s+/g, ""), x, { keys: ["title", "category"].map(k => (item: DialogSelectOption<T>) => (item[k as keyof DialogSelectOption<T>] ?? "").toString().toLowerCase().replace(/\s+/g, "")) }).map((x) => x.obj))
    )
    return result
  })

  const grouped = createMemo(() => {
    const result = pipe(
      filtered(),
      groupBy((x) => x.category ?? ""),
      entries()
    )
    return result
  })

  const flat = createMemo(() => {
    return pipe(
      grouped(),
      flatMap(([_, options]) => options)
    )
  })

  const dimensions = useTerminalDimensions()
  const height = createMemo(() =>
    Math.max(5, Math.min(flat().length + grouped().length * 2 - 1, Math.floor(dimensions().height * 0.6) - 6))
  )

  const selected = createMemo(() => flat()[store.selected])

  createEffect(
    on([() => store.filter, () => props.current], ([filter, current]) => {
      if (filter.length > 0) {
        setStore("selected", 0)
      } else if (current) {
        const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, current))
        if (currentIndex >= 0) {
          setStore("selected", currentIndex)
        }
      }
      scroll.scrollTo(0)
    })
  )

  function move(direction: number) {
    let next = store.selected + direction
    if (next < 0) next = flat().length - 1
    if (next >= flat().length) next = 0
    moveTo(next)
  }

  function moveTo(next: number, skipContextScroll?: boolean) {
    setStore("selected", next)
    const sel = selected()
    if (sel) props.onMove?.(sel)

    const children = scroll.getChildren()
    const target = children.find((child) => child.id === JSON.stringify(selected()?.value))
    if (!target) return

    const y = target.y - scroll.y

    if (!skipContextScroll) {
      const nextItem = flat()[next + 1]
      const nextTarget = nextItem ? children.find((child) => child.id === JSON.stringify(nextItem.value)) : null
      if (nextTarget) {
        const nextY = nextTarget.y - scroll.y
        if (nextY + nextTarget.height > scroll.height) {
          scroll.scrollBy(nextY + nextTarget.height - scroll.height)
        }
      } else if (y + target.height > scroll.height) {
        scroll.scrollBy(y + target.height - scroll.height)
      }

      const prevItem = flat()[next - 1]
      const prevTarget = prevItem ? children.find((child) => child.id === JSON.stringify(prevItem.value)) : null
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
    } else {
      if (y + target.height > scroll.height) {
        scroll.scrollBy(y + target.height - scroll.height)
      } else if (y < 0) {
        scroll.scrollBy(y)
        if (next === 0) {
          scroll.scrollTo(0)
        }
      }
    }
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

  let scroll: ScrollBoxRenderable
  const ref: DialogSelectRef<T> = {
    get filter() {
      return store.filter
    },
    get filtered() {
      return filtered()
    },
  }
  props.ref?.(ref)

  onMount(() => {
    if (props.current) {
      const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, props.current))
      if (currentIndex >= 0) {
        setStore("selected", currentIndex)
        setTimeout(() => {
          const target = scroll.getChildren().find((child) => {
            return child.id === JSON.stringify(props.current)
          })
          if (target) {
            const y = target.y - scroll.y
            if (y >= scroll.height || y < 0) {
              scroll.scrollTo(Math.max(0, target.y - scroll.height / 2))
            }
          }
        }, 10)
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
                props.onFilter?.(e)
              })
            }}
            focusedBackgroundColor={theme.background}
            cursorColor={theme.primary}
            focusedTextColor={theme.textMuted}
            ref={(r) => {
              input = r
              setTimeout(() => input.focus(), 1)
            }}
            placeholder={props.placeholder ?? "Search"}
          />
        </box>
      </box>
      <scrollbox
        paddingLeft={2}
        paddingRight={2}
        scrollbarOptions={{ visible: false }}
        ref={(r: ScrollBoxRenderable) => { scroll = r }}
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
                  const active = createMemo(() => isDeepEqual(option.value, selected()?.value))
                  const current = createMemo(() => isDeepEqual(option.value, props.current))
                  return (
                    <box
                      id={JSON.stringify(option.value)}
                      flexDirection="row"
                      onMouseUp={() => {
                        if (renderer.getSelection()?.getSelectedText()) return
                        option.onSelect?.(dialog)
                        props.onSelect?.(option)
                      }}
                      onMouseOver={() => {
                        const index = filtered().findIndex((x) => isDeepEqual(x.value, option.value))
                        if (index === -1) return
                        moveTo(index, !config.data.mouseEdgeScroll)
                      }}
                      backgroundColor={active() ? (option.bg ?? theme.primary) : RGBA.fromInts(0, 0, 0, 0)}
                      paddingLeft={1}
                      paddingRight={1}
                      gap={1}
                    >
                      <Option
                        title={option.title}
                        footer={option.footer}
                        description={option.description !== category ? option.description : undefined}
                        active={active()}
                        current={current()}
                        gutter={option.gutter}
                        showCurrentMarker={props.current !== undefined}
                      />
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

function Option(props: {
  title: string
  description?: string
  active?: boolean
  current?: boolean
  footer?: JSX.Element | string
  gutter?: JSX.Element
  showCurrentMarker?: boolean
}) {
  const { theme } = useTheme()
  const fg = selectedForeground(theme)

  return (
    <>
      <Show when={props.current}>
        <text flexShrink={0} fg={props.active ? fg : theme.primary} marginRight={0.5}>
          ●
        </text>
      </Show>
      <Show when={!props.current && props.gutter}>
        <box flexShrink={0} marginRight={0.5}>
          {props.gutter}
        </box>
      </Show>
      <Show when={!props.current && !props.gutter && props.showCurrentMarker}>
        <text flexShrink={0} marginRight={0.5}>
          {" "}
        </text>
      </Show>
      <text
        flexGrow={1}
        fg={props.active ? fg : props.current ? theme.primary : theme.text}
        attributes={props.active ? TextAttributes.BOLD : undefined}
        overflow="hidden"
      >
        {Locale.truncate(props.title, 61)}
        <Show when={props.description}>
          <span style={{ fg: props.active ? fg : theme.textMuted }}> {props.description}</span>
        </Show>
      </text>
      <Show when={props.footer}>
        <box flexShrink={0}>
          <text fg={props.active ? fg : theme.textMuted}>{props.footer}</text>
        </box>
      </Show>
    </>
  )
}
