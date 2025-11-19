import { render } from "@opentui/solid";
import { Switch, Match } from "solid-js";
import { RouteProvider, useRoute } from "./context/route";
import { AWSProvider } from "./context/aws";
import { ExitProvider } from "./context/exit";
import { ThemeProvider, useTheme } from "./context/theme";
import { SSOSelector } from "./component/sso-selector";
import { ProfileForm } from "./component/profile-form";
import { ProfileDeleteConfirm } from "./component/profile-delete-confirm";
import { AccountSelector } from "./component/account-selector";
import { RegionSelector } from "./component/region-selector";
import { RoleSelector } from "./component/role-selector";
import { ProfileNameInput } from "./component/profile-name-input";
import { Success } from "./component/success";

/**
 * Main TUI application component
 */
function App() {
  const route = useRoute();
  const { theme } = useTheme();

  return (
    <Switch fallback={<box><text fg={theme.error}>Unknown route: {route.data.type}</text></box>}>
      <Match when={route.data.type === "sso-select"}>
        <SSOSelector />
      </Match>
      <Match when={route.data.type === "profile-form"}>
        <ProfileForm />
      </Match>
      <Match when={route.data.type === "profile-delete-confirm"}>
        <ProfileDeleteConfirm />
      </Match>
      <Match when={route.data.type === "account-select"}>
        <AccountSelector />
      </Match>
      <Match when={route.data.type === "region-select"}>
        <RegionSelector />
      </Match>
      <Match when={route.data.type === "role-select"}>
        <RoleSelector />
      </Match>
      <Match when={route.data.type === "profile-name-input"}>
        <ProfileNameInput />
      </Match>
      <Match when={route.data.type === "success"}>
        <Success />
      </Match>
    </Switch>
  );
}

/**
 * Start the TUI application
 */
export function tui(): Promise<void> {
  return new Promise<void>((resolve) => {
    render(() => (
      <ExitProvider onExit={async () => resolve()}>
        <ThemeProvider>
          <RouteProvider>
            <AWSProvider>
              <App />
            </AWSProvider>
          </RouteProvider>
        </ThemeProvider>
      </ExitProvider>
    ));

    // Handle exit
    process.on("SIGINT", () => {
      resolve();
      process.exit(0);
    });
  });
}
