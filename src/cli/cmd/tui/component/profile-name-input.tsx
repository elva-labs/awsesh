import { useKeyboard } from "@opentui/solid";
import { createSignal } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";

/**
 * Profile Name Input Component
 * Allows user to enter a custom profile name before setting credentials
 */
export function ProfileNameInput() {
  const aws = useAWS();
  const route = useRoute();
  const routeData = useRouteData("profile-name-input");
  
  // Default profile name
  const defaultName = `${routeData.accountName}-${routeData.roleName}`;
  const [profileName, setProfileName] = createSignal(defaultName);
  const [cursorPos, setCursorPos] = createSignal(defaultName.length);

  // Handle profile name submission
  const handleSubmit = async () => {
    const name = profileName();
    if (!name.trim()) return;

    const profile = aws.profiles.find((p) => p.name === routeData.profileName);
    if (!profile) return;

    try {
      // Get credentials and write to file with custom profile name
      await aws.getRoleCredentials(
        profile,
        routeData.accountId,
        name,
        routeData.roleName
      );

      // Navigate to success screen
      route.navigate({
        type: "success",
        profileName: routeData.profileName,
        accountName: name,
        roleName: routeData.roleName,
      });
    } catch (e) {
      // Error will be shown via aws.error
    }
  };

  // Keyboard input
  useKeyboard((key) => {
    const current = profileName();
    const pos = cursorPos();

    if (key.name === "enter" || key.name === "return") {
      handleSubmit();
    } else if (key.name === "escape" || key.name === "backspace" && !current) {
      // Go back to role selection
      route.navigate({
        type: "role-select",
        profileName: routeData.profileName,
        accountId: routeData.accountId,
        accountName: routeData.accountName,
      });
    } else if (key.name === "backspace" && current) {
      if (pos > 0) {
        setProfileName(current.slice(0, pos - 1) + current.slice(pos));
        setCursorPos(pos - 1);
      }
    } else if (key.name === "delete" && pos < current.length) {
      setProfileName(current.slice(0, pos) + current.slice(pos + 1));
    } else if (key.name === "left" && pos > 0) {
      setCursorPos(pos - 1);
    } else if (key.name === "right" && pos < current.length) {
      setCursorPos(pos + 1);
    } else if (key.name === "home") {
      setCursorPos(0);
    } else if (key.name === "end") {
      setCursorPos(current.length);
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      // Only allow alphanumeric, dash, underscore
      if (/^[a-zA-Z0-9\-_]$/.test(key.sequence)) {
        setProfileName(current.slice(0, pos) + key.sequence + current.slice(pos));
        setCursorPos(pos + 1);
      }
    } else if (key.name === "q" && key.ctrl) {
      process.exit(0);
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: "cyan" }}>Enter Custom Profile Name</b>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          SSO Profile: <text fg="green">{routeData.profileName}</text>
        </text>
        <text>
          Account: <text fg="green">{routeData.accountName}</text> ({routeData.accountId})
        </text>
        <text>
          Role: <text fg="green">{routeData.roleName}</text>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          <b>Profile name:</b>
        </text>
        <box>
          <text fg="yellow">{profileName()}</text>
          <text fg="gray">_</text>
        </box>
        <text fg="gray" marginTop={0}>
          (alphanumeric, dash, underscore only)
        </text>
      </box>

      <box marginTop={1}>
        <text fg="gray">
          Enter Confirm • Esc/Backspace Back • Ctrl+Q Quit
        </text>
      </box>
    </box>
  );
}
