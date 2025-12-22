import { useTheme } from "../context/theme";
import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show, onMount, createMemo } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";
import { useExit } from "../context/exit";
import { Log } from "@/util/log";
import type { InputRenderable } from "@opentui/core";

const log = Log.create({ service: "role-selector" });

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
  const { theme } = useTheme();
  const aws = useAWS();
  const route = useRoute();
  const exit = useExit();
  const routeData = useRouteData("role-select");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [roles, setRoles] = createSignal<string[]>([]);
  const [loadingRoles, setLoadingRoles] = createSignal(true);
  const [filterQuery, setFilterQuery] = createSignal("");
  const [filterMode, setFilterMode] = createSignal(false);
  
  let inputRef: InputRenderable | undefined;

  // Load roles on mount
  onMount(async () => {
    const session = aws.sessions.find((s) => s.name === routeData.sessionName);
    if (session) {
      // Check if roles are already loaded
      const account = aws.accounts.find(a => a.accountId === routeData.accountId);
      if (account?.rolesLoaded) {
        setRoles(account.roles);
        setLoadingRoles(false);
      } else {
        const loadedRoles = await aws.loadRoles(session, routeData.accountId);
        setRoles(loadedRoles);
        setLoadingRoles(false);
      }
    }
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

  // Handle opening AWS console with role in browser
  const handleOpenBrowser = async () => {
    const roleName = filteredRoles()[selectedIndex()];
    if (!roleName) return;
    
    const session = aws.sessions.find((s) => s.name === routeData.sessionName);
    if (!session) return;
    
    try {
      const portalUrl = session.startUrl.replace(/\/start\/?$/, "");
      const url = `${portalUrl}/start/#/console?account_id=${routeData.accountId}&role_name=${roleName}`;
      
      const { openBrowser } = await import("@/util/browser.js");
      await openBrowser(url);
    } catch (error) {
      log.error("Failed to open browser", { error, role: roleName, accountId: routeData.accountId });
    }
  };

  // Handle refresh roles
  const handleRefreshRoles = async () => {
    const session = aws.sessions.find((s) => s.name === routeData.sessionName);
    if (!session) return;
    
    await aws.refreshRoles(session, routeData.accountId);
    
    // Update local roles
    const account = aws.accounts.find(a => a.accountId === routeData.accountId);
    if (account?.rolesLoaded) {
      setRoles(account.roles);
    }
  };

  // Keyboard navigation
  useKeyboard((key) => {
    const filtered = filteredRoles();
    
    // If in filter mode, handle filter-specific keys
    if (filterMode()) {
      if (key.name === "escape") {
        // Exit filter mode
        setFilterMode(false);
        handleFilterChange("");
        inputRef?.blur();
      } else if (key.name === "up" || (key.sequence?.toLowerCase() === 'k' && !key.ctrl)) {
        // Navigate up in filtered results
        if (selectedIndex() > 0) {
          setSelectedIndex(selectedIndex() - 1);
        }
      } else if (key.name === "down" || (key.sequence?.toLowerCase() === 'j' && !key.ctrl)) {
        // Navigate down in filtered results
        if (selectedIndex() < filtered.length - 1) {
          setSelectedIndex(selectedIndex() + 1);
        }
      } else if (key.name === "enter" || key.name === "return") {
        // Select current item
        const roleName = filtered[selectedIndex()];
        if (roleName) {
          setFilterMode(false);
          handleFilterChange("");
          inputRef?.blur();
          handleRoleSelection(roleName);
        }
      }
      // Let input handle other keys
      return;
    }
    
    // Navigation mode - handle special keybindings
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const lowerKey = key.sequence.toLowerCase();
      
      if (lowerKey === '/') {
        // Enter filter mode
        setFilterMode(true);
        setTimeout(() => inputRef?.focus(), 0);
      } else if (lowerKey === 'o') {
        handleOpenBrowser();
      } else if (lowerKey === 'p') {
        // Navigate to custom profile name input
        const roleName = filtered[selectedIndex()];
        if (!roleName) return;
        
        route.navigate({
          type: "profile-name-input",
          sessionName: routeData.sessionName,
          accountId: routeData.accountId,
          accountName: routeData.accountName,
          roleName,
          region: routeData.region,
        });
      } else if (lowerKey === 'r') {
        // Refresh roles
        handleRefreshRoles();
      } else if (lowerKey === 'q') {
        exit();
      } else if (lowerKey === 'k') {
        // Vim up
        if (selectedIndex() > 0) {
          setSelectedIndex(selectedIndex() - 1);
        }
      } else if (lowerKey === 'j') {
        // Vim down
        if (selectedIndex() < filtered.length - 1) {
          setSelectedIndex(selectedIndex() + 1);
        }
      } else if (lowerKey === 'h') {
        // Vim left - go back
        route.navigate({
          type: "account-select",
          sessionName: routeData.sessionName,
        });
      }
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
      // Go back to account selection
      route.navigate({
        type: "account-select",
        sessionName: routeData.sessionName,
      });
    }
  });

  async function handleRoleSelection(roleName: string) {
    const session = aws.sessions.find((s) => s.name === routeData.sessionName);
    if (!session) return;

    try {
      const result = await aws.getRoleCredentials(
        session,
        routeData.accountId,
        routeData.accountName,
        roleName,
        routeData.region
      );

      route.navigate({
        type: "success",
        sessionName: routeData.sessionName,
        accountId: routeData.accountId,
        profileName: result.profileName,
        accountName: routeData.accountName,
        roleName,
        expiration: result.expiration.toISOString(),
        region: routeData.region || session.defaultRegion,
      });
    } catch (e) {
      // Error will be shown via aws.error
    }
  }

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: theme.accent }}>AWS Session Manager - Select Role</b>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          SSO Session: <text fg={theme.success}>{routeData.sessionName}</text>
        </text>
        <text>
          Account: <text fg={theme.success}>{routeData.accountName}</text> (
          {routeData.accountId})
        </text>
        <Show when={routeData.region}>
          <text>
            Region: <text fg={theme.success}>{routeData.region}</text>
          </text>
        </Show>
      </box>

      {/* Refresh indicator */}
      <Show when={aws.refreshingRoles}>
        <box marginBottom={1}>
          <text fg={theme.info}>⟳ Refreshing roles...</text>
        </box>
      </Show>

      {/* Filter input */}
      <Show when={filterMode()}>
        <box marginBottom={1} flexDirection="column">
          <box>
            <text>Filter: </text>
            <input
              ref={(r) => { inputRef = r }}
              onInput={(value) => handleFilterChange(value)}
              placeholder="Type to filter..."
              focusedBackgroundColor={theme.background}
              cursorColor={theme.primary}
              focusedTextColor={theme.text}
            />
          </box>
          <box marginLeft={8}>
            <text fg={theme.textMuted}>Matches: {filteredRoles().length}/{roles().length}</text>
          </box>
        </box>
      </Show>

      <Show
        when={!loadingRoles() && !aws.loading && !aws.refreshingRoles}
        fallback={
          <box>
            <text fg={theme.warning}>Loading roles...</text>
          </box>
        }
      >
        <Show
          when={roles().length > 0}
          fallback={
            <box>
              <text fg={theme.warning}>
                No roles found for this account. Check your IAM permissions.
              </text>
            </box>
          }
        >
          <Show
            when={filteredRoles().length > 0}
            fallback={
              <box>
                <text fg={theme.warning}>
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
        <text fg={theme.textMuted}>
          / Filter • ↑↓/jk Navigate • h Back • Enter Select • R Refresh • P Custom name • O Open • Esc Back • Q Quit
        </text>
      </box>

      <Show when={aws.error}>
        <box marginTop={1}>
          <text fg={theme.error}>Error: {aws.error}</text>
        </box>
      </Show>
    </box>
  );
}
