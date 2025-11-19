import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

/**
 * Copy text to clipboard
 * Returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const platform = process.platform
    
    if (platform === "darwin") {
      // macOS
      await execAsync(`echo "${escapeForShell(text)}" | pbcopy`)
      return true
    } else if (platform === "linux") {
      // Try xclip first, then xsel
      try {
        await execAsync(`echo "${escapeForShell(text)}" | xclip -selection clipboard`)
        return true
      } catch {
        try {
          await execAsync(`echo "${escapeForShell(text)}" | xsel --clipboard --input`)
          return true
        } catch {
          return false
        }
      }
    } else if (platform === "win32") {
      // Windows
      await execAsync(`echo ${escapeForShell(text)} | clip`)
      return true
    }
    
    return false
  } catch (error) {
    console.error("Failed to copy to clipboard:", error)
    return false
  }
}

/**
 * Check if clipboard functionality is available
 */
export function isClipboardAvailable(): boolean {
  const platform = process.platform
  return platform === "darwin" || platform === "linux" || platform === "win32"
}

/**
 * Escape text for shell execution
 */
function escapeForShell(text: string): string {
  return text.replace(/"/g, '\\"')
}
