#!/usr/bin/env bun
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { Log } from "./util/log"
import { UI } from "./cli/ui"

import { auth } from "./cli/cmd/auth.js"
import { whoami } from "./cli/cmd/whoami.js"

import { migrate } from "./cli/cmd/migrate.js"
import { config, data } from "./cli/cmd/open.js"
import { TuiCommand } from "./cli/cmd/tui/thread.js"
import { sessions } from "./cli/cmd/sessions.js"
import { accounts } from "./cli/cmd/accounts.js"
import { credentials } from "./cli/cmd/credentials.js"
import { set } from "./cli/cmd/set.js"

import { Installation } from "./installation"

const args = hideBin(process.argv)
if (args.includes("--help") || args.includes("-h")) {
  console.log(UI.logo())
}

const cli = yargs(args)
  .scriptName("awsesh")
  .help("help", "show help")
  .alias("help", "h")
  .version("version", Installation.VERSION)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-file", {
    describe: "write logs to file (auto-enabled in dev mode)",
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
      file: opts.logFile,
    })
    
    Log.Default.info("awsesh started", {
      version: Installation.VERSION,
      args: process.argv.slice(2),
      logFile: Log.file(),
    })
  })
  .usage("")
  .command(TuiCommand)
  .command(set)
  .command(sessions)
  .command(accounts)
  .command(credentials)
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
