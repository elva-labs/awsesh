import open from "open"

/**
 * Check whether a browser can plausibly be opened on this machine.
 *
 * Returns false on headless hosts (no display server on Linux), in CI, or when
 * the user opts out via AWSESH_NO_BROWSER. This lets callers degrade to printing
 * the URL instead of crashing when there is no `xdg-open`/display available.
 */
export function browserAvailable(): boolean {
  if (process.env.AWSESH_NO_BROWSER) return false
  if (process.env.CI) return false

  if (process.platform === "linux") {
    return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  }

  // macOS `open` and Windows `start` are always present.
  return true
}

/**
 * Attempt to open `url` in the default browser.
 *
 * Never throws: returns true if a browser was launched, false if none is
 * available or the launch failed. Callers should fall back to printing the URL
 * when this returns false.
 */
export async function openBrowser(url: string): Promise<boolean> {
  if (!browserAvailable()) return false

  try {
    await open(url)
    return true
  } catch {
    return false
  }
}
