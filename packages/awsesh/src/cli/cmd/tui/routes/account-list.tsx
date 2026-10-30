import { Show, createMemo, createSignal, createEffect, onMount } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useAWS } from "../context/aws"
import { useAwsesh } from "../context/awsesh"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useConfig } from "../context/config"
import { useCredentials } from "../context/credentials"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"
import { Spinner } from "../ui/spinner"
import { useToast } from "../ui/toast"
import { DialogSelect } from "../ui/dialog-select"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogConfirm } from "../ui/dialog-confirm"
import { useDialog } from "../ui/dialog"
import { useExit } from "../context/exit"
import { DialogSettings } from "../component/dialog-settings"
import { RegionSelectorDialog } from "../component/region-selector-dialog"
import { DateUtil } from "@/util/date"
import { createWorkflow, type Account, type AccountLayout } from "@awsesh/core"

export function AccountListScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("account-select")
  const aws = useAWS()
  const awsesh = useAwsesh()
  const keybind = useKeybind()
  const command = useCommand()
  const config = useConfig()
  const credentials = useCredentials()
  const toast = useToast()
  const dialog = useDialog()
  const exit = useExit()
  const workflow = createWorkflow(awsesh)
  const dimensions = useTerminalDimensions()

  const [selectedAccountId, setSelectedAccountId] = createSignal<string | undefined>(undefined)
  const [selectedCategory, setSelectedCategory] = createSignal<string | undefined>(undefined)
  const [preferredRoles, setPreferredRoles] = createSignal<Record<string, string>>({})
  const [preferredRegions, setPreferredRegions] = createSignal<Record<string, string>>({})
  const [profileNames, setProfileNames] = createSignal<Record<string, Record<string, string>>>({})
  const [lastAccountId, setLastAccountId] = createSignal<string | undefined>(undefined)
  const [layout, setLayout] = createSignal<AccountLayout>({ pinned: [], groups: {}, collapsed: [] })
  const [layoutBusy, setLayoutBusy] = createSignal(false)

  const session = createMemo(() => aws.sessions.find((s) => s.name === routeData.sessionName))
  const selectedAccount = createMemo(() => aws.accounts.find((a) => a.accountId === selectedAccountId()))
  const groups = createMemo(() => [...new Set(aws.accounts.flatMap((account) => {
    const group = layout().groups[account.accountId]
    return group ? [group] : []
  }))].sort((a, b) => a.localeCompare(b)))

  createEffect(() => {
    const name = session()?.name
    if (!name) return
    awsesh.accountLayout.get(name).then((value) => {
      if (session()?.name === name) setLayout(value)
    }).catch((error) => toast.error(error))
  })

  const updateLayout = async (update: (name: string) => Promise<unknown>) => {
    const name = session()?.name
    if (!name || layoutBusy()) return
    setLayoutBusy(true)
    try {
      await update(name)
      const value = await awsesh.accountLayout.get(name)
      if (session()?.name === name) setLayout(value)
    } catch (error) {
      toast.error(error)
    } finally {
      setLayoutBusy(false)
    }
  }

  const handleFavorite = (account: Account) => updateLayout((name) => workflow.pinAccount(name, account.accountId, !layout().pinned.includes(account.accountId)))

  const handleGroup = (account: Account) => {
    const current = layout().groups[account.accountId]
    dialog.replaceRender(() => (
      <DialogSelect
        title={`Move ${account.name} to group`}
        placeholder="Search groups…"
        current={current ? `group:${current}` : "ungrouped"}
        options={[
          ...groups().map((group) => ({ title: group, value: `group:${group}`, category: "Groups" })),
          { title: "Remove from group", value: "ungrouped", category: "Actions", disabled: !current },
          { title: "New group…", value: "new", category: "Actions" },
        ]}
        onSelect={async (option) => {
          dialog.clear()
          if (option.value === "new") {
            await Promise.resolve()
            const group = await DialogPrompt.show(dialog, "New group", { placeholder: "Group name (1–64 characters)" })
            if (group === null || !group) return
            await updateLayout((name) => workflow.setAccountGroup(name, account.accountId, group))
            return
          }
          const group = option.value === "ungrouped" ? "" : option.value.slice("group:".length)
          await updateLayout((name) => workflow.setAccountGroup(name, account.accountId, group))
        }}
      />
    ))
  }

  const handleRenameGroup = async (group: string) => {
    const renamed = await DialogPrompt.show(dialog, "Rename group", {
      value: group,
      placeholder: "Group name (1–64 characters)",
      description: () => <text fg={theme.textMuted}>Using an existing group name merges the groups.</text>,
    })
    if (renamed === null || renamed === group) return
    await updateLayout((name) => workflow.renameAccountGroup(name, group, renamed))
  }

  const handleRemoveGroup = async (group: string) => {
    const confirmed = await DialogConfirm.show(dialog, {
      title: `Remove ${group}?`,
      message: "Accounts move to Other accounts. Favorites remain favorites. No credentials are removed.",
      variant: "danger",
      confirmLabel: "Remove group",
    })
    if (confirmed) await updateLayout((name) => workflow.removeAccountGroup(name, group))
  }

  const handleCategoryToggle = (category: string, collapsed: boolean) => {
    if (category === "favorites") return updateLayout((name) => awsesh.accountLayout.update(name, (value) => ({ ...value, favoritesCollapsed: collapsed })))
    const group = category === "other" ? "" : category.slice("group:".length)
    return updateLayout((name) => workflow.collapseAccountGroup(name, group, collapsed))
  }

  onMount(async () => {
    const last = await awsesh.lastAccountPerSession.get(routeData.sessionName)
    setLastAccountId(last)
  })

  createEffect(async () => {
    const s = session()
    if (!s) return
    const roles = await awsesh.preferredRoles.getAll(s.name)
    setPreferredRoles(roles)
    const regions = await awsesh.preferredRegions.getAll(s.name)
    setPreferredRegions(regions)
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
      id: "account.favorite",
      title: selectedAccountId() && layout().pinned.includes(selectedAccountId() ?? "") ? "Remove from Favorites" : "Add to Favorites",
      category: "Account",
      keybind: "account_favorite",
      disabled: !selectedAccount() || layoutBusy(),
      onSelect: () => {
        const account = selectedAccount()
        if (account) handleFavorite(account)
      },
    },
    {
      id: "account.group",
      title: "Move to Group",
      category: "Account",
      keybind: "account_group",
      disabled: !selectedAccount() || layoutBusy(),
      onSelect: () => {
        const account = selectedAccount()
        if (account && !layoutBusy()) handleGroup(account)
      },
    },
    ...groups().flatMap((group) => [
      {
        id: `group.rename:${group}`,
        title: `Rename group: ${group}`,
        category: "Groups",
        disabled: layoutBusy(),
        onSelect: () => { handleRenameGroup(group) },
      },
      {
        id: `group.remove:${group}`,
        title: `Remove group: ${group}`,
        category: "Groups",
        disabled: layoutBusy(),
        onSelect: () => { handleRemoveGroup(group) },
      },
      {
        id: `group.toggle:${group}`,
        title: `${layout().collapsed.includes(group) ? "Expand" : "Collapse"} group: ${group}`,
        category: "Groups",
        disabled: layoutBusy(),
        onSelect: () => { handleCategoryToggle(`group:${group}`, !layout().collapsed.includes(group)) },
      },
    ]),
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
      id: "account.region",
      title: "Set Region",
      category: "Account",
      keybind: "region_set",
      disabled: !selectedAccount(),
      onSelect: () => {
        const account = selectedAccount()
        if (account) handleSetRegion(account)
      },
    },
    {
      id: "nav.back",
      title: "Back to Sessions",
      category: "Application",
      keybind: "back",
      onSelect: () => {
        route.navigate({ type: "sso-select" })
      },
    },
    {
      id: "nav.credentials",
      title: "View Credentials",
      category: "Application",
      keybind: "credentials",
      onSelect: () => {
        route.navigate({ type: "credentials" })
      },
    },
    {
      id: "credentials.cleanup",
      title: "Cleanup Session Credentials",
      category: "Credentials",
      keybind: "credentials_cleanup",
      onSelect: async () => {
        const s = session()
        if (!s) return
        const confirmed = await DialogConfirm.show(
          dialog,
          {
            title: "Cleanup Session Credentials",
            message: `Are you sure you want to flush all credentials for "${s.name}"?`,
            variant: "danger",
            confirmLabel: "Cleanup",
            cancelLabel: "Cancel",
          }
        )
        if (confirmed) {
          await aws.killSSOSession(s.name, s.startUrl)
          toast.show({ variant: "success", message: `Credentials for "${s.name}" removed` })
        }
      },
    },
    {
      id: "settings",
      title: "Settings",
      category: "Application",
      keybind: "settings",
      onSelect: () => {
        dialog.replace(DialogSettings)
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

  const getCredentialExpiration = (accountId: string): string | undefined => {
    const creds = aws.activeCredentials.filter((c) => c.accountId === accountId)
    if (creds.length === 0) return undefined

    const now = new Date()
    const validCreds = creds.filter((c) => new Date(c.expiration) > now)
    if (validCreds.length === 0) return "Expired"

    const sorted = validCreds.sort(
      (a, b) => new Date(b.expiration).getTime() - new Date(a.expiration).getTime()
    )
    const expiration = new Date(sorted[0].expiration)
    return `Expires ${DateUtil.formatTime(expiration, config.data.timeFormat)}`
  }

  const items = (): FilterableListItem<Account>[] => {
    const arranged = [...aws.accounts].sort((a, b) => {
      const pinned = Number(layout().pinned.includes(b.accountId)) - Number(layout().pinned.includes(a.accountId))
      if (pinned) return pinned
      if (layout().pinned.includes(a.accountId)) return a.name.localeCompare(b.name)
      const first = layout().groups[a.accountId]
      const second = layout().groups[b.accountId]
      if (first && !second) return -1
      if (!first && second) return 1
      return (first ?? "").localeCompare(second ?? "") || a.name.localeCompare(b.name)
    })
    const grouped = aws.accounts.some((account) => layout().pinned.includes(account.accountId) || layout().groups[account.accountId])
    return arranged.map((account) => {
      const favorite = layout().pinned.includes(account.accountId)
      const group = layout().groups[account.accountId]
      const roleName = getPreferredRole(account)
      const region = preferredRegions()[account.accountId] ?? session()?.defaultRegion ?? "us-east-1"
      const customProfile = getProfileNameForAccount(account)
      const subtitleParts = [account.accountId, roleName, region]
      if (customProfile) subtitleParts.push(customProfile)
      return {
        id: account.accountId,
        title: account.name,
        subtitle: subtitleParts.join(" · "),
        value: account,
        favorite,
        category: grouped ? favorite ? "★ Favorites" : group ?? "Other accounts" : undefined,
        categoryId: grouped ? favorite ? "favorites" : group ? `group:${group}` : "other" : undefined,
        description: favorite ? group : undefined,
        indicator: aws.getCredentialStatus(account.accountId),
        footer: getCredentialExpiration(account.accountId),
      }
    })
  }

  const handleRefresh = async () => {
    const s = session()
    if (!s) return

    try {
      await aws.refreshAccounts()
      setLayout(await awsesh.accountLayout.get(s.name))
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

    let roles = account.roles
    if (!account.rolesLoaded) {
      roles = await aws.loadRoles(s, account.accountId)
      if (roles.length === 0) {
        toast.show({
          variant: "error",
          message: "No roles found for this account",
        })
        return
      }
    }

    dialog.replaceRender(() => (
      <DialogSelect
        title="Select Role"
        options={roles.map((role) => ({
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

    let roles = account.roles
    if (!account.rolesLoaded) {
      roles = await aws.loadRoles(s, account.accountId)
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
          preferredRegions()[account.accountId] ?? s.defaultRegion,
          sanitized
        )

        credentials.set({
          sessionName: s.name,
          profileName: result.profileName,
          accountName: account.name,
          accountId: account.accountId,
          roleName,
          region: preferredRegions()[account.accountId] ?? s.defaultRegion,
          expiration: result.expiration.toISOString(),
        })

        setProfileNames((prev) => ({
          ...prev,
          [account.name]: { ...prev[account.name], [roleName]: sanitized },
        }))

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

    if (roles.length === 1) {
      await selectRoleAndSetProfile(roles[0])
    } else {
      dialog.replaceRender(() => (
        <DialogSelect
          title="Select Role for CLI Profile"
          options={roles.map((role) => ({
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

  const handleSetRegion = async (account: Account) => {
    const s = session()
    if (!s) return

    const currentRegion = preferredRegions()[account.accountId] ?? s.defaultRegion

    dialog.replace(RegionSelectorDialog, {
      currentRegion,
      onSelect: async (region: string) => {
        await awsesh.preferredRegions.save(s.name, account.accountId, region)
        setPreferredRegions((prev) => ({ ...prev, [account.accountId]: region }))
        toast.show({
          variant: "success",
          message: `Region set to ${region}`,
        })
      },
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
        preferredRegions()[account.accountId] ?? s.defaultRegion
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

    await awsesh.lastAccountPerSession.save(s.name, account.accountId)

    if (account.roles.length > 0) {
      const roleName = getPreferredRole(account)
      await handleAssumeRole(account, roleName)
    } else {
      await handleViewRoles(account)
    }
  }

  const handleItemMove = (item: FilterableListItem<Account>) => {
    setSelectedCategory(undefined)
    setSelectedAccountId(item.value.accountId)
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
          right={<KeybindHint keybind={keybind.print("command_list")} label="More" onClick={() => command.show()} />}
        >
          <KeybindHint keybind={keybind.print("select")} label={selectedCategory() ? "Toggle" : "Select"} onClick={() => {
            const category = selectedCategory()
            if (category) {
              const collapsed = category === "favorites" ? layout().favoritesCollapsed === true : layout().collapsed.includes(category === "other" ? "" : category.slice("group:".length))
              handleCategoryToggle(category, !collapsed)
              return
            }
            const account = selectedAccount()
            if (account) handleSelect({ id: account.accountId, title: account.name, value: account })
          }} />
          <KeybindHint keybind={keybind.print("role_list")} label="Roles" onClick={() => command.trigger("account.roles")} />
          <KeybindHint keybind={keybind.print("account_favorite")} label="Favorite" onClick={() => command.trigger("account.favorite")} />
          <KeybindHint keybind={keybind.print("account_group")} label="Group" onClick={() => command.trigger("account.group")} />
          <Show when={dimensions().width >= 100}>
            <KeybindHint keybind={`${keybind.print("nav_left")}/${keybind.print("nav_right")}`} label="Fold" />
          </Show>
          <KeybindHint keybind={keybind.print("back")} label="Back" onClick={() => command.trigger("nav.back")} />
        </Footer>
      }
    >
      <FilterableList
        items={items()}
        onSelect={handleSelect}
        onMove={handleItemMove}
        onEmpty={() => { setSelectedAccountId(undefined); setSelectedCategory(undefined) }}
        onCategoryMove={setSelectedCategory}
        emptyMessage="No accounts found"
        initialId={lastAccountId()}
        filterPlaceholder="Search accounts, roles or groups…"
        collapsedCategories={[
          ...layout().collapsed.map((group) => group ? `group:${group}` : "other"),
          ...(layout().favoritesCollapsed ? ["favorites"] : []),
        ]}
        onCategoryToggle={handleCategoryToggle}
      />

      <Show when={aws.error}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={theme.error}>{aws.error}</text>
        </box>
      </Show>
    </Layout>
  )
}
