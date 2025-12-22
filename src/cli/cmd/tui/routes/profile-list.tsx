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
import type { SSOProfile } from "@/types"

export function ProfileListScreen() {
  const { theme, mode, setMode } = useTheme()
  const route = useRoute()
  const aws = useAWS()
  const keybind = useKeybind()
  const command = useCommand()
  const dialog = useDialog()
  const exit = useExit()

  const [selectedProfile, setSelectedProfile] = createSignal<SSOProfile | null>(null)

  command.register(() => [
    {
      id: "profile.add",
      title: "Add Profile",
      category: "Profile",
      keybind: "profile_add",
      onSelect: () => {
        route.navigate({
          type: "profile-form",
          mode: "create",
        })
      },
    },
    {
      id: "profile.edit",
      title: "Edit Profile",
      category: "Profile",
      keybind: "profile_edit",
      disabled: !selectedProfile(),
      onSelect: () => {
        const selected = selectedProfile()
        if (selected) {
          route.navigate({
            type: "profile-form",
            mode: "edit",
            profile: selected,
          })
        }
      },
    },
    {
      id: "profile.delete",
      title: "Delete Profile",
      category: "Profile",
      keybind: "profile_delete",
      disabled: !selectedProfile(),
      onSelect: () => {
        const selected = selectedProfile()
        if (selected) {
          route.navigate({
            type: "profile-delete-confirm",
            profileName: selected.name,
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

  const items = (): FilterableListItem<SSOProfile>[] => {
    return aws.profiles.map((profile) => ({
      id: profile.name,
      title: profile.name,
      subtitle: profile.startUrl,
      value: profile,
      active: aws.isSessionActive(profile.startUrl),
    }))
  }

  const handleItemMove = (item: FilterableListItem<SSOProfile>) => {
    setSelectedProfile(item.value)
  }

  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return
    if (keybind.match("help", evt)) {
      evt.preventDefault()
    }
  })

  const handleSelect = async (item: FilterableListItem<SSOProfile>) => {
    const profile = item.value

    try {
      await aws.loadAccounts(profile)
      route.navigate({
        type: "account-select",
        profileName: profile.name,
      })
    } catch {
      route.navigate({
        type: "sso-login",
        profileName: profile.name,
        startUrl: profile.startUrl,
        ssoRegion: profile.ssoRegion,
      })
    }
  }

  return (
    <Layout
      header={<Header title="AWS SSO Profiles" subtitle={`${aws.profiles.length} profiles`} />}
      footer={
        <Footer
          right={
            <KeybindHint keybind={keybind.print("command_list")} label="More" />
          }
        >
          <KeybindHint keybind={keybind.print("select")} label="Select" />
          <KeybindHint keybind={keybind.print("profile_add")} label="Add" />
          <KeybindHint keybind={keybind.print("profile_edit")} label="Edit" />
          <KeybindHint keybind={keybind.print("quit")} label="Quit" />
        </Footer>
      }
    >
      <Show
        when={items().length > 0}
        fallback={
          <box flexDirection="column" paddingLeft={2} paddingTop={2} gap={1}>
            <text fg={theme.textMuted}>No SSO profiles configured</text>
            <text fg={theme.textMuted}>
              Press '{keybind.print("profile_add")}' to add your first profile
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
