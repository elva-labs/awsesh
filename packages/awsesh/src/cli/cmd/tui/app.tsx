import { render, useTerminalDimensions } from "@opentui/solid";
import { Switch, Match } from "solid-js";
import { RouteProvider, useRoute } from "./context/route";
import { AwseshProvider } from "./context/awsesh";
import { AWSProvider } from "./context/aws";
import { ExitProvider } from "./context/exit";
import { ThemeProvider, useTheme } from "./context/theme";
import { KVProvider } from "./context/kv";
import { ConfigProvider } from "./context/config";
import { KeybindProvider } from "./context/keybind";
import { CommandProvider } from "./context/command";
import { MigrationProvider } from "./context/migration";
import { CredentialsProvider } from "./context/credentials";
import { DialogProvider } from "./ui/dialog";
import { ToastProvider } from "./ui/toast";
import { SessionListScreen } from "./routes/session-list";
import { AccountListScreen } from "./routes/account-list";
import { CredentialsScreen } from "./routes/credentials";
import { Terminal } from "./util/terminal";
import { getAwsesh } from "@/instance";
import { printSessionInfo } from "@/util/styled-output";
import { wereCredentialsSet } from "./context/session-state";

function App() {
  const route = useRoute();
  const { theme } = useTheme();
  const dimensions = useTerminalDimensions();

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      backgroundColor={theme.background}
    >
      <Switch
        fallback={
          <box>
            <text fg={theme.error}>Unknown route: {route.data.type}</text>
          </box>
        }
      >
        <Match when={route.data.type === "sso-select"}>
          <SessionListScreen />
        </Match>
        <Match when={route.data.type === "account-select"}>
          <AccountListScreen />
        </Match>
        <Match when={route.data.type === "credentials"}>
          <CredentialsScreen />
        </Match>
      </Switch>
    </box>
  );
}

async function printLastSetCredential(): Promise<void> {
  if (!wereCredentialsSet()) return

  const awsesh = getAwsesh();
  const lastSet = await awsesh.lastSetCredential.get();
  if (lastSet) {
    const session = await awsesh.sessions.get(lastSet.sessionName);
    printSessionInfo({
      sessionName: lastSet.sessionName,
      accountName: lastSet.accountName,
      accountId: lastSet.accountId,
      roleName: lastSet.roleName,
      region: lastSet.region ?? session?.defaultRegion ?? "unknown",
      profileName: lastSet.profileName,
    });
  }
}

export async function tui(): Promise<void> {
  const mode = await Terminal.getTerminalBackgroundColor();

  return new Promise<void>((resolve) => {
    render(
      () => (
        <ExitProvider
          onExit={async () => {
            await printLastSetCredential();
            resolve();
          }}
        >
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
      },
    );
  });
}
