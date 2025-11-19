import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useInstance } from "@/instance/instance"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "../context/keybind"
import { TextAttributes } from "@opentui/core"
import { useToast } from "../ui/toast"
import { createStore } from "solid-js/store"
import { For } from "solid-js"
import { Locale } from "../util/locale"

export function ProfileDeleteConfirmScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("profile-delete-confirm")
  const instance = useInstance()
  const keybind = useKeybind()
  const toast = useToast()

  const [store, setStore] = createStore({
    active: "cancel" as "cancel" | "delete",
  })

  const handleDelete = async () => {
    try {
      await instance.config.deleteProfile(routeData.profileName)
      toast.show({
        variant: "success",
        message: `Profile "${routeData.profileName}" deleted`,
      })
      route.navigate({ type: "sso-select" })
    } catch (e) {
      toast.error(e)
    }
  }

  const handleCancel = () => {
    route.navigate({ type: "sso-select" })
  }

  useKeyboard((evt) => {
    if (keybind.match("select", evt)) {
      evt.preventDefault()
      if (store.active === "delete") {
        handleDelete()
      } else {
        handleCancel()
      }
    }

    if (keybind.match("back", evt)) {
      evt.preventDefault()
      handleCancel()
    }

    if (evt.name === "left" || evt.name === "right" || evt.name === "h" || evt.name === "l") {
      evt.preventDefault()
      setStore("active", store.active === "delete" ? "cancel" : "delete")
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%" alignItems="center" justifyContent="center">
      <box
        width={60}
        backgroundColor={theme.background}
        borderStyle="single"
        borderColor={theme.border}
        flexDirection="column"
        gap={1}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.error} attributes={TextAttributes.BOLD}>
            Delete Profile?
          </text>
          <text fg={theme.textMuted}>esc</text>
        </box>

        <box paddingBottom={1} flexDirection="column" gap={0.5}>
          <text fg={theme.text}>Are you sure you want to delete</text>
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>
            "{routeData.profileName}"?
          </text>
          <text fg={theme.warning}>This action cannot be undone.</text>
        </box>

        <box flexDirection="row" justifyContent="flex-end" gap={1}>
          <For each={["cancel", "delete"]}>
            {(key) => (
              <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={key === store.active ? (key === "delete" ? theme.error : theme.primary) : undefined}
                onMouseUp={() => {
                  if (key === "delete") handleDelete()
                  else handleCancel()
                }}
                onMouseOver={() => setStore("active", key as "cancel" | "delete")}
              >
                <text fg={key === store.active ? theme.background : theme.textMuted}>
                  {Locale.titlecase(key)}
                </text>
              </box>
            )}
          </For>
        </box>
      </box>
    </box>
  )
}
