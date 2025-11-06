import { useKeyboard } from "@opentui/solid";
import { createSignal, For, Show } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute } from "../context/route";

/**
 * SSO Profile Selector Component
 * Allows user to select or create an SSO profile
 */
export function SSOSelector() {
  const aws = useAWS();
  const route = useRoute();
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  // Keyboard navigation
  useKeyboard((key) => {
    if (key.name === "up" && selectedIndex() > 0) {
      setSelectedIndex(selectedIndex() - 1);
    } else if (key.name === "down" && selectedIndex() < aws.profiles.length - 1) {
      setSelectedIndex(selectedIndex() + 1);
    } else if (key.name === "enter" || key.name === "return") {
      const profile = aws.profiles[selectedIndex()];
      if (profile) {
        // Navigate to account selection
        route.navigate({
          type: "account-select",
          profileName: profile.name,
        });
      }
    } else if (key.name === "q" || key.name === "escape") {
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
        <For each={aws.profiles}>
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

      <box marginTop={1}>
        <text fg="gray">
          ↑↓ Navigate • Enter Select • Q/Esc Quit
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
