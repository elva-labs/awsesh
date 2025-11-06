import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show, onMount, createMemo } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";

/**
 * Simple fuzzy match - checks if all characters in query appear in order in target
 */
function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < lowerTarget.length && queryIndex < lowerQuery.length; i++) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === lowerQuery.length;
}

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
  const [filterQuery, setFilterQuery] = createSignal("");

  // Load roles on mount
  onMount(async () => {
    const profile = aws.profiles.find((p) => p.name === routeData.profileName);
    if (profile) {
      const loadedRoles = await aws.loadRoles(profile, routeData.accountId);
      setRoles(loadedRoles);
    }
    setLoadingRoles(false);
  });

  // Filtered list based on query
  const filteredRoles = createMemo(() => {
    const query = filterQuery();
    if (!query) return roles();
    
    return roles().filter((role) => fuzzyMatch(query, role));
  });

  // Reset selected index when filter changes
  const handleFilterChange = (newQuery: string) => {
    setFilterQuery(newQuery);
    setSelectedIndex(0);
  };

  // Keyboard navigation
  useKeyboard((key) => {
    const filtered = filteredRoles();
    
    // Handle typing for filter
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      handleFilterChange(filterQuery() + key.sequence);
    } else if (key.name === "backspace" && filterQuery()) {
      handleFilterChange(filterQuery().slice(0, -1));
    } else if (key.name === "up" && selectedIndex() > 0) {
      setSelectedIndex(selectedIndex() - 1);
    } else if (key.name === "down" && selectedIndex() < filtered.length - 1) {
      setSelectedIndex(selectedIndex() + 1);
    } else if (key.name === "enter" || key.name === "return") {
      const roleName = filtered[selectedIndex()];
      if (roleName) {
        handleRoleSelection(roleName);
      }
    } else if (key.name === "escape") {
      if (filterQuery()) {
        // Clear filter on first escape
        handleFilterChange("");
      } else {
        // Go back to account selection
        route.navigate({
          type: "account-select",
          profileName: routeData.profileName,
        });
      }
    } else if (key.name === "q" && !filterQuery()) {
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

      {/* Filter input */}
      <Show when={filterQuery() || roles().length > 5}>
        <box marginBottom={1}>
          <text>Filter: </text>
          <text fg="yellow">{filterQuery() || "_"}</text>
          <text fg="gray"> ({filteredRoles().length}/{roles().length})</text>
        </box>
      </Show>

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
          <Show
            when={filteredRoles().length > 0}
            fallback={
              <box>
                <text fg="yellow">
                  No roles match filter "{filterQuery()}"
                </text>
              </box>
            }
          >
            <For each={filteredRoles()}>
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
      </Show>

      <box marginTop={1}>
        <text fg="gray">
          Type to filter • ↑↓ Navigate • Enter Select • Esc Clear/Back • Q Quit
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
