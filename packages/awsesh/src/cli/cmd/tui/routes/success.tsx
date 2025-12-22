import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { TextAttributes } from "@opentui/core"
import { useExit } from "../context/exit"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"

export function SuccessScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("success")
  const keybind = useKeybind()
  const command = useCommand()
  const exit = useExit()

  const printSummary = () => {
    console.log("\n AWS Credentials Set\n")
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

  command.register(() => [
    {
      id: "app.quit",
      title: "Exit",
      description: "Exit the application",
      category: "Application",
      keybind: "quit",
      onSelect: () => {
        printSummary()
        exit()
      },
    },
    {
      id: "nav.back",
      title: "Back to Accounts",
      description: "Return to account selection",
      category: "Navigation",
      keybind: "back",
      onSelect: () => {
        route.navigate({
          type: "account-select",
          sessionName: routeData.sessionName,
        })
      },
    },
  ])

  return (
    <Layout
      header={<Header title="Credentials Set" subtitle={routeData.accountName} />}
      footer={
        <Footer right={<KeybindHint keybind={keybind.print("command_list")} label="Commands" />}>
          <KeybindHint keybind={keybind.print("quit")} label="Exit" />
          <KeybindHint keybind={keybind.print("back")} label="Back" />
        </Footer>
      }
    >
      <box flexDirection="column" paddingLeft={2} paddingTop={1} gap={1}>
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
            <text fg={theme.text}>{new Date(routeData.expiration ?? "").toLocaleString()}</text>
          </box>
        </Show>
      </box>

      <box paddingLeft={2} paddingTop={2}>
        <text fg={theme.info} attributes={TextAttributes.BOLD}>
          Environment variables set:
        </text>
        <box flexDirection="column" paddingTop={0.5} gap={0.5}>
          <text fg={theme.textMuted}>AWS_PROFILE={routeData.profileName}</text>
          <text fg={theme.textMuted}>AWS_REGION={routeData.region}</text>
          <text fg={theme.textMuted}>AWS_ACCESS_KEY_ID=AKIA...</text>
          <text fg={theme.textMuted}>AWS_SECRET_ACCESS_KEY=****</text>
          <text fg={theme.textMuted}>AWS_SESSION_TOKEN=****</text>
          <Show when={routeData.expiration}>
            <text fg={theme.textMuted}>AWS_SESSION_EXPIRATION={routeData.expiration}</text>
          </Show>
        </box>
      </box>
    </Layout>
  )
}
