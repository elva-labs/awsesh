export interface RelaunchCommand {
  command: string
  args: string[]
}

export function removeEvalFlags(args: string[]): string[] {
  return args.filter((arg) => arg !== "--eval" && arg !== "-e")
}

export function resolveEvalRelaunchCommand(argv: string[]): RelaunchCommand {
  const scriptPath = argv[1] ?? ""
  if (scriptPath.startsWith("/$bunfs/")) {
    return {
      command: "awsesh",
      args: removeEvalFlags(argv.slice(2)),
    }
  }

  return {
    command: argv[0],
    args: removeEvalFlags(argv.slice(1)),
  }
}
