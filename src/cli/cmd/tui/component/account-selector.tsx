import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show, onMount } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";

/**
 * Account Selector Component
 * Allows user to select an AWS account
 */
export function AccountSelector() {
  const aws = useAWS();
  const route = useRoute();
  const routeData = useRouteData("account-select");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [loadingAccounts, setLoadingAccounts] = createSignal(true);

  // Load accounts on mount
  onMount(async () => {
    const profile = aws.profiles.find((p) => p.name === routeData.profileName);
    if (profile) {
      await aws.loadAccounts(profile);
    }
    setLoadingAccounts(false);
  });

  // Keyboard navigation
  useKeyboard((key) => {
    if (key.name === "up" && selectedIndex() > 0) {
      setSelectedIndex(selectedIndex() - 1);
    } else if (key.name === "down" && selectedIndex() < aws.accounts.length - 1) {
      setSelectedIndex(selectedIndex() + 1);
    } else if (key.name === "enter" || key.name === "return") {
      const account = aws.accounts[selectedIndex()];
      if (account) {
        // Navigate to role selection
        route.navigate({
          type: "role-select",
          profileName: routeData.profileName,
          accountId: account.accountId,
          accountName: account.name,
        });
      }
    } else if (key.name === "escape" || key.name === "backspace") {
      // Go back to SSO selection
      route.navigate({ type: "sso-select" });
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: "cyan" }}>AWS Session Manager - Select Account</b>
        </text>
      </box>

      <box marginBottom={1}>
        <text>
          Profile: <text fg="green">{routeData.profileName}</text>
        </text>
      </box>

      <Show
        when={!loadingAccounts() && !aws.loading}
        fallback={
          <box>
            <text fg="yellow">Loading accounts...</text>
          </box>
        }
      >
        <Show
          when={aws.accounts.length > 0}
          fallback={
            <box>
              <text fg="yellow">
                No accounts found. Check your SSO configuration.
              </text>
            </box>
          }
        >
          <For each={aws.accounts}>
            {(account, index) => (
              <box marginBottom={0}>
                <text fg={index() === selectedIndex() ? "green" : undefined}>
                  {index() === selectedIndex() ? "▶ " : "  "}
                  {account.name} ({account.accountId})
                </text>
              </box>
            )}
          </For>
        </Show>
      </Show>

      <box marginTop={1}>
        <text fg="gray">
          ↑↓ Navigate • Enter Select • Esc/Backspace Back • Q Quit
        </text>
      </box>

      <Show when={aws.error}>
        <box marginTop={1}>
          <text fg="red">Error: {aws.error}</text>
        </box>
      </Show>
    </box>
  );
}
