import { useKeyboard } from "@opentui/solid";
import { createSignal, Show } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";
import type { SSOProfile } from "@/types";

type Field = "name" | "startUrl" | "ssoRegion" | "defaultRegion";

const FIELDS: { key: Field; label: string; placeholder: string }[] = [
  { key: "name", label: "Profile Name", placeholder: "my-sso-profile" },
  { key: "startUrl", label: "SSO Start URL", placeholder: "https://d-xxxxxxxxxx.awsapps.com/start" },
  { key: "ssoRegion", label: "SSO Region", placeholder: "us-east-1" },
  { key: "defaultRegion", label: "Default Region", placeholder: "us-east-1" },
];

/**
 * Profile Form Component
 * Create or edit an SSO profile
 */
export function ProfileForm() {
  const aws = useAWS();
  const route = useRoute();
  const routeData = useRouteData("profile-form");
  
  // Initialize form fields
  const isEdit = routeData.mode === "edit" && routeData.profile;
  const [formData, setFormData] = createSignal<Record<Field, string>>({
    name: isEdit ? routeData.profile!.name : "",
    startUrl: isEdit ? routeData.profile!.startUrl : "",
    ssoRegion: isEdit ? routeData.profile!.ssoRegion : "",
    defaultRegion: isEdit ? routeData.profile!.defaultRegion : "",
  });
  
  const [currentField, setCurrentField] = createSignal(0);
  const [error, setError] = createSignal<string | undefined>();

  // Handle form submission
  const handleSubmit = async () => {
    const data = formData();
    
    // Validation
    if (!data.name.trim()) {
      setError("Profile name is required");
      return;
    }
    if (!data.startUrl.trim()) {
      setError("SSO Start URL is required");
      return;
    }
    if (!data.ssoRegion.trim()) {
      setError("SSO Region is required");
      return;
    }
    if (!data.defaultRegion.trim()) {
      setError("Default Region is required");
      return;
    }

    // Check for duplicate name (only for new profiles or if name changed)
    if (routeData.mode === "create" || data.name !== routeData.profile?.name) {
      const exists = aws.profiles.some((p) => p.name === data.name);
      if (exists) {
        setError("Profile with this name already exists");
        return;
      }
    }

    try {
      const profile: SSOProfile = {
        name: data.name,
        startUrl: data.startUrl,
        ssoRegion: data.ssoRegion,
        defaultRegion: data.defaultRegion,
      };

      if (routeData.mode === "create") {
        await aws.createProfile(profile);
      } else {
        // For edit, delete old and create new (in case name changed)
        if (routeData.profile) {
          await aws.deleteProfile(routeData.profile.name);
        }
        await aws.createProfile(profile);
      }

      // Go back to SSO selector
      route.navigate({ type: "sso-select" });
    } catch (e) {
      setError(`Failed to save profile: ${e}`);
    }
  };

  // Update field value
  const updateField = (field: Field, value: string) => {
    setFormData({ ...formData(), [field]: value });
    setError(undefined);
  };

  // Keyboard navigation
  useKeyboard((key) => {
    const field = FIELDS[currentField()].key;
    const value = formData()[field];

    if (key.name === "tab") {
      // Move to next field
      setCurrentField((currentField() + 1) % FIELDS.length);
    } else if (key.name === "up" && currentField() > 0) {
      setCurrentField(currentField() - 1);
    } else if (key.name === "down" && currentField() < FIELDS.length - 1) {
      setCurrentField(currentField() + 1);
    } else if (key.name === "enter" || key.name === "return") {
      if (currentField() === FIELDS.length - 1) {
        // Submit on enter in last field
        handleSubmit();
      } else {
        // Move to next field
        setCurrentField(currentField() + 1);
      }
    } else if (key.name === "escape") {
      // Go back to SSO selector
      route.navigate({ type: "sso-select" });
    } else if (key.name === "backspace" && value) {
      updateField(field, value.slice(0, -1));
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      // Allow all characters for URLs and names
      updateField(field, value + key.sequence);
    } else if (key.name === "q" && key.ctrl) {
      process.exit(0);
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: "cyan" }}>
            {routeData.mode === "create" ? "Create New SSO Profile" : "Edit SSO Profile"}
          </b>
        </text>
      </box>

      {/* Form fields */}
      <box flexDirection="column" marginBottom={1}>
        {FIELDS.map((fieldDef, index) => {
          const isCurrent = currentField() === index;
          const value = formData()[fieldDef.key];
          
          return (
            <box flexDirection="column" marginBottom={1}>
              <text fg={isCurrent ? "green" : undefined}>
                {isCurrent ? "▶ " : "  "}
                <b>{fieldDef.label}:</b>
              </text>
              <box marginLeft={3}>
                <text fg="yellow">{value || fieldDef.placeholder}</text>
                <Show when={isCurrent}>
                  <text fg="gray">_</text>
                </Show>
              </box>
            </box>
          );
        })}
      </box>

      <Show when={error()}>
        <box marginBottom={1}>
          <text fg="red">Error: {error()}</text>
        </box>
      </Show>

      <box marginTop={1}>
        <text fg="gray">
          Tab/↑↓ Navigate • Enter Next/Save • Esc Cancel • Ctrl+Q Quit
        </text>
      </box>
    </box>
  );
}
