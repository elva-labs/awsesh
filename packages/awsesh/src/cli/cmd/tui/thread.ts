import { cmd } from "../cmd"
import { openDefaultProfileInBrowser } from "../util/open-default-profile-browser"

export const TuiCommand = cmd({
  command: "$0",
  describe: "Interactive AWS Session Manager",
  builder: (yargs) =>
    yargs.option("browser", {
      alias: "b",
      type: "boolean",
      describe: "Open AWS console for active default profile",
      default: false,
    }),
  handler: async (args) => {
    const { browser } = args as { browser: boolean }
    if (browser) {
      await openDefaultProfileInBrowser()
      return
    }

    const { tui } = await import("./app")
    await tui()
  },
})
