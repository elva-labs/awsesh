import { useTheme } from "../context/theme";
import { useKeyboard } from "@opentui/solid";
import { createSignal } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";
import { useExit } from "../context/exit";
import { Log } from "@/util/log";

const log = Log.create({ service: "profile-delete-confirm" });

/**
 * Profile Delete Confirmation Component
 * Confirms deletion of an SSO profile
 */
export function ProfileDeleteConfirm() {
  const { theme } = useTheme();
  const aws = useAWS();
  const route = useRoute();
  const exit = useExit();
  const routeData = useRouteData("profile-delete-confirm");
  const [deleting, setDeleting] = createSignal(false);
  
  // Safety check - if no profile name, go back
  if (!routeData.profileName) {
    route.navigate({ type: "sso-select" });
    return null;
  }

  // Handle profile deletion
  const handleDelete = async () => {
    if (deleting()) return;
    setDeleting(true);
    
    try {
      await aws.deleteProfile(routeData.profileName);
    } catch (e) {
      log.error("Failed to delete profile", { error: e, profileName: routeData.profileName });
    } finally {
      setDeleting(false);
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
    } else if (key.sequence?.toLowerCase() === "q" && key.ctrl) {
      exit();
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: theme.error }}>⚠ Delete SSO Profile</b>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text>
          Are you sure you want to delete this profile?
        </text>
        <text marginTop={1}>
          Profile: <text fg={theme.warning}>{routeData.profileName}</text>
        </text>
      </box>

      <box marginBottom={1} flexDirection="column">
        <text fg={theme.textMuted}>
          This will remove the profile configuration but will not delete
        </text>
        <text fg={theme.textMuted}>
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
