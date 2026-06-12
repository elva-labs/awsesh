import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import { cmd } from "../cmd"
import { openDefaultProfileInBrowser } from "../util/open-default-profile-browser"
import { printEvalEnvironment } from "@/util/styled-output"
import { resolveEvalRelaunchCommand, type RelaunchCommand } from "./eval-relaunch"

interface EvalCapture {
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: string
}

async function runChild(command: RelaunchCommand, captureFile: string): Promise<number> {
  const child = spawn(command.command, command.args, {
    stdio: ["inherit", process.stderr, "inherit"],
    env: {
      ...process.env,
      AWSESH_TUI_EVAL_CAPTURE_FILE: captureFile,
    },
  })

  return await new Promise<number>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", (code) => resolve(code ?? 1))
  })
}

async function runTuiForEvalMode(): Promise<void> {
  const captureFile = path.join(tmpdir(), `awsesh-eval-${process.pid}-${Date.now()}.json`)

  const primaryCommand = resolveEvalRelaunchCommand(process.argv)
  let exitCode: number

  try {
    exitCode = await runChild(primaryCommand, captureFile)
  } catch (error) {
    const fallbackAllowed =
      primaryCommand.command === "awsesh" &&
      (error as NodeJS.ErrnoException).code === "ENOENT"

    if (!fallbackAllowed) {
      throw error
    }

    throw new Error(
      "Failed to relaunch awsesh in eval mode: command 'awsesh' was not found in PATH. Ensure awsesh is installed and available in your shell.",
    )
  }

  let capture: EvalCapture | undefined
  try {
    const raw = await fs.readFile(captureFile, "utf-8")
    capture = JSON.parse(raw) as EvalCapture
  } catch {}

  await fs.rm(captureFile, { force: true })

  if (exitCode !== 0) {
    process.exit(exitCode)
  }

  if (capture) {
    printEvalEnvironment(capture)
  }
}

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
    const { browser, eval: evalMode } = args as { browser: boolean; eval?: boolean }
    if (browser) {
      await openDefaultProfileInBrowser()
      return
    }

    if (evalMode) {
      await runTuiForEvalMode()
      return
    }

    const { tui } = await import("./app")
    await tui()
  },
})
