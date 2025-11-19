import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show, createMemo } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute } from "../context/route";
import { useExit } from "../context/exit";
import { useTheme } from "../context/theme";
import type { InputRenderable } from "@opentui/core";

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
  const exit = useExit();
  const { theme } = useTheme();
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [filterQuery, setFilterQuery] = createSignal("");
  const [filterMode, setFilterMode] = createSignal(false);
  
  let inputRef: InputRenderable | undefined;

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

  const handleOpenBrowser = async () => {
    const profile = filteredProfiles()[selectedIndex()];
    if (!profile) return;
    
    const { openBrowser } = await import("@/util/browser.js");
    await openBrowser(profile.startUrl);
  };

  useKeyboard((key) => {
    const filtered = filteredProfiles();
    
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
        const profile = filtered[selectedIndex()];
        if (profile) {
          // Clear filter and exit filter mode
          setFilterMode(false);
          handleFilterChange("");
          inputRef?.blur();
          // Navigate to account selection
          route.navigate({
            type: "account-select",
            profileName: profile.name,
          });
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
      } else if (lowerKey === 'n') {
        route.navigate({
          type: "profile-form",
          mode: "create",
        });
      } else if (lowerKey === 'e') {
        const profile = filtered[selectedIndex()];
        if (!profile) return;
        
        route.navigate({
          type: "profile-form",
          mode: "edit",
          profile: {
            name: profile.name,
            startUrl: profile.startUrl,
            ssoRegion: profile.ssoRegion,
            defaultRegion: profile.defaultRegion,
            isChina: profile.isChina,
          },
        });
      } else if (lowerKey === 'd') {
        const profile = filtered[selectedIndex()];
        if (!profile) return;
        
        route.navigate({
          type: "profile-delete-confirm",
          profileName: profile.name,
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
      }
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
      exit();
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: theme.accent }}>AWS Session Manager - Select SSO Profile</b>
        </text>
      </box>

      {/* Filter input */}
      <Show when={filterMode()}>
        <box marginBottom={1} flexDirection="column">
          <box>
            <text>Filter: </text>
            <input
              ref={(r) => (inputRef = r)}
              onInput={(value) => handleFilterChange(value)}
              placeholder="Type to filter..."
              focusedBackgroundColor={theme.inputBg}
              cursorColor={theme.inputCursor}
              focusedTextColor={theme.inputFocusText}
            />
          </box>
          <box marginLeft={8}>
            <text fg={theme.textMuted}>Matches: {filteredProfiles().length}/{aws.profiles.length}</text>
          </box>
        </box>
      </Show>

      <Show
        when={aws.profiles.length > 0}
        fallback={
          <box>
            <text fg={theme.warning}>
              No SSO profiles found. Create one with: awsesh auth &lt;profile-name&gt;
            </text>
          </box>
        }
      >
        <Show
          when={filteredProfiles().length > 0}
          fallback={
            <box>
              <text fg={theme.warning}>
                No profiles match filter "{filterQuery()}"
              </text>
            </box>
          }
        >
          <For each={filteredProfiles()}>
            {(profile, index) => (
              <box marginBottom={0}>
                <text fg={index() === selectedIndex() ? theme.success : undefined}>
                  {index() === selectedIndex() ? "▶ " : "  "}
                  {profile.name} ({profile.startUrl})
                </text>
              </box>
            )}
          </For>
        </Show>
      </Show>

      <box marginTop={1}>
        <text fg={theme.textMuted}>
          / Filter • ↑↓/jk Navigate • Enter Select • N New • E Edit • D Delete • O Open • Q/Esc Quit
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
