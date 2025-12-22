import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "./keybind"
import { useDialog, type DialogContext } from "../ui/dialog"
import { DialogCommand } from "../ui/dialog-command"
import type { KeybindsConfig } from "./config"

export interface CommandOption {
  id: string
  title: string
  description?: string
  category?: string
  keybind?: keyof KeybindsConfig
  disabled?: boolean
  onSelect?: (ctx: DialogContext) => void
}

interface CommandContext {
  options: CommandOption[]
  register: (cb: () => CommandOption[]) => void
  show: () => void
  trigger: (id: string) => void
  suspended: () => boolean
  suspend: (enabled: boolean) => void
}

const ctx = createContext<CommandContext>()

function init(dialog: ReturnType<typeof useDialog>, keybind: ReturnType<typeof useKeybind>) {
  const [registrations, setRegistrations] = createSignal<Accessor<CommandOption[]>[]>([])
  const [suspendCount, setSuspendCount] = createSignal(0)

  const options = createMemo(() => {
    return registrations()
      .flatMap((x) => x())
      .map((x) => ({
        ...x,
        footer: x.keybind ? keybind.print(x.keybind) : undefined,
      }))
  })

  const suspended = () => suspendCount() > 0

  useKeyboard((evt) => {
    if (suspended()) return
    if (dialog.stack.length > 0) return
    if (evt.defaultPrevented) return
    for (const option of options()) {
      if (option.keybind && keybind.match(option.keybind, evt)) {
        evt.preventDefault()
        option.onSelect?.(dialog)
        return
      }
    }
  })

  return {
    get options() {
      return options()
    },
    register(cb: () => CommandOption[]) {
      const results = createMemo(cb)
      setRegistrations((arr) => [results, ...arr])
      onCleanup(() => {
        setRegistrations((arr) => arr.filter((x) => x !== results))
      })
    },
    show() {
      dialog.replace(() => <DialogCommand options={options()} />)
    },
    trigger(id: string) {
      for (const option of options()) {
        if (option.id === id) {
          option.onSelect?.(dialog)
          return
        }
      }
    },
    suspended,
    suspend(enabled: boolean) {
      setSuspendCount((count) => count + (enabled ? 1 : -1))
    },
  }
}

export function useCommand() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useCommand must be used within a CommandProvider")
  }
  return value
}

export function CommandProvider(props: ParentProps) {
  const dialog = useDialog()
  const keybind = useKeybind()
  const value = init(dialog, keybind)

  useKeyboard((evt) => {
    if (value.suspended()) return
    if (dialog.stack.length > 0) return
    if (evt.defaultPrevented) return
    if (keybind.match("command_list", evt)) {
      evt.preventDefault()
      value.show()
      return
    }
  })

  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}
