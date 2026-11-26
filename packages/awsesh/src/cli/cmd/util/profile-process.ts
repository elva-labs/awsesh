export function commandArguments(value: unknown, usage: string): string[] {
  if (!Array.isArray(value) || !value.length || !value.every((argument) => typeof argument === "string")) {
    throw new Error(`Usage: awsesh ${usage} -- <command> [args…]`)
  }
  return value
}

export function credentialCommand(): string[] {
  const compiled = /^(\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(Bun.main)
  const command = compiled ? [process.execPath] : [process.execPath, "--no-env-file", "run", Bun.main]
  return [...command, "profiles", "credential-process"]
}

export async function runCommand(argv: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const child = Bun.spawn(argv, { env, stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  const interrupt = () => child.kill("SIGINT")
  const terminate = () => child.kill("SIGTERM")
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", terminate)
  try {
    return await child.exited
  } finally {
    process.off("SIGINT", interrupt)
    process.off("SIGTERM", terminate)
  }
}
