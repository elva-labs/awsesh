import { useKeyboard } from "@opentui/solid"
import { useApp } from "../../context/app"
import { Header } from "../ui/header"

export function Home() {
  const app = useApp()

  useKeyboard((key) => {
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const char = key.sequence.toLowerCase()
      if (char === "n") {
        app.setView({ type: "profile-create" })
      } else if (char === "l") {
        app.setView({ type: "profile-list" })
      } else if (char === "q") {
        app.exit()
      }
    } else if (key.name === "escape") {
      app.exit()
    }
  })

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header 
        title="AWS Session Manager" 
        subtitle="Manage AWS SSO sessions and profiles"
      />

      <box width="100%" height="100%" flexDirection="column" padding={2}>
        <box width="100%" flexDirection="column">
          <text fg="cyan"><b>Quick Actions</b></text>
          
          <box width="100%" marginTop={1} flexDirection="column">
            <box padding={1} style={{ borderStyle: "single", borderColor: "cyan" }}>
              <text>[N] Create New Profile</text>
            </box>
            
            <box padding={1} style={{ borderStyle: "single", borderColor: "cyan" }}>
              <text>[L] List & Select Profile</text>
            </box>
            
            <box padding={1} style={{ borderStyle: "single", borderColor: "gray" }}>
              <text>[Q] Quit</text>
            </box>
          </box>
        </box>

        <box width="100%" marginTop={2}>
          <text fg="gray">
            {app.state.profiles.length} profile{app.state.profiles.length !== 1 ? "s" : ""} configured
          </text>
        </box>
      </box>

      <box width="100%" padding={1} style={{ borderStyle: "single", borderColor: "gray" }}>
        <text fg="gray">Press a key or Esc to quit</text>
      </box>
    </box>
  )
}
