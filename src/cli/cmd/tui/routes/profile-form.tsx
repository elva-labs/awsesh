import { createSignal, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useInstance } from "@/instance/instance"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "../context/keybind"
import { FormField } from "../ui/form-field"
import { TextAttributes } from "@opentui/core"
import { useToast } from "../ui/toast"
import type { SSOProfile } from "@/types"

export function ProfileFormScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("profile-form")
  const instance = useInstance()
  const keybind = useKeybind()
  const toast = useToast()

  const isEdit = routeData.mode === "edit"
  const initialProfile = routeData.profile

  const [name, setName] = createSignal(initialProfile?.name ?? "")
  const [startUrl, setStartUrl] = createSignal(initialProfile?.startUrl ?? "")
  const [ssoRegion, setSsoRegion] = createSignal(initialProfile?.ssoRegion ?? "us-east-1")
  const [defaultRegion, setDefaultRegion] = createSignal(initialProfile?.defaultRegion ?? "us-east-1")
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [focusIndex, setFocusIndex] = createSignal(0)

  let nameInput: any
  let startUrlInput: any
  let ssoRegionInput: any
  let defaultRegionInput: any

  const inputs = () => [nameInput, startUrlInput, ssoRegionInput, defaultRegionInput]

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name().trim()) {
      newErrors.name = "Profile name is required"
    }

    if (!startUrl().trim()) {
      newErrors.startUrl = "SSO Start URL is required"
    } else if (!startUrl().startsWith("https://")) {
      newErrors.startUrl = "Start URL must be a valid HTTPS URL"
    }

    if (!ssoRegion().trim()) {
      newErrors.ssoRegion = "SSO Region is required"
    }

    if (!defaultRegion().trim()) {
      newErrors.defaultRegion = "Default Region is required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) {
      toast.show({
        variant: "error",
        message: "Please fix validation errors",
      })
      return
    }

    const profile: SSOProfile = {
      name: name().trim(),
      startUrl: startUrl().trim(),
      ssoRegion: ssoRegion().trim(),
      defaultRegion: defaultRegion().trim(),
    }

    try {
      await instance.config.saveProfile(profile)
      toast.show({
        variant: "success",
        message: isEdit ? "Profile updated" : "Profile created",
      })
      route.navigate({ type: "sso-select" })
    } catch (e) {
      toast.error(e)
    }
  }

  useKeyboard((evt) => {
    if (evt.name === "tab") {
      evt.preventDefault()
      const nextIndex = (focusIndex() + 1) % inputs().length
      setFocusIndex(nextIndex)
      inputs()[nextIndex]?.focus()
    }

    if (keybind.match("back", evt)) {
      evt.preventDefault()
      route.navigate({ type: "sso-select" })
    }

    if (keybind.match("select", evt)) {
      evt.preventDefault()
      handleSave()
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%" gap={1}>
      <box paddingLeft={1} paddingTop={1} flexDirection="row" justifyContent="space-between" paddingRight={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {isEdit ? "Edit SSO Profile" : "Add SSO Profile"}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box flexDirection="column" paddingLeft={2} paddingRight={2} gap={2}>
        <FormField
          label="Profile Name"
          value={name()}
          onInput={setName}
          error={errors().name}
          placeholder="My Organization"
          ref={(r) => {
            nameInput = r
            setTimeout(() => nameInput?.focus(), 1)
          }}
        />

        <FormField
          label="SSO Start URL"
          value={startUrl()}
          onInput={setStartUrl}
          error={errors().startUrl}
          placeholder="https://myorg.awsapps.com/start"
          ref={(r) => (startUrlInput = r)}
        />

        <FormField
          label="SSO Region"
          value={ssoRegion()}
          onInput={setSsoRegion}
          error={errors().ssoRegion}
          placeholder="us-east-1"
          ref={(r) => (ssoRegionInput = r)}
        />

        <FormField
          label="Default Region"
          value={defaultRegion()}
          onInput={setDefaultRegion}
          error={errors().defaultRegion}
          placeholder="us-east-1"
          ref={(r) => (defaultRegionInput = r)}
        />
      </box>

      <box paddingLeft={2} paddingTop={1} flexDirection="row" gap={2}>
        <text>
          <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>Tab</span>
          <span style={{ fg: theme.textMuted }}> Next Field</span>
        </text>
        <text>
          <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
            {keybind.print("select")}
          </span>
          <span style={{ fg: theme.textMuted }}> Save</span>
        </text>
        <text>
          <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
            {keybind.print("back")}
          </span>
          <span style={{ fg: theme.textMuted }}> Cancel</span>
        </text>
      </box>
    </box>
  )
}
