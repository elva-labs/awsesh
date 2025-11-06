import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show, createMemo } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute } from "../context/route";

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
 * SSO Profile Selector Component
 * Allows user to select or create an SSO profile
 */
export function SSOSelector() {
  const aws = useAWS();
  const route = useRoute();
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [filterQuery, setFilterQuery] = createSignal("");

  // Filtered list based on query
  const filteredProfiles = createMemo(() => {
    const query = filterQuery();
    if (!query) return aws.profiles;
    
    return aws.profiles.filter((profile) => 
      fuzzyMatch(query, profile.name) || fuzzyMatch(query, profile.startUrl)
    );
  });

  // Reset selected index when filter changes
  const handleFilterChange = (newQuery: string) => {
    setFilterQuery(newQuery);
    setSelectedIndex(0);
  };

  // Keyboard navigation
  useKeyboard((key) => {
    const filtered = filteredProfiles();
    
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
      const profile = filtered[selectedIndex()];
      if (profile) {
        // Navigate to account selection
        route.navigate({
          type: "account-select",
          profileName: profile.name,
        });
      }
    } else if (key.name === "escape") {
      if (filterQuery()) {
        // Clear filter on first escape
        handleFilterChange("");
      } else {
        // Exit on second escape
        process.exit(0);
      }
    } else if (key.name === "q" && !filterQuery()) {
      process.exit(0);
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: "cyan" }}>AWS Session Manager - Select SSO Profile</b>
        </text>
      </box>

      {/* Filter input */}
      <Show when={filterQuery() || aws.profiles.length > 5}>
        <box marginBottom={1}>
          <text>Filter: </text>
          <text fg="yellow">{filterQuery() || "_"}</text>
          <text fg="gray"> ({filteredProfiles().length}/{aws.profiles.length})</text>
        </box>
      </Show>

      <Show
        when={aws.profiles.length > 0}
        fallback={
          <box>
            <text fg="yellow">
              No SSO profiles found. Create one with: awsesh auth &lt;profile-name&gt;
            </text>
          </box>
        }
      >
        <Show
          when={filteredProfiles().length > 0}
          fallback={
            <box>
              <text fg="yellow">
                No profiles match filter "{filterQuery()}"
              </text>
            </box>
          }
        >
          <For each={filteredProfiles()}>
            {(profile, index) => (
              <box marginBottom={0}>
                <text fg={index() === selectedIndex() ? "green" : undefined}>
                  {index() === selectedIndex() ? "▶ " : "  "}
                  {profile.name} ({profile.startUrl})
                </text>
              </box>
            )}
          </For>
        </Show>
      </Show>

      <box marginTop={1}>
        <text fg="gray">
          Type to filter • ↑↓ Navigate • Enter Select • Esc Clear/Quit • Q Quit
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
