import { useKeyboard } from "@opentui/solid"
import { useApp } from "../../context/app"
import { Header } from "../ui/header"

interface SuccessProps {
  profileName: string
  accountName: string
  roleName: string
}

export function Success(props: SuccessProps) {
  const app = useApp()

  useKeyboard((key) => {
    if (key.name === "return" || key.name === "enter" || key.name === "escape") {
      app.exit()
    } else if (key.sequence && key.sequence.toLowerCase() === "q") {
      app.exit()
    }
  })

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header 
        title="Success" 
        subtitle="Credentials written to AWS credentials file"
      />

      <box width="100%" height="100%" flexDirection="column" justifyContent="center" alignItems="center">
        <box padding={2} style={{ borderStyle: "double", borderColor: "green" }}>
          <text fg="green"><b>✓ Credentials Configured</b></text>
        </box>

        <box width="100%" marginTop={2} flexDirection="column" alignItems="center">
          <box width="100%" flexDirection="column" alignItems="center">
            <text fg="gray">Profile Name</text>
            <text fg="cyan"><b>{props.profileName}</b></text>
          </box>

          <box width="100%" marginTop={1} flexDirection="column" alignItems="center">
            <text fg="gray">Account</text>
            <text><b>{props.accountName}</b></text>
          </box>

          <box width="100%" marginTop={1} flexDirection="column" alignItems="center">
            <text fg="gray">Role</text>
            <text><b>{props.roleName}</b></text>
          </box>
        </box>

        <box width="100%" marginTop={2} padding={2} style={{ borderStyle: "single", borderColor: "cyan" }}>
          <box flexDirection="column">
            <text fg="cyan"><b>Usage Examples</b></text>
            <text fg="gray">aws --profile {props.profileName} s3 ls</text>
            <text fg="gray">export AWS_PROFILE={props.profileName}</text>
          </box>
        </box>
      </box>

      <box width="100%" padding={1} style={{ borderStyle: "single", borderColor: "gray" }}>
        <text fg="gray">Press any key to exit</text>
      </box>
    </box>
  )
}
