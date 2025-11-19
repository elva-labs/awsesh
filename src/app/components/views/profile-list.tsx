import { createMemo } from "solid-js"
import { useApp } from "../../context/app"
import { Header } from "../ui/header"
import { List } from "../ui/list"
import { ConfigManager } from "@/config/manager"
import { AWSClient } from "@/aws/client"

export function ProfileList() {
  const app = useApp()

  const items = createMemo(() => 
    app.state.profiles.map(profile => ({
      label: profile.name,
      description: `${profile.startUrl} (${profile.ssoRegion})`,
      value: profile,
    }))
  )

  const handleSelect = async (item: any) => {
    const profile = item.value
    
    app.setLoading(true)
    try {
      const token = await ConfigManager.loadToken(profile.startUrl)
      
      if (token) {
        app.setView({
          type: "account-list",
          profile,
          token: token.token,
        })
      } else {
        app.setView({
          type: "sso-login",
          profile,
        })
      }
    } catch (err) {
      app.setError(err instanceof Error ? err.message : "Failed to load token")
    } finally {
      app.setLoading(false)
    }
  }

  const handleCancel = () => {
    app.setView({ type: "home" })
  }

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header 
        title="Select Profile" 
        subtitle="Choose an SSO profile to authenticate"
      />

      <box width="100%" height="100%">
        <List 
          items={items()}
          onSelect={handleSelect}
          onCancel={handleCancel}
          emptyMessage="No profiles found. Press Esc to go back and create one."
        />
      </box>
    </box>
  )
}
