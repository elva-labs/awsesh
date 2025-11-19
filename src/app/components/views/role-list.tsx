import { createSignal, onMount } from "solid-js"
import { useApp } from "../../context/app"
import { Header } from "../ui/header"
import { List } from "../ui/list"
import { Spinner } from "../ui/spinner"
import { AWSClient } from "@/aws/client"
import { ConfigManager } from "@/config/manager"
import type { SSOProfile, Account } from "@/types"

interface RoleListProps {
  profile: SSOProfile
  token: string
  account: Account
}

export function RoleList(props: RoleListProps) {
  const app = useApp()
  const [roles, setRoles] = createSignal<string[]>([])
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    try {
      const client = new AWSClient(props.profile.ssoRegion)
      const accountRoles = await client.listAccountRoles(props.token, props.account.accountId)
      setRoles(accountRoles)
      setLoading(false)
    } catch (err) {
      app.setError(err instanceof Error ? err.message : "Failed to load roles")
      app.setView({ type: "account-list", profile: props.profile, token: props.token })
    }
  })

  const items = () => 
    roles().map(role => ({
      label: role,
      description: undefined,
      value: role,
    }))

  const handleSelect = async (item: any) => {
    const roleName = item.value
    
    app.setLoading(true)
    try {
      const client = new AWSClient(props.profile.ssoRegion)
      const credentials = await client.getRoleCredentials(
        props.token,
        props.account.accountId,
        roleName
      )
      
      const savedProfileName = await ConfigManager.loadProfileName(
        props.profile.name,
        props.account.name,
        roleName
      )
      
      const profileName = savedProfileName || `${props.profile.name}-${props.account.name}-${roleName}`
      
      await ConfigManager.writeCredentials(
        profileName,
        credentials.accessKeyId,
        credentials.secretAccessKey,
        credentials.sessionToken,
        props.profile.defaultRegion
      )
      
      await ConfigManager.saveProfileName(
        props.profile.name,
        props.account.name,
        roleName,
        profileName
      )
      
      await ConfigManager.saveLastSelected({
        profile: props.profile.name,
        account: props.account.accountId,
        role: roleName,
      })
      
      app.setView({
        type: "success",
        profileName,
        accountName: props.account.name,
        roleName,
      })
    } catch (err) {
      app.setError(err instanceof Error ? err.message : "Failed to get credentials")
    } finally {
      app.setLoading(false)
    }
  }

  const handleCancel = () => {
    app.setView({ type: "account-list", profile: props.profile, token: props.token })
  }

  if (loading()) {
    return (
      <box width="100%" height="100%" flexDirection="column">
        <Header 
          title="Loading Roles" 
          subtitle={`${props.profile.name} / ${props.account.name}`}
        />
        <box width="100%" height="100%">
          <Spinner text="Loading roles..." />
        </box>
      </box>
    )
  }

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header 
        title="Select Role" 
        subtitle={`${props.profile.name} / ${props.account.name}`}
      />

      <box width="100%" height="100%">
        <List 
          items={items()}
          onSelect={handleSelect}
          onCancel={handleCancel}
          emptyMessage="No roles found"
        />
      </box>
    </box>
  )
}
