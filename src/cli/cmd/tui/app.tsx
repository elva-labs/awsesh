import { render } from "@opentui/solid";
import { Switch, Match } from "solid-js";
import { RouteProvider, useRoute } from "./context/route";
import { AWSProvider } from "./context/aws";
import { SSOSelector } from "./component/sso-selector";
import { AccountSelector } from "./component/account-selector";
import { RoleSelector } from "./component/role-selector";
import { ProfileNameInput } from "./component/profile-name-input";
import { Success } from "./component/success";

/**
 * Main TUI application component
 */
function App() {
  const route = useRoute();

  return (
    <Switch>
      <Match when={route.data.type === "sso-select"}>
        <SSOSelector />
      </Match>
      <Match when={route.data.type === "account-select"}>
        <AccountSelector />
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
      <RouteProvider>
        <AWSProvider>
          <App />
        </AWSProvider>
      </RouteProvider>
    ));

    // Handle exit
    process.on("SIGINT", () => {
      resolve();
      process.exit(0);
    });
  });
}
