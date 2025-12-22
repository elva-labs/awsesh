import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useRoute, useRouteData } from "../context/route"
import { useAWS } from "../context/aws"
import { useKeybind } from "../context/keybind"
import { useCommand } from "../context/command"
import { TextAttributes } from "@opentui/core"
import { Locale } from "../util/locale"
import { useToast } from "../ui/toast"
import { Spinner } from "../ui/spinner"
import { Layout, Header, Footer, KeybindHint } from "../ui/layout"
import type { SSOLoginInfo } from "@awsesh/core"

export function SSOLoginScreen() {
  const { theme } = useTheme()
  const route = useRoute()
  const routeData = useRouteData("sso-login")
  const aws = useAWS()
  const keybind = useKeybind()
  const command = useCommand()
  const toast = useToast()

  const [loginInfo, setLoginInfo] = createSignal<SSOLoginInfo | null>(null)
  const [timeRemaining, setTimeRemaining] = createSignal(0)
  const [polling, setPolling] = createSignal(false)

  let pollInterval: NodeJS.Timeout
  let countdownInterval: NodeJS.Timeout

  command.register(() => [
    {
      id: "nav.back",
      title: "Cancel",
      description: "Cancel authentication and go back",
      category: "Navigation",
      keybind: "back",
      onSelect: () => {
        if (pollInterval) clearInterval(pollInterval)
        if (countdownInterval) clearInterval(countdownInterval)
        route.navigate({ type: "sso-select" })
      },
    },
  ])

  onMount(async () => {
    try {
      const session = aws.sessions.find((s) => s.name === routeData.sessionName)
      if (!session) throw new Error("SSO Session not found")

      const info = await aws.startLogin(session)
      setLoginInfo(info)

      const expiresAt = info.expiresAt.getTime()
      const now = Date.now()
      const remaining = Math.floor((expiresAt - now) / 1000)
      setTimeRemaining(remaining)

      const { openBrowser } = await import("@/util/browser")
      await openBrowser(info.verificationUriComplete)

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

  const pollForAuthorization = async (info: SSOLoginInfo) => {
    pollInterval = setInterval(async () => {
      try {
        const session = aws.sessions.find((s) => s.name === routeData.sessionName)
        if (!session) return

        const token = await aws.pollForToken(session, info)

        if (token) {
          clearInterval(pollInterval)
          clearInterval(countdownInterval)
          setPolling(false)

          toast.show({
            variant: "success",
            message: "Authentication successful!",
          })

          const s = aws.sessions.find((s) => s.name === routeData.sessionName)
          if (s) {
            await aws.loadAccounts(s)
            route.navigate({
              type: "account-select",
              sessionName: routeData.sessionName,
            })
          }
        }
      } catch {
        // continue polling
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

  return (
    <Layout
      header={<Header title="AWS SSO Login" subtitle={routeData.sessionName} />}
      footer={
        <Footer right={<KeybindHint keybind={keybind.print("command_list")} label="Commands" />}>
          <KeybindHint keybind={keybind.print("back")} label="Cancel" />
        </Footer>
      }
    >
      <Show when={loginInfo()}>
        <box flexDirection="column" alignItems="center" gap={2} paddingTop={2}>
          <text fg={theme.info} attributes={TextAttributes.BOLD}>
            Authenticate with AWS SSO
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
            <text fg={theme.text}>{polling() ? "Waiting for authentication..." : "Authentication complete!"}</text>
          </box>

          <Show when={timeRemaining() > 0}>
            <text fg={theme.textMuted}>Time remaining: {Locale.formatDuration(timeRemaining())}</text>
          </Show>

          <Show when={timeRemaining() === 0}>
            <text fg={theme.error}>Authentication timed out</text>
          </Show>
        </box>
      </Show>
    </Layout>
  )
}
