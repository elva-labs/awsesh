import { Show, createSignal, createEffect, on, onMount } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useAWS } from "../context/aws"
import { useAwsesh } from "../context/awsesh"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useConfig } from "../context/config"
import { useKeyboard } from "@opentui/solid"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"
import { useDialog } from "../ui/dialog"
import { useExit } from "../context/exit"
import { useToast } from "../ui/toast"
import { DialogSettings } from "../component/dialog-settings"
import { DialogSSOLogin } from "../component/dialog-sso-login"
import { DialogSessionForm } from "../component/dialog-session-form"
import { DialogSessionDelete } from "../component/dialog-session-delete"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DateUtil } from "@/util/date"
import type { SSOSession } from "@awsesh/core"

export function SessionListScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const aws = useAWS()
  const awsesh = useAwsesh()
  const keybind = useKeybind()
  const command = useCommand()
  const config = useConfig()
  const dialog = useDialog()
  const exit = useExit()
  const toast = useToast()

  const [selectedSession, setSelectedSession] = createSignal<SSOSession | null>(null)
  const [tokenExpirations, setTokenExpirations] = createSignal<Record<string, Date>>({})
  const [lastSessionName, setLastSessionName] = createSignal<string | undefined>(undefined)

  onMount(async () => {
    const last = await awsesh.lastSession.get()
    setLastSessionName(last)
  })

  createEffect(on(() => aws.sessions, async (sessions) => {
    if (sessions.length === 0) return
    const expirations: Record<string, Date> = {}
    for (const session of sessions) {
      const expiration = await aws.getTokenExpiration(session.startUrl)
      if (expiration) {
        expirations[session.startUrl] = expiration
      }
    }
    setTokenExpirations(expirations)
  }))

  command.register(() => [
    {
      id: "session.add",
      title: "Add SSO Session",
      category: "Session",
      keybind: "session_add",
      onSelect: () => {
        DialogSessionForm.show(dialog, { mode: "create" })
      },
    },
    {
      id: "session.edit",
      title: "Edit SSO Session",
      category: "Session",
      keybind: "session_edit",
      disabled: !selectedSession(),
      onSelect: () => {
        const selected = selectedSession()
        if (selected) {
          const freshSession = aws.sessions.find((s) => s.name === selected.name)
          if (freshSession) {
            DialogSessionForm.show(dialog, { mode: "edit", session: freshSession })
          }
        }
      },
    },
    {
      id: "session.delete",
      title: "Delete SSO Session",
      category: "Session",
      keybind: "session_delete",
      disabled: !selectedSession(),
      onSelect: () => {
        const selected = selectedSession()
        if (selected) {
          DialogSessionDelete.show(dialog, selected.name)
        }
      },
    },
    {
      id: "session.kill_credentials",
      title: "Kill Session Credentials",
      category: "Credentials",
      keybind: "session_kill",
      disabled: !selectedSession(),
      onSelect: async () => {
        const selected = selectedSession()
        if (!selected) return
        const confirmed = await DialogConfirm.show(
          dialog,
          "Kill Session Credentials",
          `Remove all CLI credentials for "${selected.name}"?`
        )
        if (confirmed) {
          await aws.killSSOSession(selected.name, selected.startUrl)
          toast.show({ variant: "success", message: `Killed credentials for "${selected.name}"` })
        }
      },
    },
    {
      id: "credentials.cleanup",
      title: "Cleanup All Credentials",
      category: "Credentials",
      keybind: "credentials_cleanup",
      onSelect: async () => {
        const confirmed = await DialogConfirm.show(
          dialog,
          "Cleanup Credentials",
          "Are you sure you want to flush all active credentials?"
        )
        if (confirmed) {
          await aws.killAllSessions()
          toast.show({ variant: "success", message: "All credentials removed" })
        }
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

  const getExpirationFooter = (session: SSOSession): string | undefined => {
    const expiration = tokenExpirations()[session.startUrl]
    if (!expiration) return undefined
    const now = new Date()
    if (expiration <= now) return "Expired"
    return `Expires ${DateUtil.formatTime(expiration, config.data.timeFormat)}`
  }

  const items = (): FilterableListItem<SSOSession>[] => {
    return aws.sessions.map((session) => ({
      id: session.name,
      title: session.name,
      subtitle: session.startUrl,
      value: session,
      indicator: aws.isSessionActive(session.startUrl) ? "active" : "inactive",
      footer: getExpirationFooter(session),
    }))
  }

  const handleItemMove = (item: FilterableListItem<SSOSession>) => {
    setSelectedSession(item.value)
  }

  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return
    if (keybind.match("help", evt)) {
      evt.preventDefault()
    }
  })

  const handleSelect = async (item: FilterableListItem<SSOSession>) => {
    const session = item.value

    await awsesh.lastSession.save(session.name)

    if (aws.isSessionActive(session.startUrl)) {
      await aws.loadAccounts(session)
      route.navigate({
        type: "account-select",
        sessionName: session.name,
      })
      return
    }

    DialogSSOLogin.show(
      dialog,
      session,
      () => {
        route.navigate({
          type: "account-select",
          sessionName: session.name,
        })
      },
      (error) => {
        toast.error(error)
      }
    )
  }

  return (
    <Layout
      header={<Header title="AWS SSO Sessions" subtitle={`${aws.sessions.length} sessions`} />}
      footer={
        <Footer
          right={
            <KeybindHint keybind={keybind.print("command_list")} label="More" />
          }
        >
          <KeybindHint keybind={keybind.print("select")} label="Select" />
          <KeybindHint keybind={keybind.print("session_add")} label="Add" />
          <KeybindHint keybind={keybind.print("session_edit")} label="Edit" />
          <KeybindHint keybind={keybind.print("quit")} label="Quit" />
        </Footer>
      }
    >
      <Show
        when={items().length > 0}
        fallback={
          <box flexDirection="column" paddingLeft={2} paddingTop={2} gap={1}>
            <text fg={theme.textMuted}>No SSO sessions configured</text>
            <text fg={theme.textMuted}>
              Press '{keybind.print("session_add")}' to add your first SSO session
            </text>
          </box>
        }
      >
        <FilterableList
          items={items()}
          onSelect={handleSelect}
          onMove={handleItemMove}
          initialId={lastSessionName()}
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
