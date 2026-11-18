import { realpathSync } from "node:fs"
import { Config } from "@/config/config"

const COMPILED = /^(\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/

function same(a: string, b: string) {
  try {
    return realpathSync(a) === realpathSync(b)
  } catch {
    return false
  }
}

/**
 * The command the AWS tools run for a managed profile's credentials. It must be an absolute path: tools started
 * from a GUI or an IDE do not see the shell's PATH. A stable link on PATH (such as ~/.local/bin/sesh or
 * Homebrew's /opt/homebrew/bin/sesh) is preferred over the path it points to, so upgrades keep working.
 */
export function credentialCommand(): string[] {
  if (!COMPILED.test(Bun.main)) {
    return [process.execPath, "run", "--conditions=browser", Bun.main, "profiles", "creds"]
  }
  const linked = ["sesh", "awsesh"].map((name) => Bun.which(name)).find((found) => found && same(found, process.execPath))
  return [linked ?? process.execPath, "profiles", "creds"]
}

// With WSL credentials the command would be a Windows path, which the AWS tools inside WSL cannot run
export async function credentialProcess(useWslCredentials?: boolean): Promise<string[] | undefined> {
  if (useWslCredentials ?? (await Config.load()).useWslCredentials) return undefined
  return credentialCommand()
}
