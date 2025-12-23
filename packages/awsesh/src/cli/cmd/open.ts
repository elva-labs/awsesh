import { spawn } from "node:child_process"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { Global } from "@/global"

function openFolder(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"
    const child = spawn(command, [path], {
      stdio: "inherit",
      detached: true,
    })
    child.on("error", reject)
    child.on("close", () => resolve())
    child.unref()
  })
}

export const config = cmd({
  command: "config",
  describe: "Open config folder in file manager",
  builder: (yargs) => yargs,
  handler: async () => {
    UI.info(`Opening config folder: ${Global.Path.config}`)
    await openFolder(Global.Path.config)
  },
})

export const data = cmd({
  command: "data",
  describe: "Open data folder in file manager",
  builder: (yargs) => yargs,
  handler: async () => {
    UI.info(`Opening data folder: ${Global.Path.data}`)
    await openFolder(Global.Path.data)
  },
})
