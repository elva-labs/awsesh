import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { createSignal, onMount, Show, type JSX } from "solid-js"
import { DialogBase, DialogButton, DialogFooter } from "./dialog-base"
import type { InputRenderable } from "@opentui/core"

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
  const dialog = useDialog()
  const { theme } = useTheme()
  const [value, setValue] = createSignal(props.value ?? "")
  let input: InputRenderable

  const handleSubmit = () => {
    const finalValue = value() || props.defaultValue || ""
    props.onConfirm?.(finalValue)
    dialog.clear()
  }

  const handleCancel = () => {
    props.onCancel?.()
    dialog.clear()
  }

  onMount(() => {
    setTimeout(() => {
      input?.focus()
    }, 1)
  })

  return (
    <DialogBase title={props.title}>
      <box gap={1}>
        <Show when={props.description}>{props.description!()}</Show>
        <input
          value={value()}
          focused
          onInput={(e) => setValue(e)}
          onKeyDown={(evt) => {
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
      <DialogFooter align="right">
        <box flexDirection="row" gap={1}>
          <DialogButton
            label="Cancel"
            onClick={handleCancel}
          />
          <DialogButton
            label="Submit"
            variant="primary"
            onClick={handleSubmit}
          />
        </box>
      </DialogFooter>
    </DialogBase>
  )
}

DialogPrompt.show = (
  dialog: DialogContext,
  title: string,
  options?: Omit<DialogPromptProps, "title">
) => {
  return new Promise<string | null>((resolve) => {
    let resultValue: string | null = null
    let confirmed = false
    dialog.replace(
      <DialogPrompt
        title={title}
        {...options}
        onConfirm={(value) => {
          resultValue = value
          confirmed = true
        }}
        onCancel={() => {}}
      />,
      () => {
        resolve(confirmed ? resultValue : null)
      }
    )
  })
}
