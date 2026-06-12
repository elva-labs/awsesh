import { describe, expect, test } from "bun:test"
import { removeEvalFlags, resolveEvalRelaunchCommand } from "./eval-relaunch"

describe("removeEvalFlags", () => {
  test("removes both eval flag variants", () => {
    expect(removeEvalFlags(["--eval", "set", "-e", "foo"])).toEqual(["set", "foo"])
  })
})

describe("resolveEvalRelaunchCommand", () => {
  test("uses awsesh command when running from bunfs", () => {
    const result = resolveEvalRelaunchCommand([
      "/opt/homebrew/bin/bun",
      "/$bunfs/root/src/index.js",
      "--eval",
      "--log-level",
      "DEBUG",
    ])

    expect(result).toEqual({
      command: "awsesh",
      args: ["--log-level", "DEBUG"],
    })
  })

  test("relaunches via current runtime for normal script paths", () => {
    const result = resolveEvalRelaunchCommand([
      "/opt/homebrew/bin/bun",
      "/Users/dev/awsesh/src/index.ts",
      "--eval",
      "--browser",
    ])

    expect(result).toEqual({
      command: "/opt/homebrew/bin/bun",
      args: ["/Users/dev/awsesh/src/index.ts", "--browser"],
    })
  })
})
