import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "../context/keybind"
import { TextAttributes } from "@opentui/core"
import { useExit } from "../context/exit"

export function SuccessScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("success")
  const keybind = useKeybind()
  const exit = useExit()

  const printSummary = () => {
    console.log("\n✓ AWS Credentials Set\n")
    console.log(`  Profile:    ${routeData.profileName}`)
    console.log(`  SSO:        ${routeData.profileName}`)
    console.log(`  Account:    ${routeData.accountName} (${routeData.accountId})`)
    console.log(`  Role:       ${routeData.roleName}`)
    console.log(`  Region:     ${routeData.region}`)
    if (routeData.expiration) {
      console.log(`  Expires:    ${new Date(routeData.expiration).toISOString()}`)
    }
    console.log("")
  }

  useKeyboard((evt) => {
    if (keybind.match("quit", evt)) {
      evt.preventDefault()
      printSummary()
      exit()
    }

    if (keybind.match("back", evt)) {
      evt.preventDefault()
      route.navigate({
        type: "account-select",
        profileName: routeData.profileName,
      })
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%" gap={2}>
      <box paddingLeft={1} paddingTop={1}>
        <text fg={theme.success} attributes={TextAttributes.BOLD}>
          ✓ Credentials Set
        </text>
      </box>

      <box flexDirection="column" paddingLeft={2} gap={1}>
        <box flexDirection="row">
          <box width={15}>
            <text fg={theme.textMuted}>Profile:</text>
          </box>
          <text fg={theme.text}>{routeData.profileName}</text>
        </box>

        <box flexDirection="row">
          <box width={15}>
            <text fg={theme.textMuted}>SSO:</text>
          </box>
          <text fg={theme.text}>{routeData.profileName}</text>
        </box>

        <box flexDirection="row">
          <box width={15}>
            <text fg={theme.textMuted}>Account:</text>
          </box>
          <text fg={theme.text}>
            {routeData.accountName} ({routeData.accountId})
          </text>
        </box>

        <box flexDirection="row">
          <box width={15}>
            <text fg={theme.textMuted}>Role:</text>
          </box>
          <text fg={theme.text}>{routeData.roleName}</text>
        </box>

        <box flexDirection="row">
          <box width={15}>
            <text fg={theme.textMuted}>Region:</text>
          </box>
          <text fg={theme.text}>{routeData.region}</text>
        </box>

        <Show when={routeData.expiration}>
          <box flexDirection="row">
            <box width={15}>
              <text fg={theme.textMuted}>Expires:</text>
            </box>
            <text fg={theme.text}>{new Date(routeData.expiration!).toLocaleString()}</text>
          </box>
        </Show>
      </box>

      <box paddingLeft={2} paddingTop={1}>
        <text fg={theme.info} attributes={TextAttributes.BOLD}>
          Environment variables set:
        </text>
        <box flexDirection="column" paddingTop={0.5} gap={0.5}>
          <text fg={theme.textMuted}>• AWS_PROFILE={routeData.profileName}</text>
          <text fg={theme.textMuted}>• AWS_REGION={routeData.region}</text>
          <text fg={theme.textMuted}>• AWS_ACCESS_KEY_ID=AKIA...</text>
          <text fg={theme.textMuted}>• AWS_SECRET_ACCESS_KEY=****</text>
          <text fg={theme.textMuted}>• AWS_SESSION_TOKEN=****</text>
          <Show when={routeData.expiration}>
            <text fg={theme.textMuted}>
              • AWS_SESSION_EXPIRATION={routeData.expiration}
            </text>
          </Show>
        </box>
      </box>

      <box paddingLeft={1} paddingTop={2} flexDirection="row" gap={2}>
        <text>
          <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
            {keybind.print("quit")}
          </span>
          <span style={{ fg: theme.textMuted }}> Exit</span>
        </text>
        <text>
          <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
            {keybind.print("back")}
          </span>
          <span style={{ fg: theme.textMuted }}> Back to Accounts</span>
        </text>
      </box>
    </box>
  )
}
