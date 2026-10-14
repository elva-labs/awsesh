import { createEffect, type ParentProps } from "solid-js"
import { useKV } from "./kv"
import { useConfig } from "./config"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { DialogConfirm } from "../ui/dialog-confirm"
import { Config } from "@/config/config"
import { WSL } from "@/util/wsl"

const WSL_PROMPTED_KEY = "use-wsl-credentials-prompted"

export function UseWslCredentialsProvider(props: ParentProps) {
  const kv = useKV()
  const config = useConfig()
  const dialog = useDialog()
  const toast = useToast()

  createEffect(() => {
    if (!kv.ready) return
    if (!WSL.isWindows()) return

    ;(async () => {
      if (kv.get(WSL_PROMPTED_KEY, false)) return

      const available = await WSL.isAvailable()
      if (!available) {
        kv.set(WSL_PROMPTED_KEY, true)
        return
      }

      const confirmed = await DialogConfirm.show(dialog, {
        title: "WSL Detected",
        message:
          "Write AWS credentials to WSL instead of Windows when assuming roles? You can change this later in Settings.",
        confirmLabel: "Use WSL",
        cancelLabel: "Keep Windows",
      })

      kv.set(WSL_PROMPTED_KEY, true)

      if (confirmed) {
        config.set("useWslCredentials", true)
        await Config.setUseWslCredentials(true)
        toast.show({ variant: "success", message: "Credentials will target WSL" })
      }
    })()
  })

  return <>{props.children}</>
}
