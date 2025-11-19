import { cmd } from "../cmd.js";
import { withInstance } from "@/instance/instance";

export const TuiCommand = cmd({
  command: "$0",
  describe: "Interactive AWS Session Manager",
  builder: (yargs) => yargs,
  handler: async () => {
    const { start } = await import("@/app/app.js");
    await withInstance(async () => {
      await start();
    });
  },
});
