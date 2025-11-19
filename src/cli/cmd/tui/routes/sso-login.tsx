import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useAWS } from "../context/aws"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "../context/keybind"
import { TextAttributes } from "@opentui/core"
import { Locale } from "../util/locale"
import { useToast } from "../ui/toast"
import { Spinner } from "../ui/spinner"

export function SSOLoginScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("sso-login")
  const aws = useAWS()
  const keybind = useKeybind()
  const toast = useToast()

  const [loginInfo, setLoginInfo] = createSignal<any>(null)
  const [timeRemaining, setTimeRemaining] = createSignal(0)
  const [polling, setPolling] = createSignal(false)

  let pollInterval: NodeJS.Timeout
  let countdownInterval: NodeJS.Timeout

  onMount(async () => {
    try {
      // Start SSO login flow
      const info = await aws.startSSOLogin(routeData.startUrl, routeData.ssoRegion)
      setLoginInfo(info)

      // Calculate initial time remaining
      const expiresAt = new Date(info.expiresAt).getTime()
      const now = Date.now()
      const remaining = Math.floor((expiresAt - now) / 1000)
      setTimeRemaining(remaining)

      // Open browser to device authorization URL
      const { openInBrowser } = await import("@/util/browser")
      await openInBrowser(info.verificationUriComplete)

      // Start countdown timer
      countdownInterval = setInterval(() => {
        setTimeRemaining((t) => {
          if (t <= 0) {
            clearInterval(countdownInterval)
            handleTimeout()
            return 0
          }
          return t - 1
        })
      }, 1000)

      // Start polling for authorization
      setPolling(true)
      pollForAuthorization(info)
    } catch (e) {
      toast.error(e)
      route.navigate({ type: "sso-select" })
    }
  })

  onCleanup(() => {
    if (pollInterval) clearInterval(pollInterval)
    if (countdownInterval) clearInterval(countdownInterval)
  })

  const pollForAuthorization = async (info: any) => {
    pollInterval = setInterval(async () => {
      try {
        const success = await aws.pollSSOAuthorization(
          routeData.ssoRegion,
          info.clientId,
          info.clientSecret,
          info.deviceCode,
          routeData.startUrl
        )

        if (success) {
          clearInterval(pollInterval)
          clearInterval(countdownInterval)
          setPolling(false)

          toast.show({
            variant: "success",
            message: "Authentication successful!",
          })

          // Load accounts and navigate
          const profile = aws.profiles.find((p) => p.name === routeData.profileName)
          if (profile) {
            await aws.loadAccounts(profile)
            route.navigate({
              type: "account-select",
              profileName: routeData.profileName,
            })
          }
        }
      } catch (e) {
        // Authorization pending or other error
        // Keep polling
      }
    }, info.interval * 1000)
  }

  const handleTimeout = () => {
    if (pollInterval) clearInterval(pollInterval)
    setPolling(false)
    toast.show({
      variant: "error",
      message: "Authentication timed out",
      duration: 5000,
    })
    setTimeout(() => {
      route.navigate({ type: "sso-select" })
    }, 2000)
  }

  useKeyboard((evt) => {
    if (keybind.match("back", evt)) {
      evt.preventDefault()
      if (pollInterval) clearInterval(pollInterval)
      if (countdownInterval) clearInterval(countdownInterval)
      route.navigate({ type: "sso-select" })
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%" gap={2}>
      <box paddingLeft={1} paddingTop={1} flexDirection="row" justifyContent="space-between" paddingRight={1}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          AWS SSO Login - {routeData.profileName}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <Show when={loginInfo()}>
        <box flexDirection="column" alignItems="center" gap={2} paddingTop={2}>
          <text fg={theme.info} attributes={TextAttributes.BOLD}>
            🔐 Authenticate with AWS SSO
          </text>

          <box flexDirection="column" alignItems="center" gap={1}>
            <text fg={theme.text}>A browser window has been opened to:</text>
            <text fg={theme.textMuted}>{loginInfo()?.verificationUri}</text>
          </box>

          <box flexDirection="column" alignItems="center" gap={1}>
            <text fg={theme.text}>Enter this code in the browser:</text>
            <box
              borderStyle="single"
              borderColor={theme.primary}
              paddingLeft={2}
              paddingRight={2}
              paddingTop={0.5}
              paddingBottom={0.5}
            >
              <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                {loginInfo()?.userCode}
              </text>
            </box>
          </box>

          <box flexDirection="row" gap={1} alignItems="center">
            <Show when={polling()}>
              <Spinner />
            </Show>
            <text fg={theme.text}>
              {polling() ? "Waiting for authentication..." : "Authentication complete!"}
            </text>
          </box>

          <Show when={timeRemaining() > 0}>
            <text fg={theme.textMuted}>
              ⏱️  Time remaining: {Locale.formatDuration(timeRemaining())}
            </text>
          </Show>

          <Show when={timeRemaining() === 0}>
            <text fg={theme.error}>Authentication timed out</text>
          </Show>
        </box>
      </Show>

      <box paddingLeft={1} flexDirection="row" gap={2}>
        <text>
          <span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
            {keybind.print("back")}
          </span>
          <span style={{ fg: theme.textMuted }}> Cancel</span>
        </text>
      </box>
    </box>
  )
}
