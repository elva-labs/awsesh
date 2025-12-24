import { render, useTerminalDimensions } from "@opentui/solid"
import { Switch, Match } from "solid-js"
import { RouteProvider, useRoute } from "./context/route"
import { AwseshProvider } from "./context/awsesh"
import { AWSProvider } from "./context/aws"
import { ExitProvider } from "./context/exit"
import { ThemeProvider, useTheme } from "./context/theme"
import { KVProvider } from "./context/kv"
import { ConfigProvider } from "./context/config"
import { KeybindProvider } from "./context/keybind"
import { CommandProvider } from "./context/command"
import { MigrationProvider } from "./context/migration"
import { CredentialsProvider } from "./context/credentials"
import { DialogProvider } from "./ui/dialog"
import { ToastProvider } from "./ui/toast"
import { SessionListScreen } from "./routes/session-list"
import { AccountListScreen } from "./routes/account-list"
import { Terminal } from "./util/terminal"

function App() {
  const route = useRoute()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  return (
    <box width={dimensions().width} height={dimensions().height} backgroundColor={theme.background}>
      <Switch fallback={<box><text fg={theme.error}>Unknown route: {route.data.type}</text></box>}>
        <Match when={route.data.type === "sso-select"}>
          <SessionListScreen />
        </Match>
        <Match when={route.data.type === "account-select"}>
          <AccountListScreen />
        </Match>
      </Switch>
    </box>
  )
}

export async function tui(): Promise<void> {
  const mode = await Terminal.getTerminalBackgroundColor()
  
  return new Promise<void>((resolve) => {
    render(
      () => (
        <ExitProvider onExit={async () => resolve()}>
          <KVProvider>
            <ConfigProvider>
              <RouteProvider>
                <ThemeProvider mode={mode}>
                  <KeybindProvider>
                    <AwseshProvider>
                      <AWSProvider>
                        <CredentialsProvider>
                          <ToastProvider>
                            <DialogProvider>
                              <MigrationProvider>
                                <CommandProvider>
                                  <App />
                                </CommandProvider>
                              </MigrationProvider>
                            </DialogProvider>
                          </ToastProvider>
                        </CredentialsProvider>
                      </AWSProvider>
                    </AwseshProvider>
                  </KeybindProvider>
                </ThemeProvider>
              </RouteProvider>
            </ConfigProvider>
          </KVProvider>
        </ExitProvider>
      ),
      {
        targetFps: 60,
        gatherStats: false,
        exitOnCtrlC: false,
        useKittyKeyboard: {},
      }
    )
  })
}
