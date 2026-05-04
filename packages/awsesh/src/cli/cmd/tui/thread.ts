import { cmd } from "../cmd"

export const TuiCommand = cmd({
  command: "$0",
  describe: "Interactive AWS Session Manager",
  builder: (yargs) => yargs,
  handler: async () => {
    const { tui } = await import("./app")
    await tui()
  },
})
