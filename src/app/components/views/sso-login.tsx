import { createSignal, onMount, onCleanup } from "solid-js"
import { useApp } from "../../context/app"
import { Header } from "../ui/header"
import { Spinner } from "../ui/spinner"
import { AWSClient } from "@/aws/client"
import { ConfigManager } from "@/config/manager"
import type { SSOProfile, SSOLoginInfo } from "@/types"
import { openBrowser } from "@/util/browser"

interface SSOLoginProps {
  profile: SSOProfile
}

export function SSOLogin(props: SSOLoginProps) {
  const app = useApp()
  const [loginInfo, setLoginInfo] = createSignal<SSOLoginInfo | null>(null)
  const [status, setStatus] = createSignal("Initializing SSO login...")

  let pollInterval: Timer | null = null

  onMount(async () => {
    try {
      const client = new AWSClient(props.profile.ssoRegion)
      const info = await client.startSSOLogin(props.profile.startUrl)
      setLoginInfo(info)
      setStatus("Opening browser...")

      await openBrowser(info.verificationUriComplete)
      setStatus("Waiting for authorization...")

      pollInterval = setInterval(async () => {
        try {
          const token = await client.pollForToken(info)
          if (token) {
            if (pollInterval) clearInterval(pollInterval)
            setStatus("Authorization successful!")
            
            await ConfigManager.saveToken(props.profile.startUrl, token, info.expiresAt)
            
            app.setView({
              type: "account-list",
              profile: props.profile,
              token,
            })
          }
        } catch (err) {
          if (pollInterval) clearInterval(pollInterval)
          app.setError(err instanceof Error ? err.message : "Failed to authorize")
          app.setView({ type: "home" })
        }
      }, info.interval * 1000)
    } catch (err) {
      app.setError(err instanceof Error ? err.message : "Failed to start SSO login")
      app.setView({ type: "home" })
    }
  })

  onCleanup(() => {
    if (pollInterval) clearInterval(pollInterval)
  })

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header 
        title="SSO Login" 
        subtitle={props.profile.name}
      />

      <box width="100%" height="100%" flexDirection="column" justifyContent="center" alignItems="center">
        <Spinner text={status()} />
        
        {loginInfo() && (
          <box width="100%" marginTop={2} flexDirection="column" alignItems="center">
            <box padding={2} style={{ borderStyle: "double", borderColor: "cyan" }}>
              <box flexDirection="column">
                <text fg="cyan"><b>Verification Code</b></text>
                <text><b>{loginInfo()!.userCode}</b></text>
              </box>
            </box>
            
            <box width="100%" marginTop={2}>
              <text fg="gray">Complete authorization in your browser</text>
            </box>
          </box>
        )}
      </box>

      <box width="100%" padding={1} style={{ borderStyle: "single", borderColor: "gray" }}>
        <text fg="gray">Waiting for authorization...</text>
      </box>
    </box>
  )
}
