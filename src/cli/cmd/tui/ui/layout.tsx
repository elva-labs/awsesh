import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, Show, type JSX, type ParentProps } from "solid-js"
import { useTheme } from "../context/theme"

export interface LayoutProps {
  header?: JSX.Element
  footer?: JSX.Element
  sidebar?: JSX.Element
  sidebarWidth?: number
  showSidebar?: boolean
}

export function Layout(props: ParentProps<LayoutProps>) {
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  const sidebarWidth = createMemo(() => props.sidebarWidth ?? 40)
  const showSidebar = createMemo(() => props.showSidebar ?? false)
  const contentWidth = createMemo(() => dimensions().width - (showSidebar() ? sidebarWidth() : 0))

  return (
    <box flexDirection="row" width="100%" height="100%">
      <box flexDirection="column" width={contentWidth()} height="100%">
        <Show when={props.header}>
          <box flexShrink={0}>{props.header}</box>
        </Show>

        <box flexGrow={1} flexDirection="column" overflow="hidden">
          {props.children}
        </box>

        <Show when={props.footer}>
          <box flexShrink={0}>{props.footer}</box>
        </Show>
      </box>

      <Show when={showSidebar() && props.sidebar}>
        <box
          width={sidebarWidth()}
          height="100%"
          borderStyle="single"
          borderColor={theme.border}
          border={["left"]}
        >
          {props.sidebar}
        </box>
      </Show>
    </box>
  )
}

export interface HeaderProps {
  title: string
  subtitle?: string
  right?: JSX.Element
}

export function Header(props: HeaderProps) {
  const { theme } = useTheme()

  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      marginTop={1}
      borderStyle="single"
      borderColor={theme.border}
      border={["bottom"]}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {props.title}
        </text>
        <Show when={props.subtitle}>
          <text fg={theme.textMuted}>{props.subtitle}</text>
        </Show>
      </box>
      <Show when={props.right}>
        <box>{props.right}</box>
      </Show>
    </box>
  )
}

export interface FooterProps {
  left?: JSX.Element
  right?: JSX.Element
}

export function Footer(props: ParentProps<FooterProps>) {
  const { theme } = useTheme()

  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      borderStyle="single"
      borderColor={theme.border}
      border={["top"]}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
    >
      <box flexDirection="row" gap={2}>
        {props.left ?? props.children}
      </box>
      <Show when={props.right}>
        <box flexDirection="row" gap={2}>
          {props.right}
        </box>
      </Show>
    </box>
  )
}

export interface KeybindHintProps {
  keybind: string
  label: string
}

export function KeybindHint(props: KeybindHintProps) {
  const { theme } = useTheme()

  return (
    <text>
      <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>{props.keybind}</span>
      <span style={{ fg: theme.textMuted }}> {props.label}</span>
    </text>
  )
}
