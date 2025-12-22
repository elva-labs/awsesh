import { createSignal, onCleanup } from "solid-js"
import { useTheme } from "../context/theme"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { size?: number }) {
  const { theme } = useTheme()
  const [frame, setFrame] = createSignal(0)

  const interval = setInterval(() => {
    setFrame((f) => (f + 1) % SPINNER_FRAMES.length)
  }, 80)

  onCleanup(() => clearInterval(interval))

  return (
    <text fg={theme.primary}>
      {SPINNER_FRAMES[frame()]}
    </text>
  )
}
