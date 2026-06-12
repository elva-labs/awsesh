const commandNames = new Set([
  "set",
  "sessions",
  "accounts",
  "credentials",
  "auth",
  "whoami",
  "migrate",
  "config",
  "data",
  "session",
  "help",
  "version",
])

const optionsWithValue = new Set(["--log-level"])

function firstCommandLikeToken(args: string[]): string | undefined {
  let skipNext = false

  for (const arg of args) {
    if (skipNext) {
      skipNext = false
      continue
    }

    if (arg === "--") {
      return undefined
    }

    if (optionsWithValue.has(arg)) {
      skipNext = true
      continue
    }

    if (arg.startsWith("-")) {
      continue
    }

    return arg
  }

  return undefined
}

export function normalizeCliArgs(args: string[]): string[] {
  const commandToken = firstCommandLikeToken(args)
  if (!commandToken) return args

  if (commandNames.has(commandToken)) {
    return args
  }

  return ["session", ...args]
}
