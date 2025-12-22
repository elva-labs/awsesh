import type { Argv, CommandModule } from "yargs"

export function cmd<T>(input: {
  command: string
  describe: string
  builder: (yargs: Argv) => Argv
  handler: (args: T) => Promise<void>
}): CommandModule {
  return {
    command: input.command,
    describe: input.describe,
    builder: input.builder,
    handler: input.handler as any,
  }
}
