import { useKeyboard } from "@opentui/solid";
import { createSignal } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";

/**
 * Profile Delete Confirmation Component
 * Confirms deletion of an SSO profile
 */
export function ProfileDeleteConfirm() {
  const aws = useAWS();
  const route = useRoute();
  const routeData = useRouteData("profile-delete-confirm");
  const [deleting, setDeleting] = createSignal(false);

  // Handle profile deletion
  const handleDelete = async () => {
    setDeleting(true);
    
    try {
      await aws.deleteProfile(routeData.profileName);
      // Go back to SSO selector
      route.navigate({ type: "sso-select" });
    } catch (e) {
      // Error handling - just go back for now
      route.navigate({ type: "sso-select" });
    }
  };

  // Handle cancel
  const handleCancel = () => {
    route.navigate({ type: "sso-select" });
  };

  // Keyboard navigation
  useKeyboard((key) => {
    if (deleting()) return;

    if (key.sequence?.toLowerCase() === "y") {
      handleDelete();
    } else if (key.sequence?.toLowerCase() === "n" || key.name === "escape") {
      handleCancel();
    } else if (key.name === "q" && key.ctrl) {
      process.exit(0);
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: "red" }}>⚠ Delete SSO Profile</b>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          Are you sure you want to delete this profile?
        </text>
        <text marginTop={1}>
          Profile: <text fg="yellow">{routeData.profileName}</text>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text fg="gray">
          This will remove the profile configuration but will not delete
        </text>
        <text fg="gray">
          any cached tokens or credentials.
        </text>
      </box>

      <box marginTop={1}>
        <text fg={deleting() ? "gray" : "green"}>
          {deleting() ? "Deleting..." : "Y Yes, delete • N No, cancel • Esc Cancel"}
        </text>
      </box>
    </box>
  );
}
