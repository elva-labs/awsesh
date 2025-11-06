import { useKeyboard } from "@opentui/solid";
import { createSignal, For, createMemo } from "solid-js";
import { useRoute, useRouteData } from "../context/route";

/**
 * Common AWS regions
 */
const AWS_REGIONS = [
  { code: "us-east-1", name: "US East (N. Virginia)" },
  { code: "us-east-2", name: "US East (Ohio)" },
  { code: "us-west-1", name: "US West (N. California)" },
  { code: "us-west-2", name: "US West (Oregon)" },
  { code: "af-south-1", name: "Africa (Cape Town)" },
  { code: "ap-east-1", name: "Asia Pacific (Hong Kong)" },
  { code: "ap-south-1", name: "Asia Pacific (Mumbai)" },
  { code: "ap-south-2", name: "Asia Pacific (Hyderabad)" },
  { code: "ap-northeast-1", name: "Asia Pacific (Tokyo)" },
  { code: "ap-northeast-2", name: "Asia Pacific (Seoul)" },
  { code: "ap-northeast-3", name: "Asia Pacific (Osaka)" },
  { code: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
  { code: "ap-southeast-2", name: "Asia Pacific (Sydney)" },
  { code: "ap-southeast-3", name: "Asia Pacific (Jakarta)" },
  { code: "ap-southeast-4", name: "Asia Pacific (Melbourne)" },
  { code: "ca-central-1", name: "Canada (Central)" },
  { code: "eu-central-1", name: "Europe (Frankfurt)" },
  { code: "eu-central-2", name: "Europe (Zurich)" },
  { code: "eu-west-1", name: "Europe (Ireland)" },
  { code: "eu-west-2", name: "Europe (London)" },
  { code: "eu-west-3", name: "Europe (Paris)" },
  { code: "eu-south-1", name: "Europe (Milan)" },
  { code: "eu-south-2", name: "Europe (Spain)" },
  { code: "eu-north-1", name: "Europe (Stockholm)" },
  { code: "me-south-1", name: "Middle East (Bahrain)" },
  { code: "me-central-1", name: "Middle East (UAE)" },
  { code: "sa-east-1", name: "South America (São Paulo)" },
];

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
 * Region Selector Component
 * Allows user to select an AWS region for the current account
 */
export function RegionSelector() {
  const route = useRoute();
  const routeData = useRouteData("region-select");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [filterQuery, setFilterQuery] = createSignal("");

  // Find default region index (us-east-1)
  const defaultIndex = AWS_REGIONS.findIndex(r => r.code === "us-east-1");
  if (defaultIndex !== -1) {
    setSelectedIndex(defaultIndex);
  }

  // Filtered list based on query
  const filteredRegions = createMemo(() => {
    const query = filterQuery();
    if (!query) return AWS_REGIONS;
    
    return AWS_REGIONS.filter((region) => 
      fuzzyMatch(query, region.code) || fuzzyMatch(query, region.name)
    );
  });

  // Reset selected index when filter changes
  const handleFilterChange = (newQuery: string) => {
    setFilterQuery(newQuery);
    setSelectedIndex(0);
  };

  // Handle region selection
  const handleSelect = () => {
    const region = filteredRegions()[selectedIndex()];
    if (!region) return;

    // Navigate to role selection with the selected region
    route.navigate({
      type: "role-select",
      profileName: routeData.profileName,
      accountId: routeData.accountId,
      accountName: routeData.accountName,
      region: region.code,
    });
  };

  // Keyboard navigation
  useKeyboard((key) => {
    const filtered = filteredRegions();
    
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
      handleSelect();
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

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: "cyan" }}>AWS Session Manager - Select Region</b>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          Profile: <text fg="green">{routeData.profileName}</text>
        </text>
        <text>
          Account: <text fg="green">{routeData.accountName}</text> ({routeData.accountId})
        </text>
      </box>

      {/* Filter input */}
      <box marginBottom={1}>
        <text>Filter: </text>
        <text fg="yellow">{filterQuery() || "_"}</text>
        <text fg="gray"> ({filteredRegions().length}/{AWS_REGIONS.length})</text>
      </box>

      <box flexDirection="column" height={15} style={{ overflow: "scroll" }}>
        <For each={filteredRegions()}>
          {(region, index) => (
            <box marginBottom={0}>
              <text fg={index() === selectedIndex() ? "green" : undefined}>
                {index() === selectedIndex() ? "▶ " : "  "}
                {region.code} - {region.name}
              </text>
            </box>
          )}
        </For>
      </box>

      <box marginTop={1}>
        <text fg="gray">
          Type to filter • ↑↓ Navigate • Enter Select • Esc Clear/Back • Q Quit
        </text>
      </box>
    </box>
  );
}
