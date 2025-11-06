import { cmd } from "../cmd.js";
import { withInstance } from "@/instance/instance";

/**
 * TUI command - the default command when no arguments are provided
 */
export const TuiCommand = cmd({
  command: "$0",
  describe: "Interactive AWS Session Manager",
  builder: (yargs) => yargs,
  handler: async () => {
    // Dynamic import to avoid loading JSX until needed
    const { tui } = await import("./app.js");
    await withInstance(async () => {
      await tui();
    });
  },
});
