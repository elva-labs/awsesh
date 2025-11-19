import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"

export type DialogPromptProps = {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  onConfirm?: (value: string) => void
  onCancel?: () => void
}

export function DialogPrompt(props: DialogPromptProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [value, setValue] = createSignal(props.defaultValue ?? "")
  let input: any

  useKeyboard((evt) => {
    if (evt.name === "return" && !evt.shift) {
      evt.preventDefault()
      props.onConfirm?.(value())
      dialog.clear()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD}>{props.title}</text>
        <text fg={theme.textMuted}>esc</text>
      </box>
      {props.message && (
        <box paddingBottom={1}>
          <text fg={theme.textMuted}>{props.message}</text>
        </box>
      )}
      <box paddingBottom={1}>
        <input
          value={value()}
          onInput={(e) => setValue(e)}
          focusedBackgroundColor={theme.inputBg}
          cursorColor={theme.inputCursor}
          focusedTextColor={theme.inputFocusText}
          placeholder={props.placeholder ?? "Enter value..."}
          ref={(r) => {
            input = r
            setTimeout(() => input.focus(), 1)
          }}
        />
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <text fg={theme.textMuted}>Enter to save</text>
      </box>
    </box>
  )
}

DialogPrompt.show = (
  dialog: DialogContext,
  title: string,
  message?: string,
  defaultValue?: string,
  placeholder?: string,
) => {
  return new Promise<string | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogPrompt
          title={title}
          message={message}
          defaultValue={defaultValue}
          placeholder={placeholder}
          onConfirm={(value) => resolve(value)}
          onCancel={() => resolve(null)}
        />
      ),
      () => resolve(null),
    )
  })
}
