import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show, onMount } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";

/**
 * Role Selector Component
 * Allows user to select an IAM role for an account
 */
export function RoleSelector() {
  const aws = useAWS();
  const route = useRoute();
  const routeData = useRouteData("role-select");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [roles, setRoles] = createSignal<string[]>([]);
  const [loadingRoles, setLoadingRoles] = createSignal(true);

  // Load roles on mount
  onMount(async () => {
    const profile = aws.profiles.find((p) => p.name === routeData.profileName);
    if (profile) {
      const loadedRoles = await aws.loadRoles(profile, routeData.accountId);
      setRoles(loadedRoles);
    }
    setLoadingRoles(false);
  });

  // Keyboard navigation
  useKeyboard((key) => {
    if (key.name === "up" && selectedIndex() > 0) {
      setSelectedIndex(selectedIndex() - 1);
    } else if (key.name === "down" && selectedIndex() < roles().length - 1) {
      setSelectedIndex(selectedIndex() + 1);
    } else if (key.name === "enter" || key.name === "return") {
      const roleName = roles()[selectedIndex()];
      if (roleName) {
        handleRoleSelection(roleName);
      }
    } else if (key.name === "escape" || key.name === "backspace") {
      // Go back to account selection
      route.navigate({
        type: "account-select",
        profileName: routeData.profileName,
      });
    } else if (key.name === "q") {
      process.exit(0);
    }
  });

  async function handleRoleSelection(roleName: string) {
    const profile = aws.profiles.find((p) => p.name === routeData.profileName);
    if (!profile) return;

    try {
      // Get credentials and write to file
      await aws.getRoleCredentials(
        profile,
        routeData.accountId,
        routeData.accountName,
        roleName
      );

      // Navigate to success screen
      route.navigate({
        type: "success",
        profileName: routeData.profileName,
        accountName: routeData.accountName,
        roleName,
      });
    } catch (e) {
      // Error will be shown via aws.error
    }
  }

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: "cyan" }}>AWS Session Manager - Select Role</b>
        </text>
      </box>

      <box marginBottom={1}>
        <text>
          Profile: <text fg="green">{routeData.profileName}</text>
        </text>
        <text>
          Account: <text fg="green">{routeData.accountName}</text> (
          {routeData.accountId})
        </text>
      </box>

      <Show
        when={!loadingRoles() && !aws.loading}
        fallback={
          <box>
            <text fg="yellow">Loading roles...</text>
          </box>
        }
      >
        <Show
          when={roles().length > 0}
          fallback={
            <box>
              <text fg="yellow">
                No roles found for this account. Check your IAM permissions.
              </text>
            </box>
          }
        >
          <For each={roles()}>
            {(role, index) => (
              <box marginBottom={0}>
                <text fg={index() === selectedIndex() ? "green" : undefined}>
                  {index() === selectedIndex() ? "▶ " : "  "}
                  {role}
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
