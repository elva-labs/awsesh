import { Show, createSignal, createMemo } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useAWS } from "../context/aws"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useConfig } from "../context/config"
import { useExit } from "../context/exit"
import { FilterableList, type FilterableListItem, type IndicatorState } from "../ui/filterable-list"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogCredentialsCleanup } from "../component/dialog-credentials-cleanup"
import { DialogCredentialActions } from "../component/dialog-credential-actions"
import { DialogSettings } from "../component/dialog-settings"
import { DateUtil } from "@/util/date"
import type { ActiveCredential } from "@awsesh/core"

export function CredentialsScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const aws = useAWS()
  const keybind = useKeybind()
  const command = useCommand()
  const config = useConfig()
  const dialog = useDialog()
  const toast = useToast()
  const exit = useExit()

  const [selectedItem, setSelectedItem] = createSignal<ActiveCredential | null>(null)

  const handleRefreshCredential = async (cred: ActiveCredential) => {
    const session = aws.sessions.find((s) => s.name === cred.sessionName)
    if (!session) {
      toast.show({ variant: "error", message: "Session not found" })
      return
    }

    try {
      await aws.getRoleCredentials(
        session,
        cred.accountId,
        cred.accountName,
        cred.roleName,
        undefined,
        cred.profileName
      )
      toast.show({ variant: "success", message: `Refreshed credential "${cred.profileName}"` })
    } catch (e) {
      toast.error(e)
    }
  }

  const handleKillCredential = async (cred: ActiveCredential) => {
    await aws.killCredential(cred.profileName, cred.accountId, cred.roleName)
    toast.show({ variant: "success", message: `Removed credential "${cred.profileName}"` })
  }

  command.register(() => [
    {
      id: "credential.kill",
      title: "Kill Credential",
      category: "Credentials",
      keybind: "session_kill",
      disabled: !selectedItem(),
      onSelect: async () => {
        const item = selectedItem()
        if (!item) return
        await handleKillCredential(item)
      },
    },
    {
      id: "credentials.cleanup",
      title: "Cleanup All Credentials",
      category: "Credentials",
      keybind: "credentials_cleanup",
      disabled: aws.activeCredentials.length === 0,
      onSelect: async () => {
        const confirmed = await DialogCredentialsCleanup.show(dialog)
        if (confirmed) {
          await aws.killAllSessions()
          toast.show({ variant: "success", message: "All credentials removed" })
        }
      },
    },
    {
      id: "nav.back",
      title: "Back",
      category: "Application",
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
        dialog.replace(<DialogSettings />)
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

  const items = createMemo((): FilterableListItem<ActiveCredential>[] => {
    const sorted = [...aws.activeCredentials].sort((a, b) =>
      a.sessionName.localeCompare(b.sessionName)
    )

    return sorted.map((cred) => {
      const expiresAt = new Date(cred.expiration)
      const isExpired = expiresAt <= new Date()

      let indicator: IndicatorState = "inactive"
      if (!isExpired) {
        indicator = cred.isDefault ? "default" : "active"
      }

      const expirationText = isExpired
        ? "Expired"
        : `Expires ${DateUtil.formatTime(expiresAt, config.data.timeFormat)}`

      return {
        id: `${cred.profileName}-${cred.accountId}-${cred.roleName}`,
        title: cred.accountName,
        subtitle: [cred.accountId, cred.roleName, cred.profileName].join(" · "),
        value: cred,
        indicator,
        footer: expirationText,
        category: cred.sessionName,
      }
    })
  })

  const handleItemMove = (item: FilterableListItem<ActiveCredential>) => {
    setSelectedItem(item.value)
  }

  const handleSelect = (item: FilterableListItem<ActiveCredential>) => {
    const cred = item.value
    DialogCredentialActions.show(
      dialog,
      cred.accountName,
      () => handleRefreshCredential(cred),
      () => handleKillCredential(cred)
    )
  }

  return (
    <Layout
      header={
        <Header
          title="CLI Credentials"
          subtitle={`${aws.activeCredentials.length} active`}
        />
      }
      footer={
        <Footer
          right={
            <KeybindHint keybind={keybind.print("command_list")} label="More" onClick={() => command.show()} />
          }
        >
          <KeybindHint keybind={keybind.print("select")} label="Select" onClick={() => {
            const item = selectedItem()
            if (item) handleSelect({ id: `${item.profileName}-${item.accountId}-${item.roleName}`, title: item.accountName, value: item })
          }} />
          <KeybindHint keybind={keybind.print("session_kill")} label="Kill" onClick={() => command.trigger("credential.kill")} />
          <KeybindHint keybind={keybind.print("credentials_cleanup")} label="Kill All" onClick={() => command.trigger("credentials.cleanup")} />
          <KeybindHint keybind={keybind.print("back")} label="Back" onClick={() => command.trigger("nav.back")} />
        </Footer>
      }
    >
      <Show
        when={items().length > 0}
        fallback={
          <box flexDirection="column" paddingLeft={2} paddingTop={2} gap={1}>
            <text fg={theme.textMuted}>No active CLI credentials</text>
            <text fg={theme.textMuted}>
              Press '{keybind.print("back")}' to go back and set credentials
            </text>
          </box>
        }
      >
        <FilterableList
          items={items()}
          onSelect={handleSelect}
          onMove={handleItemMove}
          filterPlaceholder="Filter credentials..."
        />
      </Show>

      <Show when={aws.error}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={theme.error}>{aws.error}</text>
        </box>
      </Show>
    </Layout>
  )
}
