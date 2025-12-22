import { useTheme } from "../context/theme"
import { useKeyboard } from "@opentui/solid"
import { createSignal, onMount } from "solid-js"
import { useAWS } from "../context/aws"
import { useRoute, useRouteData } from "../context/route"
import { useExit } from "../context/exit"
import { useAwsesh } from "../context/awsesh"

export function ProfileNameInput() {
  const { theme } = useTheme()
  const aws = useAWS()
  const route = useRoute()
  const exit = useExit()
  const routeData = useRouteData("profile-name-input")
  const awsesh = useAwsesh()
  
  const defaultName = `${routeData.accountName}-${routeData.roleName}`
  const [profileName, setProfileName] = createSignal(defaultName)
  const [cursorPos, setCursorPos] = createSignal(defaultName.length)

  onMount(async () => {
    const remembered = await awsesh.profileNames.get(
      routeData.sessionName,
      routeData.accountName,
      routeData.roleName
    )
    
    if (remembered) {
      setProfileName(remembered)
      setCursorPos(remembered.length)
    }
  })

  const handleSubmit = async () => {
    const name = profileName()
    if (!name.trim()) return

    const session = aws.sessions.find((s) => s.name === routeData.sessionName)
    if (!session) return

    try {
      await awsesh.profileNames.save(
        routeData.sessionName,
        routeData.accountName,
        routeData.roleName,
        name
      )

      const result = await aws.getRoleCredentials(
        session,
        routeData.accountId,
        routeData.accountName,
        routeData.roleName,
        routeData.region,
        name
      )

      route.navigate({
        type: "success",
        sessionName: routeData.sessionName,
        accountId: routeData.accountId,
        profileName: result.profileName,
        accountName: routeData.accountName,
        roleName: routeData.roleName,
        expiration: result.expiration.toISOString(),
        region: routeData.region || session.defaultRegion,
      })
    } catch {
    }
  }

  useKeyboard((key) => {
    const current = profileName()
    const pos = cursorPos()

    if (key.name === "enter" || key.name === "return") {
      handleSubmit()
    } else if (key.name === "escape" || key.name === "backspace" && !current) {
      route.navigate({
        type: "role-select",
        sessionName: routeData.sessionName,
        accountId: routeData.accountId,
        accountName: routeData.accountName,
      })
    } else if (key.name === "backspace" && current) {
      if (pos > 0) {
        setProfileName(current.slice(0, pos - 1) + current.slice(pos))
        setCursorPos(pos - 1)
      }
    } else if (key.name === "delete" && pos < current.length) {
      setProfileName(current.slice(0, pos) + current.slice(pos + 1))
    } else if (key.name === "left" && pos > 0) {
      setCursorPos(pos - 1)
    } else if (key.name === "right" && pos < current.length) {
      setCursorPos(pos + 1)
    } else if (key.name === "home") {
      setCursorPos(0)
    } else if (key.name === "end") {
      setCursorPos(current.length)
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      if (/^[a-zA-Z0-9\-_]$/.test(key.sequence)) {
        setProfileName(current.slice(0, pos) + key.sequence + current.slice(pos))
        setCursorPos(pos + 1)
      }
    } else if (key.sequence?.toLowerCase() === "q" && key.ctrl) {
      exit()
    }
  })

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: theme.accent }}>Enter Custom Profile Name</b>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          SSO Session: <text fg={theme.success}>{routeData.sessionName}</text>
        </text>
        <text>
          Account: <text fg={theme.success}>{routeData.accountName}</text> ({routeData.accountId})
        </text>
        <text>
          Role: <text fg={theme.success}>{routeData.roleName}</text>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          <b>Profile name:</b>
        </text>
        <box>
          <text fg={theme.warning}>{profileName()}</text>
          <text fg={theme.textMuted}>_</text>
        </box>
        <text fg={theme.textMuted} marginTop={0}>
          (alphanumeric, dash, underscore only)
        </text>
        <text fg={theme.textMuted} marginTop={0}>
          This name will be remembered for future sessions
        </text>
      </box>

      <box marginTop={1}>
        <text fg={theme.textMuted}>
          Enter Confirm - Esc/Backspace Back - Ctrl+Q Quit
        </text>
      </box>
    </box>
  )
}
