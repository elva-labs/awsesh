import { createMemo, Show } from "solid-js"
import { useAWS } from "../context/aws"
import { useRoute } from "../context/route"
import { useTheme } from "../context/theme"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import type { SSOProfile } from "@/types"

export function SSOSelector() {
  const aws = useAWS()
  const route = useRoute()
  const { theme } = useTheme()

  const items = createMemo(() => {
    return aws.profiles.map((profile): FilterableListItem<SSOProfile> => ({
      id: profile.name,
      title: profile.name,
      subtitle: profile.startUrl,
      value: profile,
      active: aws.isSessionActive(profile.startUrl),
    }))
  })

  function handleSelect(item: FilterableListItem<SSOProfile>) {
    route.navigate({
      type: "account-select",
      profileName: item.value.name,
    })
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show
        when={aws.profiles.length > 0}
        fallback={
          <box padding={1}>
            <text fg={theme.warning}>
              No SSO profiles found. Press N to create one.
            </text>
          </box>
        }
      >
        <FilterableList
          title="SSO Sessions"
          items={items()}
          onSelect={handleSelect}
          filterPlaceholder="Filter sessions..."
          emptyMessage="No sessions match your filter"
        />
      </Show>

      <Show when={aws.error}>
        <box padding={1}>
          <text fg={theme.error}>Error: {aws.error}</text>
        </box>
      </Show>
    </box>
  )
}
