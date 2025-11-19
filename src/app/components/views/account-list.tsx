import { createSignal, onMount } from "solid-js"
import { useApp } from "../../context/app"
import { Header } from "../ui/header"
import { List } from "../ui/list"
import { Spinner } from "../ui/spinner"
import { AWSClient } from "@/aws/client"
import { ConfigManager } from "@/config/manager"
import type { SSOProfile, Account } from "@/types"

interface AccountListProps {
  profile: SSOProfile
  token: string
}

export function AccountList(props: AccountListProps) {
  const app = useApp()
  const [accounts, setAccounts] = createSignal<Account[]>([])
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    try {
      const cached = await ConfigManager.loadAccounts(props.profile.name)
      
      if (cached && !cached.isStale) {
        setAccounts(cached.accounts)
        setLoading(false)
      } else {
        const client = new AWSClient(props.profile.ssoRegion)
        const freshAccounts = await client.listAccounts(props.token)
        setAccounts(freshAccounts)
        await ConfigManager.saveAccounts(props.profile.name, freshAccounts)
        setLoading(false)
      }
    } catch (err) {
      app.setError(err instanceof Error ? err.message : "Failed to load accounts")
      app.setView({ type: "home" })
    }
  })

  const items = () => 
    accounts().map(account => ({
      label: account.name,
      description: account.accountId,
      value: account,
    }))

  const handleSelect = (item: any) => {
    const account = item.value
    app.setView({
      type: "role-list",
      profile: props.profile,
      token: props.token,
      account,
    })
  }

  const handleCancel = () => {
    app.setView({ type: "home" })
  }

  if (loading()) {
    return (
      <box width="100%" height="100%" flexDirection="column">
        <Header 
          title="Loading Accounts" 
          subtitle={props.profile.name}
        />
        <box width="100%" height="100%">
          <Spinner text="Loading accounts..." />
        </box>
      </box>
    )
  }

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header 
        title="Select Account" 
        subtitle={props.profile.name}
      />

      <box width="100%" height="100%">
        <List 
          items={items()}
          onSelect={handleSelect}
          onCancel={handleCancel}
          emptyMessage="No accounts found"
        />
      </box>
    </box>
  )
}
