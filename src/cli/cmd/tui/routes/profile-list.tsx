import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useAWS } from "../context/aws"
import { useDialog } from "../ui/dialog"
import { useKeybind } from "../context/keybind"
import { useKeyboard } from "@opentui/solid"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import { DialogConfirm } from "../ui/dialog-confirm"
import { TextAttributes } from "@opentui/core"
import { useExit } from "../context/exit"
import type { SSOProfile } from "@/types"

export function ProfileListScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const aws = useAWS()
  const dialog = useDialog()
  const keybind = useKeybind()
  const exit = useExit()

  const items = (): FilterableListItem<SSOProfile>[] => {
    return aws.profiles.map((profile) => ({
      id: profile.name,
      title: profile.name,
      value: profile,
      description: profile.startUrl,
    }))
  }

  useKeyboard((evt) => {
    if (keybind.match("profile_add", evt)) {
      evt.preventDefault()
      route.navigate({
        type: "profile-form",
        mode: "create",
      })
    }

    if (keybind.match("profile_edit", evt)) {
      evt.preventDefault()
      const selected = items()[0]?.value
      if (selected) {
        route.navigate({
          type: "profile-form",
          mode: "edit",
          profile: selected,
        })
      }
    }

    if (keybind.match("profile_delete", evt)) {
      evt.preventDefault()
      const selected = items()[0]?.value
      if (selected) {
        route.navigate({
          type: "profile-delete-confirm",
          profileName: selected.name,
        })
      }
    }

    if (keybind.match("quit", evt)) {
      evt.preventDefault()
      exit()
    }

    if (keybind.match("help", evt)) {
      evt.preventDefault()
      // TODO: Show help dialog
    }
  })

  const handleSelect = async (item: FilterableListItem<SSOProfile>) => {
    const profile = item.value

    // Check if we have a valid token
    const token = await aws.checkToken(profile.startUrl)
    
    if (!token) {
      // Need to authenticate
      route.navigate({
        type: "sso-login",
        profileName: profile.name,
        startUrl: profile.startUrl,
        ssoRegion: profile.ssoRegion,
      })
      return
    }

    // Load accounts
    await aws.loadAccounts(profile)
    route.navigate({
      type: "account-select",
      profileName: profile.name,
    })
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box paddingLeft={1} paddingTop={1} paddingBottom={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          AWS SSO Profiles
        </text>
      </box>

      <Show
        when={items().length > 0}
        fallback={
          <box flexDirection="column" paddingLeft={2} paddingTop={2} gap={1}>
            <text fg={theme.textMuted}>No SSO profiles configured</text>
            <text fg={theme.textMuted}>Press 'a' to add your first profile</text>
          </box>
        }
      >
        <FilterableList
          items={items()}
          onSelect={handleSelect}
          showFilter={false}
          footer={
            <box paddingLeft={1} paddingBottom={1} flexDirection="row" gap={2}>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("profile_add")}
                </span>
                <span style={{ fg: theme.textMuted }}> Add</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("profile_edit")}
                </span>
                <span style={{ fg: theme.textMuted }}> Edit</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("profile_delete")}
                </span>
                <span style={{ fg: theme.textMuted }}> Delete</span>
              </text>
              <text>
                <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
                  {keybind.print("select")}
                </span>
                <span style={{ fg: theme.textMuted }}> Select</span>
              </text>
            </box>
          }
        />
      </Show>

      <Show when={aws.error}>
        <box paddingLeft={1} paddingTop={1}>
          <text fg={theme.error}>{aws.error}</text>
        </box>
      </Show>
    </box>
  )
}
