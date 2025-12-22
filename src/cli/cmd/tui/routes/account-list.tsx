import { Show, createMemo, createSignal } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useAWS } from "../context/aws"

import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"
import { Spinner } from "../ui/spinner"
import { useToast } from "../ui/toast"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useExit } from "../context/exit"
import { DialogSettings } from "../component/dialog-settings"
import type { Account } from "@/types"

export function AccountListScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("account-select")
  const aws = useAWS()
  const keybind = useKeybind()
  const command = useCommand()
  const toast = useToast()
  const dialog = useDialog()
  const exit = useExit()

  const [selectedAccount, setSelectedAccount] = createSignal<Account | null>(null)

  const session = createMemo(() => aws.sessions.find((s) => s.name === routeData.sessionName))

  command.register(() => [
    {
      id: "account.refresh",
      title: "Refresh Accounts",
      category: "Account",
      keybind: "refresh",
      onSelect: () => {
        handleRefresh()
      },
    },
    {
      id: "account.browser",
      title: "Open in Browser",
      category: "Account",
      keybind: "browser_open",
      disabled: !selectedAccount(),
      onSelect: () => {
        const account = selectedAccount()
        if (account) handleOpenInBrowser(account)
      },
    },
    {
      id: "account.roles",
      title: "View Roles",
      category: "Account",
      keybind: "role_list",
      disabled: !selectedAccount(),
      onSelect: () => {
        const account = selectedAccount()
        if (account) handleViewRoles(account)
      },
    },
    {
      id: "nav.back",
      title: "Back to Sessions",
      category: "Navigation",
      keybind: "back",
      onSelect: () => {
        route.navigate({ type: "sso-select" })
      },
    },
    {
      id: "settings",
      title: "Settings",
      category: "Application",
      keybind: "settings",
      onSelect: () => {
        dialog.replace(() => <DialogSettings />)
      },
    },
    {
      id: "app.quit",
      title: "Quit",
      category: "Application",
      keybind: "quit",
      onSelect: () => {
        exit()
      },
    },
  ])

  const items = (): FilterableListItem<Account>[] => {
    return aws.accounts.map((account) => {
      const roleName = account.roles[0] ?? "No roles"
      const region = account.region ?? session()?.defaultRegion ?? "us-east-1"
      return {
        id: account.accountId,
        title: account.name,
        subtitle: `${account.accountId} · ${roleName} · ${region}`,
        value: account,
        active: account.rolesLoaded,
      }
    })
  }

  const handleRefresh = async () => {
    const s = session()
    if (!s) return

    try {
      await aws.refreshAccounts()
      toast.show({
        variant: "success",
        message: "Accounts refreshed",
      })
    } catch (e) {
      toast.error(e)
    }
  }

  const handleOpenInBrowser = async (account: Account) => {
    const s = session()
    if (!s) return

    try {
      const roleName = account.roles[0]
      if (!roleName) {
        toast.show({
          variant: "error",
          message: "No role available for this account",
        })
        return
      }

      await aws.getRoleCredentials(s, account.accountId, account.name, roleName, account.region ?? s.defaultRegion)

      const region = account.region ?? s.defaultRegion
      const url = `https://${account.accountId}.signin.aws.amazon.com/console/home?region=${region}`

      const { openBrowser } = await import("@/util/browser")
      await openBrowser(url)

      toast.show({
        variant: "success",
        message: "Opening AWS Console in browser...",
      })
    } catch (e) {
      toast.error(e)
    }
  }

  const handleViewRoles = async (account: Account) => {
    const s = session()
    if (!s) return

    if (!account.rolesLoaded) {
      const roles = await aws.loadRoles(s, account.accountId)
      if (roles.length === 0) {
        toast.show({
          variant: "error",
          message: "No roles found for this account",
        })
        return
      }
    }

    dialog.replace(() => (
      <DialogSelect
        title="Select Role"
        options={account.roles.map((role) => ({
          title: role,
          value: role,
        }))}
        onSelect={(option) => {
          dialog.clear()
          handleAssumeRole(account, option.value)
        }}
      />
    ))
  }

  const handleAssumeRole = async (account: Account, roleName: string) => {
    const s = session()
    if (!s) return

    try {
      const expiration = await aws.getRoleCredentials(
        s,
        account.accountId,
        account.name,
        roleName,
        account.region ?? s.defaultRegion
      )

      route.navigate({
        type: "success",
        sessionName: routeData.sessionName, // SSO session name
        profileName: `${account.name}-${roleName}`, // This is the CLI profile name
        accountName: account.name,
        accountId: account.accountId,
        roleName,
        region: account.region ?? s.defaultRegion,
        expiration: expiration.toISOString(),
      })
    } catch (e) {
      toast.error(e)
    }
  }

  const handleSelect = async (item: FilterableListItem<Account>) => {
    const account = item.value
    const s = session()
    if (!s) return

    if (account.roles.length > 0) {
      await handleAssumeRole(account, account.roles[0])
    } else {
      await handleViewRoles(account)
    }
  }

  const handleItemMove = (item: FilterableListItem<Account>) => {
    setSelectedAccount(item.value)
  }

  return (
    <Layout
      header={
        <Header
          title={`Accounts - ${routeData.sessionName}`}
          subtitle={`${aws.accounts.length} accounts`}
          right={
            <Show when={aws.refreshing}>
              <Spinner />
            </Show>
          }
        />
      }
      footer={
        <Footer
          right={<KeybindHint keybind={keybind.print("command_list")} label="More" />}
        >
          <KeybindHint keybind={keybind.print("select")} label="Select" />
          <KeybindHint keybind={keybind.print("role_list")} label="Roles" />
          <KeybindHint keybind={keybind.print("back")} label="Back" />
        </Footer>
      }
    >
      <FilterableList
        items={items()}
        onSelect={handleSelect}
        onMove={handleItemMove}
        emptyMessage="No accounts found"
      />

      <Show when={aws.error}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={theme.error}>{aws.error}</text>
        </box>
      </Show>
    </Layout>
  )
}
