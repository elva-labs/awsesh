import { useKeyboard } from "@opentui/solid";
import { useRouteData } from "../context/route";

/**
 * Success Component
 * Shows success message after credentials are written
 */
export function Success() {
  const routeData = useRouteData("success");

  // Exit on any key
  useKeyboard(() => {
    process.exit(0);
  });

  const profileName = `${routeData.accountName}-${routeData.roleName}`;

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: "green" }}>✓ AWS Credentials Configured Successfully!</b>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          Profile: <text fg="cyan">{routeData.profileName}</text>
        </text>
        <text>
          Account: <text fg="cyan">{routeData.accountName}</text>
        </text>
        <text>
          Role: <text fg="cyan">{routeData.roleName}</text>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          <b>Credentials written to:</b>
        </text>
        <text fg="yellow">~/.aws/credentials</text>
        <text>
          Section: <text fg="cyan">[{profileName}]</text>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          <b>Usage:</b>
        </text>
        <text fg="green">
          export AWS_PROFILE={profileName}
        </text>
        <text fg="gray">or</text>
        <text fg="green">
          aws --profile {profileName} &lt;command&gt;
        </text>
      </box>

      <box marginTop={1}>
        <text fg="gray">Press any key to exit...</text>
      </box>
    </box>
  );
}
