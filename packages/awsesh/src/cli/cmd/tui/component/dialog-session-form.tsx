import { createSignal, onMount } from "solid-js"
import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useAwsesh } from "../context/awsesh"
import { useAWS } from "../context/aws"
import { useDialog, type DialogContext } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { FormField } from "../ui/form-field"
import type { SSOSession } from "@awsesh/core"

export type DialogSessionFormProps = {
  mode: "create" | "edit"
  session?: SSOSession
  onSuccess?: () => void
  onCancel?: () => void
}

export function DialogSessionForm(props: DialogSessionFormProps) {
  const dialog = useDialog()
  const awsesh = useAwsesh()
  const aws = useAWS()
  const toast = useToast()
  const { theme } = useTheme()

  const isEdit = props.mode === "edit"
  const initialSession = props.session
  const originalName = initialSession?.name

  const [name, setName] = createSignal(initialSession?.name ?? "")
  const [startUrl, setStartUrl] = createSignal(initialSession?.startUrl ?? "")
  const [ssoRegion, setSsoRegion] = createSignal(initialSession?.ssoRegion ?? "us-east-1")
  const [defaultRegion, setDefaultRegion] = createSignal(initialSession?.defaultRegion ?? "us-east-1")
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [focusIndex, setFocusIndex] = createSignal(0)

  let nameInput: InputRenderable | undefined
  let startUrlInput: InputRenderable | undefined
  let ssoRegionInput: InputRenderable | undefined
  let defaultRegionInput: InputRenderable | undefined

  const inputs = () => [nameInput, startUrlInput, ssoRegionInput, defaultRegionInput]

  onMount(() => {
    setTimeout(() => {
      if (nameInput) {
        nameInput.focus()
        if (isEdit) {
          nameInput.cursorPosition = nameInput.value.length
        }
      }
    }, 1)
  })

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name().trim()) {
      newErrors.name = "Session name is required"
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

    const session: SSOSession = {
      name: name().trim(),
      startUrl: startUrl().trim(),
      ssoRegion: ssoRegion().trim(),
      defaultRegion: defaultRegion().trim(),
    }

    try {
      if (isEdit && originalName && originalName !== session.name) {
        await awsesh.sessions.remove(originalName)
      }
      await awsesh.sessions.save(session)
      await aws.refreshSessions()
      toast.show({
        variant: "success",
        message: isEdit ? "SSO Session updated" : "SSO Session created",
      })
      dialog.clear()
      props.onSuccess?.()
    } catch (e) {
      toast.error(e)
    }
  }

  useKeyboard((evt) => {
    if (evt.name === "tab") {
      evt.preventDefault()
      const nextIndex = (focusIndex() + 1) % inputs().length
      setFocusIndex(nextIndex)
      const input = inputs()[nextIndex]
      if (input) {
        input.focus()
        input.cursorPosition = input.value.length
      }
    }

    if (evt.name === "return" && !evt.shift) {
      evt.preventDefault()
      handleSave()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {isEdit ? "Edit SSO Session" : "Add SSO Session"}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <box flexDirection="column" gap={1} paddingBottom={1}>
        <FormField
          label="Session Name"
          value={name()}
          onInput={setName}
          error={errors().name}
          placeholder="My Organization"
          ref={(r) => { nameInput = r }}
        />

        <FormField
          label="SSO Start URL"
          value={startUrl()}
          onInput={setStartUrl}
          error={errors().startUrl}
          placeholder="https://myorg.awsapps.com/start"
          ref={(r) => { startUrlInput = r }}
        />

        <FormField
          label="SSO Region"
          value={ssoRegion()}
          onInput={setSsoRegion}
          error={errors().ssoRegion}
          placeholder="us-east-1"
          ref={(r) => { ssoRegionInput = r }}
        />

        <FormField
          label="Default Region"
          value={defaultRegion()}
          onInput={setDefaultRegion}
          error={errors().defaultRegion}
          placeholder="us-east-1"
          ref={(r) => { defaultRegionInput = r }}
        />
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={theme.text}>
          {"tab "}
          <span style={{ fg: theme.textMuted }}>next field</span>
        </text>
        <text fg={theme.text}>
          {"enter "}
          <span style={{ fg: theme.textMuted }}>save</span>
        </text>
      </box>
    </box>
  )
}

DialogSessionForm.show = (
  dialog: DialogContext,
  options: { mode: "create" | "edit"; session?: SSOSession }
) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      () => (
        <DialogSessionForm
          mode={options.mode}
          session={options.session}
          onSuccess={() => resolve(true)}
          onCancel={() => resolve(false)}
        />
      ),
      () => resolve(false)
    )
  })
}
