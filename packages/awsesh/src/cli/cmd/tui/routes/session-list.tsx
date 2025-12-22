import { Show, createSignal } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useAWS } from "../context/aws"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useKeyboard } from "@opentui/solid"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"
import { useDialog } from "../ui/dialog"
import { useExit } from "../context/exit"
import { DialogSettings } from "../component/dialog-settings"
import type { SSOSession } from "@awsesh/core"

export function SessionListScreen() {
  const { theme, mode, setMode } = useTheme()
  const route = useRoute()
  const aws = useAWS()
  const keybind = useKeybind()
  const command = useCommand()
  const dialog = useDialog()
  const exit = useExit()

  const [selectedSession, setSelectedSession] = createSignal<SSOSession | null>(null)

  command.register(() => [
    {
      id: "session.add",
      title: "Add SSO Session",
      category: "Session",
      keybind: "session_add",
      onSelect: () => {
        route.navigate({
          type: "session-form",
          mode: "create",
        })
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
          route.navigate({
            type: "session-form",
            mode: "edit",
            session: selected,
          })
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
          route.navigate({
            type: "session-delete-confirm",
            sessionName: selected.name,
          })
        }
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
      id: "theme.toggle_mode",
      title: "Toggle appearance",
      category: "System",
      onSelect: (ctx) => {
        setMode(mode() === "dark" ? "light" : "dark")
        ctx.clear()
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

  const items = (): FilterableListItem<SSOSession>[] => {
    return aws.sessions.map((session) => ({
      id: session.name,
      title: session.name,
      subtitle: session.startUrl,
      value: session,
      active: aws.isSessionActive(session.startUrl),
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

    try {
      await aws.loadAccounts(session)
      route.navigate({
        type: "account-select",
        sessionName: session.name,
      })
    } catch {
      route.navigate({
        type: "sso-login",
        sessionName: session.name,
        startUrl: session.startUrl,
        ssoRegion: session.ssoRegion,
      })
    }
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
