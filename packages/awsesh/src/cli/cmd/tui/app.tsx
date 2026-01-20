import { render, useTerminalDimensions, useRenderer } from "@opentui/solid";
import { copyToClipboard } from "@/util/clipboard";
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
import { ToastProvider, useToast } from "./ui/toast";
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
  const renderer = useRenderer();
  const toast = useToast();

  renderer.console.onCopySelection = async (text: string) => {
    if (!text || text.length === 0) return;
    const base64 = Buffer.from(text).toString("base64");
    const osc52 = `\x1b]52;c;${base64}\x07`;
    const finalOsc52 = process.env.TMUX ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52;
    (renderer as { writeOut?: (data: string) => void }).writeOut?.(finalOsc52);
    await copyToClipboard(text);
    toast.show({ message: "Copied to clipboard", variant: "info" });
    renderer.clearSelection();
  };

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      backgroundColor={theme.background}
      onMouseUp={async () => {
        const text = renderer.getSelection()?.getSelectedText();
        if (text && text.length > 0) {
          const base64 = Buffer.from(text).toString("base64");
          const osc52 = `\x1b]52;c;${base64}\x07`;
          const finalOsc52 = process.env.TMUX ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52;
          (renderer as { writeOut?: (data: string) => void }).writeOut?.(finalOsc52);
          await copyToClipboard(text);
          toast.show({ message: "Copied to clipboard", variant: "info" });
          renderer.clearSelection();
        }
      }}
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
    printSessionInfo({
      sessionName: lastSet.sessionName,
      accountName: lastSet.accountName,
      accountId: lastSet.accountId,
      roleName: lastSet.roleName,
      region: lastSet.region ?? "unknown",
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
        consoleOptions: {
          keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
          onCopySelection: (text) => {
            copyToClipboard(text).catch((error) => {
              console.error(`Failed to copy console selection to clipboard: ${error}`);
            });
          },
        },
      },
    );
  });
}
