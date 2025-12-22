import { createMemo, Show } from "solid-js"
import { useAWS } from "../context/aws"
import { useRoute } from "../context/route"
import { useTheme } from "../context/theme"
import { FilterableList, type FilterableListItem } from "../ui/filterable-list"
import type { SSOSession } from "@awsesh/core"

export function SSOSelector() {
  const aws = useAWS()
  const route = useRoute()
  const { theme } = useTheme()

  const items = createMemo(() => {
    return aws.sessions.map((session): FilterableListItem<SSOSession> => ({
      id: session.name,
      title: session.name,
      subtitle: session.startUrl,
      value: session,
      active: aws.isSessionActive(session.startUrl),
    }))
  })

  function handleSelect(item: FilterableListItem<SSOSession>) {
    route.navigate({
      type: "account-select",
      sessionName: item.value.name,
    })
  }

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show
        when={aws.sessions.length > 0}
        fallback={
          <box padding={1}>
            <text fg={theme.warning}>
              No SSO sessions found. Press N to create one.
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
