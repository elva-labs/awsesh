import { useTheme } from "../context/theme";
import { useKeyboard } from "@opentui/solid";
import { Show, createMemo } from "solid-js";
import { useRouteData } from "../context/route";
import { useExit } from "../context/exit";

/**
 * Success Component
 * Shows success message after credentials are written
 */
export function Success() {
  const { theme } = useTheme();
  const routeData = useRouteData("success");
  const exit = useExit();

  // Exit on any key
  useKeyboard(() => {
    exit();
  });

  const profileName = `${routeData.accountName}-${routeData.roleName}`;

  // Format expiration time
  const expirationText = createMemo(() => {
    if (!routeData.expiration) return null;
    
    const now = new Date();
    const exp = new Date(routeData.expiration);
    const diffMs = exp.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${diffHours}h ${diffMins}m`;
  });

  const expirationDate = createMemo(() => {
    if (!routeData.expiration) return null;
    return new Date(routeData.expiration).toLocaleString();
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: theme.success }}>✓ AWS Credentials Configured Successfully!</b>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          Profile: <text fg={theme.accent}>{routeData.profileName}</text>
        </text>
        <text>
          Account: <text fg={theme.accent}>{routeData.accountName}</text>
        </text>
        <text>
          Role: <text fg={theme.accent}>{routeData.roleName}</text>
        </text>
        <Show when={routeData.region}>
          <text>
            Region: <text fg={theme.accent}>{routeData.region}</text>
          </text>
        </Show>
      </box>

      <Show when={routeData.expiration}>
        <box marginBottom={1} flexDirection="column">
          <text>
            Session expires in: <text fg={theme.warning}>{expirationText()}</text>
          </text>
          <text fg={theme.textMuted}>({expirationDate()})</text>
        </box>
      </Show>

      <box marginBottom={1} flexDirection="column">
        <text>
          <b>Credentials written to:</b>
        </text>
        <text fg={theme.warning}>~/.aws/credentials</text>
        <text>
          Section: <text fg={theme.accent}>[{profileName}]</text>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          <b>Usage:</b>
        </text>
        <text fg={theme.success}>
          export AWS_PROFILE={profileName}
        </text>
        <text fg={theme.textMuted}>or</text>
        <text fg={theme.success}>
          aws --profile {profileName} &lt;command&gt;
        </text>
      </box>

      <box marginTop={1}>
        <text fg={theme.textMuted}>Press any key to exit...</text>
      </box>
    </box>
  );
}
