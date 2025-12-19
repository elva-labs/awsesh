import { render, useTerminalDimensions } from "@opentui/solid"
import { Switch, Match } from "solid-js"
import { RouteProvider, useRoute } from "./context/route"
import { AWSProvider } from "./context/aws"
import { ExitProvider } from "./context/exit"
import { ThemeProvider, useTheme } from "./context/theme"
import { KVProvider } from "./context/kv"
import { ConfigProvider } from "./context/config"
import { KeybindProvider } from "./context/keybind"
import { CommandProvider } from "./context/command"
import { DialogProvider } from "./ui/dialog"
import { ToastProvider } from "./ui/toast"
import { ProfileListScreen } from "./routes/profile-list"
import { ProfileFormScreen } from "./routes/profile-form"
import { ProfileDeleteConfirmScreen } from "./routes/profile-delete-confirm"
import { SSOLoginScreen } from "./routes/sso-login"
import { AccountListScreen } from "./routes/account-list"
import { SuccessScreen } from "./routes/success"

function App() {
  const route = useRoute()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  return (
    <box width={dimensions().width} height={dimensions().height} backgroundColor={theme.background}>
      <Switch fallback={<box><text fg={theme.error}>Unknown route: {route.data.type}</text></box>}>
        <Match when={route.data.type === "sso-select"}>
          <ProfileListScreen />
        </Match>
        <Match when={route.data.type === "profile-form"}>
          <ProfileFormScreen />
        </Match>
        <Match when={route.data.type === "profile-delete-confirm"}>
          <ProfileDeleteConfirmScreen />
        </Match>
        <Match when={route.data.type === "sso-login"}>
          <SSOLoginScreen />
        </Match>
        <Match when={route.data.type === "account-select"}>
          <AccountListScreen />
        </Match>
        <Match when={route.data.type === "success"}>
          <SuccessScreen />
        </Match>
      </Switch>
    </box>
  )
}

export function tui(): Promise<void> {
  return new Promise<void>((resolve) => {
    render(
      () => (
        <ExitProvider onExit={async () => resolve()}>
          <KVProvider>
            <ConfigProvider>
              <RouteProvider>
                <ThemeProvider>
                  <KeybindProvider>
                    <DialogProvider>
                      <ToastProvider>
                        <CommandProvider>
                          <AWSProvider>
                            <App />
                          </AWSProvider>
                        </CommandProvider>
                      </ToastProvider>
                    </DialogProvider>
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
