import { type ParentProps } from "solid-js"

interface HeaderProps extends ParentProps {
  title: string
  subtitle?: string
}

export function Header(props: HeaderProps) {
  return (
    <box width="100%" flexDirection="column" padding={1} style={{ borderStyle: "single", borderColor: "cyan" }}>
      <text fg="cyan"><b>{props.title}</b></text>
      {props.subtitle && (
        <text fg="gray">{props.subtitle}</text>
      )}
    </box>
  )
}
