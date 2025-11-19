import { useTheme } from "../context/theme";
import { useKeyboard } from "@opentui/solid";
import { createSignal, Show } from "solid-js";
import { useAWS } from "../context/aws";
import { useRoute, useRouteData } from "../context/route";
import { useExit } from "../context/exit";
import { URLHelper } from "@/util/url";
import type { SSOProfile } from "@/types";

type Field = "name" | "company" | "ssoRegion" | "defaultRegion";

const FIELDS: { key: Field; label: string; placeholder: string; hint?: string }[] = [
  { key: "name", label: "Profile Name", placeholder: "my-sso-profile" },
  { 
    key: "company", 
    label: "Company Name", 
    placeholder: "d-xxxxxxxxxx",
    hint: "The unique identifier from your SSO portal URL"
  },
  { key: "ssoRegion", label: "SSO Region", placeholder: "us-east-1" },
  { key: "defaultRegion", label: "Default Region", placeholder: "us-east-1" },
];

/**
 * Profile Form Component
 * Create or edit an SSO profile
 */
export function ProfileForm() {
  const { theme } = useTheme();
  const aws = useAWS();
  const route = useRoute();
  const exit = useExit();
  
  const routeData = useRouteData("profile-form");
  
  const isEdit = routeData.mode === "edit" && routeData.profile;
  
  let initialName = "";
  let initialCompany = "";
  let initialSsoRegion = "";
  let initialDefaultRegion = "";
  let initialIsChina = false;
  
  if (isEdit) {
    initialName = routeData.profile!.name || "";
    initialSsoRegion = routeData.profile!.ssoRegion || "";
    initialDefaultRegion = routeData.profile!.defaultRegion || "";
    initialIsChina = routeData.profile!.isChina || false;
    
    const extracted = URLHelper.extractCompanyName(routeData.profile!.startUrl);
    initialCompany = extracted || "";
  }
  
  const [formData, setFormData] = createSignal<Record<Field, string>>({
    name: initialName,
    company: initialCompany,
    ssoRegion: initialSsoRegion,
    defaultRegion: initialDefaultRegion,
  });
  
  const [currentField, setCurrentField] = createSignal(0);
  const [isChina, setIsChina] = createSignal(initialIsChina);
  const [error, setError] = createSignal<string | undefined>();

  // Handle form submission
  const handleSubmit = async () => {
    const data = formData();
    
    // Validation
    if (!data.name.trim()) {
      setError("Profile name is required");
      return;
    }
    if (!data.company.trim()) {
      setError("Company name is required");
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
      // Build the SSO URL from company name
      const startUrl = URLHelper.buildSSOUrl(
        data.company.trim(),
        isChina(),
        isChina() ? data.ssoRegion : undefined
      );
      
      const profile: SSOProfile = {
        name: data.name,
        startUrl,
        ssoRegion: data.ssoRegion,
        defaultRegion: data.defaultRegion,
        isChina: isChina(),
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
    } else if (key.sequence?.toLowerCase() === "c" && key.ctrl) {
      // Toggle China mode with Ctrl+C
      setIsChina(!isChina());
      setError(undefined);
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      // Allow all characters for URLs and names
      updateField(field, value + key.sequence);
    } else if (key.sequence?.toLowerCase() === "q" && key.ctrl) {
      exit();
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box marginBottom={1}>
        <text>
          <b style={{ fg: theme.accent }}>
            {routeData.mode === "create" ? "Create New SSO Profile" : "Edit SSO Profile"}
          </b>
        </text>
      </box>

      {/* China mode indicator */}
      <box marginBottom={1}>
        <text>
          Region Type: <text fg={isChina() ? "yellow" : "green"}>
            {isChina() ? "China (CN)" : "Standard (Global)"}
          </text>
          <text fg={theme.textMuted}> (Ctrl+C to toggle)</text>
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
                <text fg={theme.warning}>{value || fieldDef.placeholder}</text>
                <Show when={isCurrent}>
                  <text fg={theme.textMuted}>_</text>
                </Show>
              </box>
              <Show when={fieldDef.hint}>
                <box marginLeft={3}>
                  <text fg={theme.textMuted}>{fieldDef.hint}</text>
                </box>
              </Show>
            </box>
          );
        })}
      </box>

      {/* Show constructed URL */}
      <box marginBottom={1} flexDirection="column">
        <text fg={theme.textMuted}>Generated URL:</text>
        <text fg={theme.accent} marginLeft={1}>
          {(() => {
            try {
              return URLHelper.buildSSOUrl(
                formData().company || "company",
                isChina(),
                isChina() ? formData().ssoRegion || "cn-north-1" : undefined
              );
            } catch (e) {
              return "Error generating URL";
            }
          })()}
        </text>
      </box>

      <Show when={error()}>
        <box marginBottom={1}>
          <text fg={theme.error}>Error: {error()}</text>
        </box>
      </Show>

      <box marginTop={1}>
        <text fg={theme.textMuted}>
          Tab/↑↓ Navigate • Enter Next/Save • Ctrl+C Toggle China • Esc Cancel • Ctrl+Q Quit
        </text>
      </box>
    </box>
  );
}
