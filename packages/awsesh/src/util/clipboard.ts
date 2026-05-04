import { $ } from "bun"

/**
 * Copy text to clipboard using platform-native tools
 * Returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const os = process.platform

  try {
    if (os === "darwin") {
      const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
      await $`osascript -e 'set the clipboard to "${escaped}"'`.nothrow().quiet()
      return true
    }

    if (os === "linux") {
      if (process.env.WAYLAND_DISPLAY && Bun.which("wl-copy")) {
        const proc = Bun.spawn(["wl-copy"], { stdin: "pipe", stdout: "ignore", stderr: "ignore" })
        proc.stdin.write(text)
        proc.stdin.end()
        await proc.exited.catch(() => {})
        return true
      }
      if (Bun.which("xclip")) {
        const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        })
        proc.stdin.write(text)
        proc.stdin.end()
        await proc.exited.catch(() => {})
        return true
      }
      if (Bun.which("xsel")) {
        const proc = Bun.spawn(["xsel", "--clipboard", "--input"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        })
        proc.stdin.write(text)
        proc.stdin.end()
        await proc.exited.catch(() => {})
        return true
      }
      return false
    }

    if (os === "win32") {
      const escaped = text.replace(/"/g, '""')
      await $`powershell -command "Set-Clipboard -Value \"${escaped}\""`.nothrow().quiet()
      return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Check if clipboard functionality is available
 */
export function isClipboardAvailable(): boolean {
  const os = process.platform

  if (os === "darwin") return true
  if (os === "win32") return true
  if (os === "linux") {
    return !!(
      (process.env.WAYLAND_DISPLAY && Bun.which("wl-copy")) ||
      Bun.which("xclip") ||
      Bun.which("xsel")
    )
  }

  return false
}
