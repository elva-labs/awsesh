import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import { cmd } from "../cmd"
import { openDefaultProfileInBrowser } from "../util/open-default-profile-browser"
import { printEvalEnvironment } from "@/util/styled-output"

interface EvalCapture {
  accountId: string
  accountName: string
  roleName: string
  sessionName: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: string
}

async function runTuiForEvalMode(): Promise<void> {
  const captureFile = path.join(tmpdir(), `awsesh-eval-${process.pid}-${Date.now()}.json`)
  const childArgs = process.argv.slice(1).filter((arg) => arg !== "--eval" && arg !== "-e")

  const child = spawn(process.argv[0], childArgs, {
    stdio: ["inherit", process.stderr, "inherit"],
    env: {
      ...process.env,
      AWSESH_TUI_EVAL_CAPTURE_FILE: captureFile,
    },
  })

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", (code) => resolve(code ?? 1))
  })

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
