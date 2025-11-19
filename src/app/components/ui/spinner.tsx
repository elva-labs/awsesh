import { createSignal, onMount, onCleanup } from "solid-js"

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

interface SpinnerProps {
  text?: string
}

export function Spinner(props: SpinnerProps) {
  const [frame, setFrame] = createSignal(0)

  onMount(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % frames.length)
    }, 80)

    onCleanup(() => clearInterval(interval))
  })

  return (
    <box width="100%" height="100%" justifyContent="center" alignItems="center">
      <text fg="cyan">
        {frames[frame()]} {props.text || "Loading..."}
      </text>
    </box>
  )
}
