import { useApp } from "../../context/app"
import { Header } from "../ui/header"
import type { SSOProfile } from "@/types"

interface ProfileEditProps {
  profile: SSOProfile
}

export function ProfileEdit(props: ProfileEditProps) {
  const app = useApp()

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header 
        title="Edit Profile" 
        subtitle={props.profile.name}
      />

      <box width="100%" height="100%" justifyContent="center" alignItems="center">
        <text fg="gray">Profile editing coming soon...</text>
      </box>

      <box width="100%" padding={1} style={{ borderStyle: "single", borderColor: "gray" }}>
        <text fg="gray">Esc Back</text>
      </box>
    </box>
  )
}
