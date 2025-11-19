import { Show, type JSX } from "solid-js"
import { useTheme } from "../context/theme"
import { TextAttributes, RGBA } from "@opentui/core"
import { Locale } from "../util/locale"

export interface ListItemProps {
  title: string
  description?: string
  footer?: string | JSX.Element
  active?: boolean
  current?: boolean
  disabled?: boolean
  onSelect?: () => void
  maxWidth?: number
}

export function ListItem(props: ListItemProps) {
  const { theme } = useTheme()

  return (
    <box
      flexDirection="row"
      onMouseUp={() => {
        if (!props.disabled) props.onSelect?.()
      }}
      backgroundColor={props.active ? theme.primary : RGBA.fromInts(0, 0, 0, 0)}
      paddingLeft={1}
      paddingRight={1}
      gap={1}
    >
      <Show when={props.current}>
        <text
          flexShrink={0}
          fg={props.active ? theme.background : theme.primary}
          marginRight={0.5}
        >
          ●
        </text>
      </Show>
      <text
        flexGrow={1}
        fg={props.active ? theme.background : props.current ? theme.primary : theme.text}
        attributes={props.active ? TextAttributes.BOLD : undefined}
        overflow="hidden"
        wrapMode="none"
      >
        {Locale.truncate(props.title, props.maxWidth ?? 62)}
        <Show when={props.description}>
          <span style={{ fg: props.active ? theme.background : theme.textMuted }}>
            {" "}
            {props.description}
          </span>
        </Show>
      </text>
      <Show when={props.footer}>
        <box flexShrink={0}>
          <text fg={props.active ? theme.background : theme.textMuted}>{props.footer}</text>
        </box>
      </Show>
    </box>
  )
}
