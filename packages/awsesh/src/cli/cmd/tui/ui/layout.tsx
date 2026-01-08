import { TextAttributes } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, Show, type JSX, type ParentProps } from "solid-js"
import { useTheme } from "../context/theme"
import { useCredentials } from "../context/credentials"
import { useConfig } from "../context/config"
import { DateUtil } from "@/util/date"
import { Installation } from "@/installation"

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

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
  showVersion?: boolean
}

export function Header(props: HeaderProps) {
  const { theme } = useTheme()
  const showVersion = createMemo(() => props.showVersion ?? true)

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
      <box flexDirection="row" gap={2} alignItems="center">
        <Show when={props.right}>
          {props.right}
        </Show>
        <Show when={showVersion()}>
          <text fg={theme.textMuted}>{Installation.VERSION}</text>
        </Show>
      </box>
    </box>
  )
}

export interface FooterProps {
  left?: JSX.Element
  right?: JSX.Element
}

export function Footer(props: ParentProps<FooterProps>) {
  const { theme } = useTheme()
  const credentials = useCredentials()
  const config = useConfig()

  return (
    <box flexDirection="column">
      <box
        paddingLeft={1}
        paddingRight={1}
        borderStyle="single"
        borderColor={theme.border}
        border={["top", "bottom"]}
        flexDirection="row"
        justifyContent="space-between"
      >
        <Show
          when={credentials.active}
          fallback={
            <box>
              <text fg={theme.textMuted}>No active credentials</text>
            </box>
          }
        >
          {(active) => (
            <>
              <box flexDirection="row" gap={2}>
                <text>
                  <span style={{ fg: theme.textMuted }}>SSO </span>
                  <span style={{ fg: theme.text }}>{truncate(active().sessionName, 20)}</span>
                </text>
                <text>
                  <span style={{ fg: theme.textMuted }}>Account </span>
                  <span style={{ fg: theme.text }}>{truncate(active().accountName, 24)}</span>
                </text>
                <text>
                  <span style={{ fg: theme.textMuted }}>Profile </span>
                  <span style={{ fg: theme.text }}>{truncate(active().profileName, 20)}</span>
                </text>
              </box>
              <box>
                <text>
                  <span style={{ fg: theme.textMuted }}>Expires </span>
                  <span style={{ fg: theme.text }}>
                    {DateUtil.formatTime(active().expiration, config.data.timeFormat)}
                  </span>
                </text>
              </box>
            </>
          )}
        </Show>
      </box>
      <box
        paddingLeft={1}
        paddingRight={1}
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
    </box>
  )
}

export interface KeybindHintProps {
  keybind: string
  label: string
  onClick?: () => void
}

export function KeybindHint(props: KeybindHintProps) {
  const { theme } = useTheme()
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)
  const clickable = () => !!props.onClick

  return (
    <box
      onMouseOver={() => clickable() && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseUp={() => {
        if (!clickable()) return
        if (renderer.getSelection()?.getSelectedText()) return
        props.onClick?.()
      }}
      backgroundColor={hover() ? theme.accent : undefined}
    >
      <text>
        <span style={{ fg: hover() ? theme.background : theme.text, attributes: TextAttributes.BOLD }}>
          {props.keybind}
        </span>
        <span style={{ fg: hover() ? theme.background : theme.textMuted }}>
          {" "}{props.label}
        </span>
      </text>
    </box>
  )
}
