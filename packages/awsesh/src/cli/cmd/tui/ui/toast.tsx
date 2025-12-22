import { createContext, For, onCleanup, Show, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"

export type ToastVariant = "info" | "success" | "warning" | "error"

export interface Toast {
  id: string
  title?: string
  message: string
  variant: ToastVariant
  duration: number
}

function init() {
  const [store, setStore] = createStore({
    toasts: [] as Toast[],
  })

  let id = 0

  return {
    show(input: {
      title?: string
      message: string
      variant?: ToastVariant
      duration?: number
    }) {
      const toast: Toast = {
        id: `toast-${id++}`,
        title: input.title,
        message: input.message,
        variant: input.variant ?? "info",
        duration: input.duration ?? 3000,
      }

      setStore("toasts", (toasts) => [...toasts, toast])

      setTimeout(() => {
        setStore("toasts", (toasts) => toasts.filter((t) => t.id !== toast.id))
      }, toast.duration)
    },
    error(err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.show({
        variant: "error",
        message,
        duration: 5000,
      })
    },
    get toasts() {
      return store.toasts
    },
  }
}

export type ToastContext = ReturnType<typeof init>

const ctx = createContext<ToastContext>()

export function ToastProvider(props: ParentProps) {
  const value = init()
  return (
    <ctx.Provider value={value}>
      {props.children}
      <ToastContainer />
    </ctx.Provider>
  )
}

export function useToast() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return value
}

function ToastContainer() {
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  return (
    <box position="absolute" top={1} right={2} flexDirection="column" gap={1}>
      <For each={toast.toasts}>
        {(t) => {
          const color = () => {
            switch (t.variant) {
              case "success":
                return theme.success
              case "warning":
                return theme.warning
              case "error":
                return theme.error
              default:
                return theme.info
            }
          }

          return (
            <box
              backgroundColor={theme.background}
              borderColor={color()}
              borderStyle="single"
              paddingLeft={1}
              paddingRight={1}
              maxWidth={Math.min(50, dimensions().width - 4)}
            >
              <Show when={t.title}>
                <text fg={color()} attributes={TextAttributes.BOLD}>
                  {t.title}
                </text>
              </Show>
              <text fg={theme.text}>{t.message}</text>
            </box>
          )
        }}
      </For>
    </box>
  )
}
