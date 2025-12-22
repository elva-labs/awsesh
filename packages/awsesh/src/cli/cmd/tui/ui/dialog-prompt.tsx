import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { createSignal, onMount, Show, type JSX } from "solid-js"
import { useKeyboard } from "@opentui/solid"

export type DialogPromptProps = {
  title: string
  description?: () => JSX.Element
  placeholder?: string
  defaultValue?: string
  value?: string
  onConfirm?: (value: string) => void
  onCancel?: () => void
}

export function DialogPrompt(props: DialogPromptProps) {
  const { theme } = useTheme()
  const [value, setValue] = createSignal(props.value ?? "")
  let input: any

  const handleSubmit = () => {
    const finalValue = value() || props.defaultValue || ""
    props.onConfirm?.(finalValue)
  }

  onMount(() => {
    setTimeout(() => {
      input?.focus()
    }, 1)
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <box gap={1}>
        <Show when={props.description}>{props.description!()}</Show>
        <input
          value={value()}
          onInput={(e) => setValue(e)}
          onKeyDown={(evt: any) => {
            if (evt.name === "return" && !evt.shift) {
              evt.preventDefault()
              handleSubmit()
            }
          }}
          focusedBackgroundColor={theme.background}
          cursorColor={theme.primary}
          focusedTextColor={theme.text}
          placeholder={props.defaultValue || props.placeholder || "Enter value..."}
          placeholderColor={theme.textMuted}
          ref={(r) => (input = r)}
        />
      </box>
      <box paddingBottom={1} flexDirection="row" gap={2}>
        <text fg={theme.text}>
          {"enter "}
          <span style={{ fg: theme.textMuted }}>submit</span>
        </text>
      </box>
    </box>
  )
}

DialogPrompt.show = (
  dialog: DialogContext,
  title: string,
  options?: Omit<DialogPromptProps, "title">
) => {
  return new Promise<string | null>((resolve) => {
    let resolved = false
    dialog.replace(
      () => (
        <DialogPrompt
          title={title}
          {...options}
          onConfirm={(value) => {
            if (resolved) return
            resolved = true
            dialog.clear()
            resolve(value)
          }}
          onCancel={() => {
            if (resolved) return
            resolved = true
            dialog.clear()
            resolve(null)
          }}
        />
      ),
      () => {
        if (resolved) return
        resolved = true
        resolve(null)
      }
    )
  })
}
