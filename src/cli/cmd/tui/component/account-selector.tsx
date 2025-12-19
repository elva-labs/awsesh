import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show, onMount, createMemo } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";
import { useExit } from "../context/exit";
import { useTheme } from "../context/theme";
import { Global } from "@/global";
import { Log } from "@/util/log";
import type { InputRenderable } from "@opentui/core";

const log = Log.create({ service: "account-selector" });

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
 * Account Selector Component
 * Allows user to select an AWS account
 */
export function AccountSelector() {
  const aws = useAWS();
  const route = useRoute();
  const exit = useExit();
  const { theme } = useTheme();
  const routeData = useRouteData("account-select");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [loadingAccounts, setLoadingAccounts] = createSignal(true);
  const [filterQuery, setFilterQuery] = createSignal("");
  const [filterMode, setFilterMode] = createSignal(false);
  
  let inputRef: InputRenderable | undefined;

  // Load accounts on mount
  onMount(async () => {
    const profile = aws.profiles.find((p) => p.name === routeData.profileName);
    if (profile) {
      await aws.loadAccounts(profile);
    }
    setLoadingAccounts(false);
  });

  // Filtered list based on query
  const filteredAccounts = createMemo(() => {
    const query = filterQuery();
    if (!query) return aws.accounts;
    
    return aws.accounts.filter((account) => 
      fuzzyMatch(query, account.name) || fuzzyMatch(query, account.accountId)
    );
  });

  // Reset selected index when filter changes
  const handleFilterChange = (newQuery: string) => {
    setFilterQuery(newQuery);
    setSelectedIndex(0);
  };

  // Handle opening AWS console for account in browser
  const handleOpenBrowser = async () => {
    const account = filteredAccounts()[selectedIndex()];
    if (!account) return;
    
    const profile = aws.profiles.find((p) => p.name === routeData.profileName);
    if (!profile) return;
    
    try {
      // For accounts, we open the general account console
      // The URL format is: https://console.aws.amazon.com/console/home?region=<region>#
      const region = "us-east-1"; // Default region
      const url = `https://${account.accountId}.signin.aws.amazon.com/console/home?region=${region}`;
      
      const { openBrowser } = await import("@/util/browser.js");
      await openBrowser(url);
    } catch (error) {
      log.error("Failed to open browser", { error, accountId: account.accountId });
    }
  };

  // Check if we're over threshold for lazy loading
  const rolesLazyLoaded = createMemo(() => 
    aws.accounts.length > Global.Limits.maxAccountsForRoleLoading
  );

  // Keyboard navigation
  useKeyboard((key) => {
    const filtered = filteredAccounts();
    
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
        const account = filtered[selectedIndex()];
        if (account) {
          // Clear filter and exit filter mode
          setFilterMode(false);
          handleFilterChange("");
          inputRef?.blur();
          // Navigate to role selection
          route.navigate({
            type: "role-select",
            profileName: routeData.profileName,
            accountId: account.accountId,
            accountName: account.name,
          });
        }
      }
      // Let input handle other keys
      return;
    }
    
    // Handle Shift+R for refresh
    if (key.shift && key.sequence?.toLowerCase() === 'r') {
      aws.refreshAccounts();
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
      } else if (lowerKey === 'r') {
        // Navigate to region selection
        const account = filtered[selectedIndex()];
        if (!account) return;
        
        route.navigate({
          type: "region-select",
          profileName: routeData.profileName,
          accountId: account.accountId,
          accountName: account.name,
        });
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
        route.navigate({ type: "sso-select" });
      }
    } else if (key.name === "up" && selectedIndex() > 0) {
      setSelectedIndex(selectedIndex() - 1);
    } else if (key.name === "down" && selectedIndex() < filtered.length - 1) {
      setSelectedIndex(selectedIndex() + 1);
    } else if (key.name === "enter" || key.name === "return") {
      const account = filtered[selectedIndex()];
      if (account) {
        // Navigate to role selection
        route.navigate({
          type: "role-select",
          profileName: routeData.profileName,
          accountId: account.accountId,
          accountName: account.name,
        });
      }
    } else if (key.name === "escape") {
      // Go back to SSO selection
      route.navigate({ type: "sso-select" });
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: theme.accent }}>AWS Session Manager - Select Account</b>
        </text>
      </box>

      <box marginBottom={1}>
        <text>
          Profile: <text fg={theme.success}>{routeData.profileName}</text>
        </text>
      </box>

      {/* Refresh indicator */}
      <Show when={aws.refreshing}>
        <box marginBottom={1}>
          <text fg={theme.info}>⟳ Refreshing accounts...</text>
        </box>
      </Show>

      {/* Lazy loading info */}
      <Show when={rolesLazyLoaded() && !aws.refreshing}>
        <box marginBottom={1}>
          <text fg={theme.textMuted}>ℹ Roles will be loaded when you select an account ({aws.accounts.length} accounts)</text>
        </box>
      </Show>

      {/* Filter input */}
      <Show when={filterMode()}>
        <box marginBottom={1} flexDirection="column">
          <box>
            <text>Filter: </text>
            <input
              ref={(r) => (inputRef = r)}
              onInput={(value) => handleFilterChange(value)}
              placeholder="Type to filter..."
              focusedBackgroundColor={theme.background}
              cursorColor={theme.primary}
              focusedTextColor={theme.text}
            />
          </box>
          <box marginLeft={8}>
            <text fg={theme.textMuted}>Matches: {filteredAccounts().length}/{aws.accounts.length}</text>
          </box>
        </box>
      </Show>

      <Show
        when={!loadingAccounts() && !aws.loading}
        fallback={
          <box>
            <text fg={theme.warning}>Loading accounts...</text>
          </box>
        }
      >
        <Show
          when={aws.accounts.length > 0}
          fallback={
            <box>
              <text fg={theme.warning}>
                No accounts found. Check your SSO configuration.
              </text>
            </box>
          }
        >
          <Show
            when={filteredAccounts().length > 0}
            fallback={
              <box>
                <text fg={theme.warning}>
                  No accounts match filter "{filterQuery()}"
                </text>
              </box>
            }
          >
            <For each={filteredAccounts()}>
              {(account, index) => (
                <box marginBottom={0}>
                  <text fg={index() === selectedIndex() ? "green" : undefined}>
                    {index() === selectedIndex() ? "▶ " : "  "}
                    {account.name} ({account.accountId})
                    <Show when={account.rolesLoaded}>
                      <text fg={theme.textMuted}> • {account.roles.length} roles</text>
                    </Show>
                  </text>
                </box>
              )}
            </For>
          </Show>
        </Show>
      </Show>

      <box marginTop={1}>
        <text fg={theme.textMuted}>
          / Filter • ↑↓/jk Navigate • h Back • Enter Select • Shift+R Refresh • R Region • O Open • Esc Back • Q Quit
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
