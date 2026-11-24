import { mkdir, readFile, rename, rm } from "node:fs/promises"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import path from "node:path"
import { createInterface } from "node:readline"

/** Only the desktop's workspace selector lives here; CLI/TUI configuration is unchanged. */
export async function readWorkspace(configDir: string): Promise<boolean> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(configDir, "workspace.json"), "utf8"))
    if (typeof value !== "object" || value === null || !("useWslWorkspace" in value) || typeof value.useWslWorkspace !== "boolean") {
      throw new Error("Invalid desktop workspace settings")
    }
    return value.useWslWorkspace
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

async function saveWorkspace(configDir: string, enabled: boolean) {
  await mkdir(configDir, { recursive: true })
  const filename = path.join(configDir, "workspace.json")
  const temporary = `${filename}.${process.pid}.tmp`
  try {
    await Bun.write(temporary, JSON.stringify({ useWslWorkspace: enabled }, null, 2))
    await rename(temporary, filename)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function isWslAvailable(): Promise<boolean> {
  if (process.platform !== "win32" || !Bun.which("wsl")) return false
  try {
    const child = Bun.spawn(["wsl", "--list", "--quiet"], { stdout: "pipe", stderr: "ignore" })
    const stdout = await new Response(child.stdout).text()
    return await child.exited === 0 && stdout.replace(/\0/g, "").trim().length > 0
  } catch { return false }
}

/** Pass the Windows path as an argument, never interpolate it into shell code. */
export function wslCommand(helper: string): string[] {
  return ["wsl", "--exec", "sh", "-lc", 'exec "$(wslpath -u "$1")"', "sesh-sdk", helper]
}

export class WslHelper {
  private child: ChildProcessWithoutNullStreams
  private lines: ReturnType<typeof createInterface>
  private pending = new Map<number, PromiseWithResolvers<unknown>>()
  private stderr = ""
  private closed = false
  private stopped = false
  private exited: Promise<void>

  constructor(command: string[]) {
    this.child = spawn(command[0], command.slice(1), { stdio: "pipe", windowsHide: true })
    this.exited = new Promise(resolve => this.child.once("close", () => {
      this.stopped = true
      resolve()
    }))
    this.lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity })
    this.lines.on("line", (line) => {
      try {
        const value: unknown = JSON.parse(line)
        if (typeof value !== "object" || value === null) throw new Error("Invalid WSL SDK response")
        const id = "id" in value && typeof value.id === "number" ? value.id : 0
        const response = this.pending.get(id)
        if ("error" in value) response?.reject(new Error(String(value.error)))
        else if ("result" in value) response?.resolve(value.result)
        else response?.reject(new Error("Missing WSL SDK result"))
      } catch (error) {
        for (const response of this.pending.values()) response.reject(error)
      }
    })
    this.lines.on("close", () => {
      this.stopped = true
      const detail = this.stderr.trim()
      const error = new Error(`WSL SDK helper stopped unexpectedly.${detail ? ` ${detail}` : ""}`)
      for (const response of this.pending.values()) response.reject(error)
    })
    this.child.stderr.on("data", chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-2000) })
    this.child.on("error", error => {
      this.stopped = true
      this.stderr = error.message
      this.lines.close()
    })
    this.child.stdin.on("error", error => {
      this.stopped = true
      this.stderr = error.message
      this.lines.close()
    })
  }

  get running(): boolean {
    return !this.closed && !this.stopped
  }

  async request(operation: string, args: Record<string, unknown>, timeout = 0, id?: number): Promise<unknown> {
    if (!this.running) throw new Error("WSL SDK helper stopped unexpectedly.")
    const key = id ?? 0
    if (this.pending.has(key)) throw new Error("WSL SDK request already in progress")
    const response = Promise.withResolvers<unknown>()
    this.pending.set(key, response)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      this.child.stdin.write(JSON.stringify({ operation, args, id }) + "\n")
      if (timeout) {
        timer = setTimeout(() => response.reject(new Error("WSL SDK helper did not respond. Check your default WSL distribution.")), timeout)
      }
      return await response.promise
    } finally {
      this.pending.delete(key)
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  async close() {
    if (this.closed) return this.exited
    this.closed = true
    // EOF lets the Linux helper exit cleanly, including when its Windows parent exits.
    this.child.stdin.end()
    this.lines.close()
    const timer = setTimeout(() => this.child.kill(), 1000)
    timer.unref()
    try {
      await this.exited
    } finally {
      clearTimeout(timer)
    }
  }
}

export class WslWorkspace {
  private helper: WslHelper | undefined
  private selection: boolean | undefined

  constructor(private configDir: string, private helperPath: string) {}

  async enabled(): Promise<boolean> {
    return this.selection ??= process.platform === "win32" && await readWorkspace(this.configDir)
  }

  private async start() {
    if (process.platform !== "win32") throw new Error("WSL workspaces are only available on Windows")
    if (!await Bun.file(this.helperPath).exists()) throw new Error("The bundled Linux SDK helper is missing. Rebuild or reinstall Sesh.")
    const helper = new WslHelper(wslCommand(this.helperPath))
    try {
      const snapshot = await helper.request("snapshot", {}, 30000)
      if (typeof snapshot !== "object" || snapshot === null || !("sessions" in snapshot) || !Array.isArray(snapshot.sessions)) {
        throw new Error("Invalid WSL workspace snapshot")
      }
      return { helper, snapshot }
    } catch (error) {
      await helper.close()
      throw error
    }
  }

  async request(operation: string, args: Record<string, unknown>, id?: number) {
    if (id !== undefined) {
      // Account revalidation only starts after a foreground session selection opened the helper.
      if (!this.helper?.running) throw new Error("WSL SDK helper stopped unexpectedly.")
      return this.helper.request(operation, args, 0, id)
    }
    // Never fall back to Windows state if the selected WSL workspace is unavailable.
    // Restart only on the next request; a failed mutation may already have completed.
    if (this.helper && !this.helper.running) await this.close()
    this.helper ??= (await this.start()).helper
    return this.helper.request(operation, args)
  }

  async enable(): Promise<unknown> {
    const { helper, snapshot } = await this.start()
    try {
      await saveWorkspace(this.configDir, true)
      await this.close()
      this.helper = helper
      this.selection = true
      return snapshot
    } catch (error) {
      await helper.close()
      throw error
    }
  }

  async disable() {
    await saveWorkspace(this.configDir, false)
    await this.close()
    this.selection = false
  }

  async close() {
    await this.helper?.close()
    this.helper = undefined
  }
}
