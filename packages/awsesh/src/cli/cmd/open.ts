import { spawn } from "node:child_process"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { Global } from "@/global"

function openWithEditor(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const editor = process.env.EDITOR || process.env.VISUAL
    if (!editor) {
      UI.warn("No $EDITOR or $VISUAL set. Set one with: export EDITOR=nvim")
      UI.info("Falling back to system file manager...")
      const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"
      const child = spawn(command, [path], {
        stdio: "inherit",
        detached: true,
      })
      child.on("error", reject)
      child.on("close", () => resolve())
      child.unref()
      return
    }
    const child = spawn(editor, [path], {
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("close", () => resolve())
  })
}

export const config = cmd({
  command: "config",
  describe: "Open config folder in editor",
  builder: (yargs) => yargs,
  handler: async () => {
    UI.info(`Opening config folder: ${Global.Path.config}`)
    await openWithEditor(Global.Path.config)
  },
})

export const data = cmd({
  command: "data",
  describe: "Open data folder in editor",
  builder: (yargs) => yargs,
  handler: async () => {
    UI.info(`Opening data folder: ${Global.Path.data}`)
    await openWithEditor(Global.Path.data)
  },
})
