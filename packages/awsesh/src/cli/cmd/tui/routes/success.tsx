import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { useConfig } from "../context/config"
import { useExit } from "../context/exit"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"
import { DateUtil } from "@/util/date"

export function SuccessScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("success")
  const keybind = useKeybind()
  const command = useCommand()
  const config = useConfig()
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
      <box flexDirection="column" paddingLeft={2} paddingTop={1}>
        <box flexDirection="row">
          <box width={12}>
            <text fg={theme.textMuted}>Profile</text>
          </box>
          <text fg={theme.text}>{routeData.profileName}</text>
        </box>
        <box flexDirection="row">
          <box width={12}>
            <text fg={theme.textMuted}>SSO</text>
          </box>
          <text fg={theme.text}>{routeData.profileName}</text>
        </box>
        <box flexDirection="row">
          <box width={12}>
            <text fg={theme.textMuted}>Account</text>
          </box>
          <text fg={theme.text}>
            {routeData.accountName} ({routeData.accountId})
          </text>
        </box>
        <box flexDirection="row">
          <box width={12}>
            <text fg={theme.textMuted}>Role</text>
          </box>
          <text fg={theme.text}>{routeData.roleName}</text>
        </box>
        <box flexDirection="row">
          <box width={12}>
            <text fg={theme.textMuted}>Region</text>
          </box>
          <text fg={theme.text}>{routeData.region}</text>
        </box>
        <Show when={routeData.expiration}>
          {(expiration) => (
            <box flexDirection="row">
              <box width={12}>
                <text fg={theme.textMuted}>Expires</text>
              </box>
              <text fg={theme.text}>
                {DateUtil.format(expiration(), config.data.dateFormat, config.data.timeFormat)}
              </text>
            </box>
          )}
        </Show>
      </box>
    </Layout>
  )
}
