import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useAWS } from "../context/aws"
import { useDialog, type DialogContext } from "../ui/dialog"
import { Spinner } from "../ui/spinner"
import { Locale } from "../util/locale"
import { copyToClipboard } from "@/util/clipboard"
import { openBrowser } from "@/util/browser"
import type { SSOSession, SSOLoginInfo } from "@awsesh/core"

export type DialogSSOLoginProps = {
  session: SSOSession
  onSuccess: () => void
  onError: (error: string) => void
}

export function DialogSSOLogin(props: DialogSSOLoginProps) {
  const dialog = useDialog()
  const aws = useAWS()
  const { theme } = useTheme()

  const [loginInfo, setLoginInfo] = createSignal<SSOLoginInfo | null>(null)
  const [timeRemaining, setTimeRemaining] = createSignal(0)
  const [status, setStatus] = createSignal<"loading" | "waiting" | "success" | "error">("loading")
  const [errorMessage, setErrorMessage] = createSignal("")

  let pollInterval: ReturnType<typeof setInterval> | undefined
  let countdownInterval: ReturnType<typeof setInterval> | undefined

  const cleanup = () => {
    if (pollInterval) clearInterval(pollInterval)
    if (countdownInterval) clearInterval(countdownInterval)
  }

  onCleanup(cleanup)

  onMount(async () => {
    try {
      const info = await aws.startLogin(props.session)
      setLoginInfo(info)

      const expiresAt = info.expiresAt.getTime()
      const now = Date.now()
      const remaining = Math.floor((expiresAt - now) / 1000)
      setTimeRemaining(remaining)

      await copyToClipboard(info.userCode)
      await openBrowser(info.verificationUriComplete)

      countdownInterval = setInterval(() => {
        setTimeRemaining((t) => {
          if (t <= 0) {
            cleanup()
            handleTimeout()
            return 0
          }
          return t - 1
        })
      }, 1000)

      setStatus("waiting")
      pollForAuthorization(info)
    } catch (e) {
      setStatus("error")
      setErrorMessage(String(e))
      cleanup()
      dialog.clear()
      props.onError(String(e))
    }
  })

  const pollForAuthorization = async (info: SSOLoginInfo) => {
    pollInterval = setInterval(async () => {
      try {
        const token = await aws.pollForToken(props.session, info)

        if (token) {
          cleanup()
          setStatus("success")
          await aws.loadAccounts(props.session)
          dialog.clear()
          props.onSuccess()
        }
      } catch {
        // continue polling
      }
    }, info.interval * 1000)
  }

  const handleTimeout = () => {
    setStatus("error")
    setErrorMessage("Authentication timed out")
    dialog.clear()
    props.onError("Authentication timed out")
  }

  const handleCopy = async () => {
    const info = loginInfo()
    if (info) {
      await copyToClipboard(info.userCode)
    }
  }

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      cleanup()
      dialog.clear()
    }
    if (evt.name === "c" && loginInfo()) {
      handleCopy()
    }
  })

  const handleLinkClick = async () => {
    const info = loginInfo()
    if (info) {
      await openBrowser(info.verificationUriComplete)
    }
  }

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD}>Authenticate with AWS SSO</text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <Show when={status() === "loading"}>
        <box flexDirection="row" gap={1} alignItems="center" justifyContent="center">
          <Spinner />
          <text fg={theme.text}>Starting authentication...</text>
        </box>
      </Show>

      <Show when={loginInfo() && status() !== "loading"}>
        <box flexDirection="column" alignItems="center" gap={1}>
          <text fg={theme.text}>A browser window has been opened.</text>
          <text
            fg={theme.primary}
            attributes={TextAttributes.UNDERLINE}
            onMouseUp={handleLinkClick}
          >
            {loginInfo()?.verificationUri}
          </text>

          <box flexDirection="column" alignItems="center" gap={0}>
            <text fg={theme.text}>Enter this code in the browser:</text>
            <box
              borderStyle="single"
              borderColor={theme.primary}
              paddingLeft={2}
              paddingRight={2}
              marginTop={1}
              justifyContent="center"
            >
              <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                {loginInfo()?.userCode}
              </text>
            </box>
            <text fg={theme.textMuted} marginTop={1}>
              Code copied to clipboard. Press 'c' to copy again.
            </text>
          </box>

          <box flexDirection="row" gap={1} alignItems="center" justifyContent="center">
            <Show when={status() === "waiting"}>
              <Spinner />
              <text fg={theme.text}>Waiting for authentication...</text>
            </Show>
            <Show when={status() === "success"}>
              <text fg={theme.success}>Authentication successful!</text>
            </Show>
            <Show when={status() === "error"}>
              <text fg={theme.error}>{errorMessage()}</text>
            </Show>
          </box>

          <Show when={timeRemaining() > 0 && status() === "waiting"}>
            <text fg={theme.textMuted}>Time remaining: {Locale.formatDuration(timeRemaining())}</text>
          </Show>
        </box>
      </Show>
    </box>
  )
}

DialogSSOLogin.show = (
  dialog: DialogContext,
  session: SSOSession,
  onSuccess: () => void,
  onError: (error: string) => void
) => {
  dialog.replace(
    () => <DialogSSOLogin session={session} onSuccess={onSuccess} onError={onError} />
  )
}
