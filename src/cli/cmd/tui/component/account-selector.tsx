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
 * Account Selector Component
 * Allows user to select an AWS account
 */
export function AccountSelector() {
  const aws = useAWS();
  const route = useRoute();
  const routeData = useRouteData("account-select");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [loadingAccounts, setLoadingAccounts] = createSignal(true);
  const [filterQuery, setFilterQuery] = createSignal("");

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
      console.error("Failed to open browser:", error);
    }
  };

  // Keyboard navigation
  useKeyboard((key) => {
    const filtered = filteredAccounts();
    
    // Handle typing for filter
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      // Skip 'o' key for browser opening
      if (key.sequence.toLowerCase() === 'o') {
        handleOpenBrowser();
      } else {
        handleFilterChange(filterQuery() + key.sequence);
      }
    } else if (key.name === "backspace" && filterQuery()) {
      handleFilterChange(filterQuery().slice(0, -1));
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
      if (filterQuery()) {
        // Clear filter on first escape
        handleFilterChange("");
      } else {
        // Go back to SSO selection
        route.navigate({ type: "sso-select" });
      }
    } else if (key.name === "q" && !filterQuery()) {
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

      {/* Filter input */}
      <Show when={filterQuery() || aws.accounts.length > 5}>
        <box marginBottom={1}>
          <text>Filter: </text>
          <text fg="yellow">{filterQuery() || "_"}</text>
          <text fg="gray"> ({filteredAccounts().length}/{aws.accounts.length})</text>
        </box>
      </Show>

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
          <Show
            when={filteredAccounts().length > 0}
            fallback={
              <box>
                <text fg="yellow">
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
                  </text>
                </box>
              )}
            </For>
          </Show>
        </Show>
      </Show>

      <box marginTop={1}>
        <text fg="gray">
          Type to filter • ↑↓ Navigate • Enter Select • O Open in browser • Esc Clear/Back • Q Quit
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
