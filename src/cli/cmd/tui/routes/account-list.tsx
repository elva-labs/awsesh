import { Show, createMemo } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useAWS } from "../context/aws"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "../context/keybind"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import { TextAttributes } from "@opentui/core"
import { Spinner } from "../ui/spinner"
import { useToast } from "../ui/toast"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import type { Account } from "@/types"

export function AccountListScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("account-select")
  const aws = useAWS()
  const keybind = useKeybind()
  const toast = useToast()
  const dialog = useDialog()

  const profile = createMemo(() => aws.profiles.find((p) => p.name === routeData.profileName))

  const items = (): FilterableListItem<Account>[] => {
    return aws.accounts.map((account) => ({
      id: account.accountId,
      title: `${account.name} (${account.accountId})`,
      value: account,
      description: `Role: ${account.roles[0] ?? "Loading..."} │ Region: ${account.region ?? profile()?.defaultRegion ?? "us-east-1"}`,
    }))
  }

  const handleRefresh = async () => {
    const p = profile()
    if (!p) return
    
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
    const p = profile()
    if (!p) return

    try {
      const { openInBrowser } = await import("@/util/browser")
      // TODO: Generate console URL with role credentials
      toast.show({
        variant: "info",
        message: "Opening in browser...",
      })
    } catch (e) {
      toast.error(e)
    }
  }

  const handleSetRegion = (account: Account) => {
    route.navigate({
      type: "region-select",
      profileName: routeData.profileName,
      accountId: account.accountId,
      accountName: account.name,
    })
  }

  const handleSetProfile = (account: Account) => {
    route.navigate({
      type: "profile-name-input",
      profileName: routeData.profileName,
      accountId: account.accountId,
      accountName: account.name,
      roleName: account.roles[0] ?? "",
    })
  }

  const handleViewRoles = async (account: Account) => {
    const p = profile()
    if (!p) return

    // Load roles if not loaded
    if (!account.rolesLoaded) {
      const roles = await aws.loadRoles(p, account.accountId)
      if (roles.length === 0) {
        toast.show({
          variant: "error",
          message: "No roles found for this account",
        })
        return
      }
    }

    // Show role selection dialog
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
    const p = profile()
    if (!p) return

    try {
      // Get credentials for the role
      const credentials = await aws.getRoleCredentials(
        p,
        account.accountId,
        roleName
      )

      // Navigate to success screen
      route.navigate({
        type: "success",
        profileName: routeData.profileName,
        accountName: account.name,
        accountId: account.accountId,
        roleName,
        region: account.region ?? p.defaultRegion,
        expiration: credentials.expiration.toISOString(),
      })
    } catch (e) {
      toast.error(e)
    }
  }

  const handleSelect = async (item: FilterableListItem<Account>) => {
    const account = item.value
    const p = profile()
    if (!p) return

    // If account has roles loaded and has a default role, assume it
    if (account.roles.length > 0) {
      await handleAssumeRole(account, account.roles[0])
    } else {
      // Load and show roles
      await handleViewRoles(account)
    }
  }

  useKeyboard((evt) => {
    if (keybind.match("back", evt)) {
      evt.preventDefault()
      route.navigate({ type: "sso-select" })
    }

    if (keybind.match("refresh", evt)) {
      evt.preventDefault()
      handleRefresh()
    }

    // TODO: Add other keybind handlers (o, p, r, l)
  })

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box paddingLeft={1} paddingTop={1} paddingBottom={1} flexDirection="row" gap={1} alignItems="center">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Accounts - {routeData.profileName}
        </text>
        <Show when={aws.refreshing}>
          <Spinner />
        </Show>
      </box>

      <FilterableList
        items={items()}
        onSelect={handleSelect}
        filterPlaceholder="Type / to filter accounts..."
        emptyMessage="No accounts found"
        footer={
          <box paddingLeft={1} paddingBottom={1} flexDirection="column" gap={0.5}>
            <box flexDirection="row" gap={2}>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("filter")}
                </span>
                <span style={{ fg: theme.textMuted }}> Filter</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("browser_open")}
                </span>
                <span style={{ fg: theme.textMuted }}> Browser</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("profile_set")}
                </span>
                <span style={{ fg: theme.textMuted }}> Profile</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("region_set")}
                </span>
                <span style={{ fg: theme.textMuted }}> Region</span>
              </text>
            </box>
            <box flexDirection="row" gap={2}>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("refresh")}
                </span>
                <span style={{ fg: theme.textMuted }}> Refresh</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("role_list")}
                </span>
                <span style={{ fg: theme.textMuted }}> Roles</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("select")}
                </span>
                <span style={{ fg: theme.textMuted }}> Select</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("quit")}
                </span>
                <span style={{ fg: theme.textMuted }}> Exit</span>
              </text>
            </box>
          </box>
        }
      />

      <Show when={aws.error}>
        <box paddingLeft={1} paddingTop={1}>
          <text fg={theme.error}>{aws.error}</text>
        </box>
      </Show>
    </box>
  )
}
