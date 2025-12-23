#!/usr/bin/env bun
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { Log } from "./util/log"
import { UI } from "./cli/ui"

import { auth } from "./cli/cmd/auth.js"
import { whoami } from "./cli/cmd/whoami.js"
import { session } from "./cli/cmd/session.js"
import { migrate } from "./cli/cmd/migrate.js"
import { config, data } from "./cli/cmd/open.js"
import { TuiCommand } from "./cli/cmd/tui/thread.js"

declare const AWSESH_VERSION: string
const VERSION = typeof AWSESH_VERSION !== "undefined" ? AWSESH_VERSION : "1.0.0-dev"

const cli = yargs(hideBin(process.argv))
  .scriptName("awsesh")
  .help("help", "show help")
  .alias("help", "h")
  .version("version", VERSION)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .middleware(async (opts) => {
    await Log.init({
      level: (opts.logLevel as Log.Level) || "INFO",
      print: opts.printLogs || false,
    })
    
    Log.Default.info("awsesh started", {
      version: VERSION,
      args: process.argv.slice(2),
    })
  })
  .usage(`\n${UI.logo()}`)
  .command(TuiCommand)
  .command(session)
  .command(auth)
  .command(whoami)
  .command(migrate)
  .command(config)
  .command(data)
  .demandCommand(0, 1, "")
  .fail((msg, err) => {
    if (msg) {
      UI.error(msg)
    }
    if (err) {
      UI.error(err.message)
    }
    process.exit(1)
  })
  .strict()

try {
  await cli.parse()
} catch (e) {
  const error = e as Error
  Log.Default.error("Fatal error", { error: error.message, stack: error.stack })
  UI.error(error.message)
  process.exit(1)
}
