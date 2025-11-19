import { createSignal, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useApp } from "../../context/app"
import { Header } from "../ui/header"
import { ConfigManager } from "@/config/manager"
import type { SSOProfile } from "@/types"
import type { InputRenderable } from "@opentui/core"

const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
]

export function ProfileCreate() {
  const app = useApp()
  
  const [step, setStep] = createSignal<"name" | "url" | "sso-region" | "default-region">("name")
  const [name, setName] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [ssoRegion, setSsoRegion] = createSignal("")
  const [defaultRegion, setDefaultRegion] = createSignal("")
  const [selectedRegionIndex, setSelectedRegionIndex] = createSignal(0)
  
  let nameInputRef: InputRenderable | undefined
  let urlInputRef: InputRenderable | undefined

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (step() === "name") {
        app.setView({ type: "home" })
      } else if (step() === "url") {
        setStep("name")
      } else if (step() === "sso-region") {
        setStep("url")
      } else if (step() === "default-region") {
        setStep("sso-region")
      }
    } else if (key.name === "up") {
      if (step() === "sso-region" || step() === "default-region") {
        setSelectedRegionIndex(i => Math.max(0, i - 1))
      }
    } else if (key.name === "down") {
      if (step() === "sso-region" || step() === "default-region") {
        setSelectedRegionIndex(i => Math.min(AWS_REGIONS.length - 1, i + 1))
      }
    } else if (key.name === "return" || key.name === "enter") {
      if (step() === "sso-region") {
        const region = AWS_REGIONS[selectedRegionIndex()]
        setSsoRegion(region)
        setStep("default-region")
        setSelectedRegionIndex(0)
      } else if (step() === "default-region") {
        handleCreate()
      }
    }
  })

  const handleCreate = async () => {
    const region = AWS_REGIONS[selectedRegionIndex()]
    setDefaultRegion(region)
    
    app.setLoading(true)
    try {
      const profile: SSOProfile = {
        name: name(),
        startUrl: url(),
        ssoRegion: ssoRegion(),
        defaultRegion: region,
      }
      
      await ConfigManager.saveProfile(profile)
      await app.loadProfiles()
      app.setView({ type: "home" })
    } catch (err) {
      app.setError(err instanceof Error ? err.message : "Failed to create profile")
    } finally {
      app.setLoading(false)
    }
  }

  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header 
        title="Create Profile" 
        subtitle={`Step ${step() === "name" ? "1" : step() === "url" ? "2" : step() === "sso-region" ? "3" : "4"} of 4`}
      />

      <box width="100%" height="100%" flexDirection="column" padding={2}>
        <Show when={step() === "name"}>
          <box width="100%" flexDirection="column">
            <text fg="cyan"><b>Profile Name</b></text>
            <box width="100%" marginTop={1}>
              <input
                ref={(r) => (nameInputRef = r)}
                value={name()}
                placeholder="my-profile"
                onInput={(v) => setName(v)}
                onSubmit={(v) => {
                  if (v.trim()) {
                    setName(v.trim())
                    setStep("url")
                  }
                }}
                focused={true}
              />
            </box>
            <box width="100%" marginTop={1}>
              <text fg="gray">Enter a name for this profile</text>
            </box>
          </box>
        </Show>

        <Show when={step() === "url"}>
          <box width="100%" flexDirection="column">
            <text fg="cyan"><b>SSO Start URL</b></text>
            <box width="100%" marginTop={1}>
              <input
                ref={(r) => (urlInputRef = r)}
                value={url()}
                placeholder="https://my-sso-portal.awsapps.com/start"
                onInput={(v) => setUrl(v)}
                onSubmit={(v) => {
                  if (v.trim()) {
                    setUrl(v.trim())
                    setStep("sso-region")
                  }
                }}
                focused={true}
              />
            </box>
            <box width="100%" marginTop={1}>
              <text fg="gray">Enter your AWS SSO start URL</text>
            </box>
          </box>
        </Show>

        <Show when={step() === "sso-region"}>
          <box width="100%" flexDirection="column">
            <text fg="cyan"><b>SSO Region</b></text>
            <box width="100%" marginTop={1} flexDirection="column">
              <For each={AWS_REGIONS}>
                {(region, i) => (
                  <box 
                    width="100%" 
                    padding={1}
                    style={selectedRegionIndex() === i() ? { backgroundColor: "cyan" } : {}}
                  >
                    <text fg={selectedRegionIndex() === i() ? "black" : undefined}>{region}</text>
                  </box>
                )}
              </For>
            </box>
          </box>
        </Show>

        <Show when={step() === "default-region"}>
          <box width="100%" flexDirection="column">
            <text fg="cyan"><b>Default Region</b></text>
            <box width="100%" marginTop={1} flexDirection="column">
              <For each={AWS_REGIONS}>
                {(region, i) => (
                  <box 
                    width="100%" 
                    padding={1}
                    style={selectedRegionIndex() === i() ? { backgroundColor: "cyan" } : {}}
                  >
                    <text fg={selectedRegionIndex() === i() ? "black" : undefined}>{region}</text>
                  </box>
                )}
              </For>
            </box>
          </box>
        </Show>
      </box>

      <box width="100%" padding={1} style={{ borderStyle: "single", borderColor: "gray" }}>
        <text fg="gray">
          {step() === "name" || step() === "url" ? "Type to enter • " : "↑↓ Navigate • "}
          Enter Continue • Esc {step() === "name" ? "Cancel" : "Back"}
        </text>
      </box>
    </box>
  )
}
