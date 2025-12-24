import { Show, createMemo, createSignal, createEffect } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useAWS } from "../context/aws"
import { useAwsesh } from "../context/awsesh"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useCredentials } from "../context/credentials"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"
import { Spinner } from "../ui/spinner"
import { useToast } from "../ui/toast"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"
import { useExit } from "../context/exit"
import { DialogSettings } from "../component/dialog-settings"
import type { Account } from "@awsesh/core"

export function AccountListScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("account-select")
  const aws = useAWS()
  const awsesh = useAwsesh()
  const keybind = useKeybind()
  const command = useCommand()
  const credentials = useCredentials()
  const toast = useToast()
  const dialog = useDialog()
  const exit = useExit()

  const [selectedAccount, setSelectedAccount] = createSignal<Account | null>(null)
  const [preferredRoles, setPreferredRoles] = createSignal<Record<string, string>>({})
  const [profileNames, setProfileNames] = createSignal<Record<string, Record<string, string>>>({})

  const session = createMemo(() => aws.sessions.find((s) => s.name === routeData.sessionName))

  createEffect(async () => {
    const s = session()
    if (!s) return
    const roles = await awsesh.preferredRoles.getAll(s.name)
    setPreferredRoles(roles)
  })

  const loadProfileNamesForAccount = async (accountName: string) => {
    const s = session()
    if (!s) return
    const names = await awsesh.profileNames.getForAccount(s.name, accountName)
    if (Object.keys(names).length > 0) {
      setProfileNames((prev) => ({ ...prev, [accountName]: names }))
    }
  }

  createEffect(() => {
    for (const account of aws.accounts) {
      loadProfileNamesForAccount(account.name)
    }
  })

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
      id: "account.profile",
      title: "Set CLI Profile",
      category: "Account",
      keybind: "profile_set",
      disabled: !selectedAccount(),
      onSelect: () => {
        const account = selectedAccount()
        if (account) handleSetProfile(account)
      },
    },
    {
      id: "account.profile.clear",
      title: "Clear CLI Profile",
      category: "Account",
      keybind: "profile_clear",
      disabled: (() => {
        const account = selectedAccount()
        return !account || !getProfileNameForAccount(account)
      })(),
      onSelect: () => {
        const account = selectedAccount()
        if (account) handleClearProfile(account)
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

  const getPreferredRole = (account: Account): string => {
    const preferred = preferredRoles()[account.accountId]
    if (preferred && account.roles.includes(preferred)) return preferred
    return account.roles[0] ?? "No roles"
  }

  const getProfileNameForAccount = (account: Account): string | undefined => {
    const roleName = getPreferredRole(account)
    return profileNames()[account.name]?.[roleName]
  }

  const items = (): FilterableListItem<Account>[] => {
    return aws.accounts.map((account) => {
      const roleName = getPreferredRole(account)
      const region = account.region ?? session()?.defaultRegion ?? "us-east-1"
      const customProfile = getProfileNameForAccount(account)
      const subtitleParts = [account.accountId, roleName, region]
      if (customProfile) subtitleParts.push(customProfile)
      return {
        id: account.accountId,
        title: account.name,
        subtitle: subtitleParts.join(" · "),
        value: account,
        indicator: aws.getCredentialStatus(account.accountId),
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
      const roleName = getPreferredRole(account)
      if (roleName === "No roles") {
        toast.show({
          variant: "error",
          message: "No role available for this account",
        })
        return
      }

      const portalUrl = s.startUrl.replace(/\/start\/?$/, "")
      const url = `${portalUrl}/start/#/console?account_id=${account.accountId}&role_name=${roleName}`

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
        onSelect={async (option) => {
          dialog.clear()
          await awsesh.preferredRoles.save(s.name, account.accountId, option.value)
          setPreferredRoles((prev) => ({ ...prev, [account.accountId]: option.value }))
          toast.show({
            variant: "success",
            message: `Default role set to ${option.value}`,
          })
        }}
      />
    ))
  }

  const handleSetProfile = async (account: Account) => {
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

    const selectRoleAndSetProfile = async (roleName: string) => {
      const existingProfile = await awsesh.profileNames.get(s.name, account.name, roleName)
      const defaultName = existingProfile || `${account.name}-${roleName}`

      const profileName = await DialogPrompt.show(dialog, "Set CLI Profile", {
        placeholder: "Profile name (alphanumeric, dash, underscore)",
        defaultValue: defaultName,
        description: () => (
          <box flexDirection="column" gap={0}>
            <text fg={theme.textMuted}>
              {"Account: "}
              <span style={{ fg: theme.text }}>{account.name}</span>
            </text>
            <text fg={theme.textMuted}>
              {"Role: "}
              <span style={{ fg: theme.text }}>{roleName}</span>
            </text>
          </box>
        ),
      })

      if (profileName === null || profileName === undefined) return

      const sanitized = (profileName || defaultName).replace(/[^a-zA-Z0-9\-_]/g, "")
      if (!sanitized) {
        toast.show({
          variant: "error",
          message: "Invalid profile name",
        })
        return
      }

      await awsesh.profileNames.save(s.name, account.name, roleName, sanitized)

      try {
        const result = await aws.getRoleCredentials(
          s,
          account.accountId,
          account.name,
          roleName,
          account.region ?? s.defaultRegion,
          sanitized
        )

        credentials.set({
          sessionName: s.name,
          profileName: result.profileName,
          accountName: account.name,
          accountId: account.accountId,
          roleName,
          region: account.region ?? s.defaultRegion,
          expiration: result.expiration.toISOString(),
        })

        toast.show({
          variant: "success",
          title: "Credentials Set",
          message: [
            { label: "Account", value: account.name },
            { label: "Role", value: roleName },
            { label: "Profile", value: sanitized },
          ],
        })
      } catch (e) {
        toast.error(e)
      }
    }

    if (account.roles.length === 1) {
      await selectRoleAndSetProfile(account.roles[0])
    } else {
      dialog.replace(() => (
        <DialogSelect
          title="Select Role for CLI Profile"
          options={account.roles.map((role) => ({
            title: role,
            value: role,
          }))}
          onSelect={(option) => {
            selectRoleAndSetProfile(option.value)
          }}
        />
      ))
    }
  }

  const handleClearProfile = async (account: Account) => {
    const s = session()
    if (!s) return

    const roleName = getPreferredRole(account)
    await awsesh.profileNames.remove(s.name, account.name, roleName)
    await aws.removeCredentials(account.accountId, roleName)
    setProfileNames((prev) => {
      const updated = { ...prev }
      if (updated[account.name]) {
        const { [roleName]: _, ...rest } = updated[account.name]
        if (Object.keys(rest).length === 0) {
          delete updated[account.name]
        } else {
          updated[account.name] = rest
        }
      }
      return updated
    })
    toast.show({
      variant: "success",
      message: "CLI profile cleared",
    })
  }

  const handleAssumeRole = async (account: Account, roleName: string) => {
    const s = session()
    if (!s) return

    try {
      const result = await aws.getRoleCredentials(
        s,
        account.accountId,
        account.name,
        roleName,
        account.region ?? s.defaultRegion
      )

      credentials.set({
        sessionName: s.name,
        profileName: result.profileName,
        accountName: account.name,
        accountId: account.accountId,
        roleName,
        region: account.region ?? s.defaultRegion,
        expiration: result.expiration.toISOString(),
      })

      toast.show({
        variant: "success",
        title: "Credentials Set",
        message: [
          { label: "Account", value: account.name },
          { label: "Role", value: roleName },
        ],
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
      const roleName = getPreferredRole(account)
      await handleAssumeRole(account, roleName)
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
          <KeybindHint keybind={keybind.print("profile_set")} label="Profile" />
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
