import { createSignal, onMount } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useAwsesh } from "../context/awsesh"
import { useAWS } from "../context/aws"
import { useDialog, type DialogContext } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { FormField } from "../ui/form-field"
import { DialogBase, DialogButton, DialogFooter } from "../ui/dialog-base"
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

  const extractOrgName = (url: string): string => {
    const match = url.match(/^https:\/\/([^.]+)\.awsapps\.com\/start\/?$/)
    return match ? match[1] : url
  }

  const buildStartUrl = (orgName: string): string => {
    if (!orgName.trim()) return ""
    if (orgName.startsWith("https://")) return orgName
    return `https://${orgName}.awsapps.com/start`
  }

  const isValidRegion = (region: string): boolean => {
    const regionPattern = /^[a-z]{2}(-[a-z]+-\d+|-(north|south|east|west|central|northeast|southeast|northwest|southwest)-\d+)$/
    return regionPattern.test(region)
  }

  const [name, setName] = createSignal(initialSession?.name ?? "")
  const [orgName, setOrgName] = createSignal(initialSession?.startUrl ? extractOrgName(initialSession.startUrl) : "")
  const [ssoRegion, setSsoRegion] = createSignal(initialSession?.ssoRegion ?? "us-east-1")
  const [defaultRegion, setDefaultRegion] = createSignal(initialSession?.defaultRegion ?? "us-east-1")
  const [errors, setErrors] = createSignal<Record<string, string>>({})
  const [focusIndex, setFocusIndex] = createSignal(0)

  const startUrl = () => buildStartUrl(orgName())

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
          nameInput.cursorOffset = nameInput.value.length
        }
      }
    }, 1)
  })

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name().trim()) {
      newErrors.name = "Required"
    }

    if (!orgName().trim()) {
      newErrors.orgName = "Required"
    }

    if (!ssoRegion().trim()) {
      newErrors.ssoRegion = "Required"
    } else if (!isValidRegion(ssoRegion().trim())) {
      newErrors.ssoRegion = "Invalid region format"
    }

    if (!defaultRegion().trim()) {
      newErrors.defaultRegion = "Required"
    } else if (!isValidRegion(defaultRegion().trim())) {
      newErrors.defaultRegion = "Invalid region format"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

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

  const handleCancel = () => {
    dialog.clear()
    props.onCancel?.()
  }

  useKeyboard((evt) => {
    if (evt.name === "tab") {
      evt.preventDefault()
      const len = inputs().length
      const nextIndex = evt.shift
        ? (focusIndex() - 1 + len) % len
        : (focusIndex() + 1) % len
      setFocusIndex(nextIndex)
      const input = inputs()[nextIndex]
      if (input) {
        input.focus()
        input.cursorOffset = input.value.length
      }
    }

    if (evt.name === "return" && !evt.shift) {
      evt.preventDefault()
      handleSave()
    }
  })

  return (
    <DialogBase title={isEdit ? "Edit SSO Session" : "Add SSO Session"}>
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
          label="Organization"
          value={orgName()}
          onInput={setOrgName}
          error={errors().orgName}
          placeholder="myorg"
          hint={`https://${orgName().trim() || "myorg"}.awsapps.com/start`}
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

      <DialogFooter align="space-between">
        <text fg={theme.textMuted}>tab to navigate fields</text>
        <box flexDirection="row" gap={1}>
          <DialogButton
            label="Cancel"
            onClick={handleCancel}
          />
          <DialogButton
            label="Save"
            variant="primary"
            onClick={handleSave}
          />
        </box>
      </DialogFooter>
    </DialogBase>
  )
}

DialogSessionForm.show = (
  dialog: DialogContext,
  options: { mode: "create" | "edit"; session?: SSOSession }
) => {
  return new Promise<boolean>((resolve) => {
    dialog.replace(
      <DialogSessionForm
        mode={options.mode}
        session={options.session}
        onSuccess={() => resolve(true)}
        onCancel={() => resolve(false)}
      />,
      () => resolve(false)
    )
  })
}
