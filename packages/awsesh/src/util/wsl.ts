let cachedAwsDir: string | undefined | null = null // null = not resolved yet

async function spawn(cmd: string[]): Promise<{ stdout: string; code: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const code = await proc.exited
  return { stdout, code }
}

export namespace WSL {
  export function isWindows(): boolean {
    return process.platform === "win32"
  }

  /** Check if WSL is installed and has at least one distribution. */
  export async function isAvailable(): Promise<boolean> {
    if (!isWindows()) return false
    if (!Bun.which("wsl")) return false
    try {
      const { stdout } = await spawn(["wsl", "--list", "--quiet"])
      // wsl --list --quiet may output UTF-16LE with null bytes on some Windows versions
      return stdout.replace(/\0/g, "").trim().length > 0
    } catch {
      return false
    }
  }

  /**
   * Resolve the default WSL distro's ~/.aws directory as a Windows path.
   * Result is cached for the lifetime of the process (the path doesn't change mid-session).
   */
  export async function resolveAwsDir(): Promise<string | undefined> {
    if (cachedAwsDir !== null) return cachedAwsDir
    if (!isWindows()) {
      cachedAwsDir = undefined
      return undefined
    }
    try {
      // sh -c so the shell expands ~ to $HOME
      const { stdout, code } = await spawn(["wsl", "sh", "-c", "wslpath -w ~/.aws"])
      cachedAwsDir = code === 0 && stdout.trim() ? stdout.trim() : undefined
      return cachedAwsDir
    } catch {
      cachedAwsDir = undefined
      return undefined
    }
  }

  /** Reset the cached path (for testing). */
  export function resetCache(): void {
    cachedAwsDir = null
  }
}
