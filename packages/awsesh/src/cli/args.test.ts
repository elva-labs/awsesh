import { describe, expect, test } from "bun:test"
import { normalizeCliArgs } from "./args"

describe("normalizeCliArgs", () => {
  test("resolves direct positional invocation to session command", () => {
    expect(normalizeCliArgs(["my-session", "account", "role"])).toEqual([
      "session",
      "my-session",
      "account",
      "role",
    ])
  })

  test("keeps explicit commands unchanged", () => {
    expect(normalizeCliArgs(["set", "my-session", "account", "role"])).toEqual([
      "set",
      "my-session",
      "account",
      "role",
    ])
  })

  test("supports eval flag before positional session args", () => {
    expect(normalizeCliArgs(["--eval", "my-session", "account", "role"])).toEqual([
      "session",
      "--eval",
      "my-session",
      "account",
      "role",
    ])
  })

  test("keeps bare eval flag for root tui command", () => {
    expect(normalizeCliArgs(["--eval"])).toEqual(["--eval"])
  })

  test("ignores global option values when finding command token", () => {
    expect(normalizeCliArgs(["--log-level", "DEBUG", "set", "my-session", "account"]))
      .toEqual(["--log-level", "DEBUG", "set", "my-session", "account"])
  })
})
