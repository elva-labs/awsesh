import { cmd } from "../cmd.js";
import { withInstance } from "@/instance/instance";

export const TuiCommand = cmd({
  command: "$0",
  describe: "Interactive AWS Session Manager",
  builder: (yargs) => yargs,
  handler: async () => {
    const { tui } = await import("./app.js");
    await withInstance(async () => {
      await tui();
    });
  },
});
