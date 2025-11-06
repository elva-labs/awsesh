import { cmd } from "../cmd.js";
import { tui } from "./app";
import { withInstance } from "@/instance/instance";

/**
 * TUI command - the default command when no arguments are provided
 */
export const TuiCommand = cmd({
  command: "$0",
  describe: "Interactive AWS Session Manager",
  builder: (yargs) => yargs,
  handler: async () => {
    await withInstance(async () => {
      await tui();
    });
  },
});
