import { test, expect } from "bun:test"
import { WSL } from "./wsl"

test("non-windows returns no WSL", async () => {
  if (process.platform === "win32") return
  expect(WSL.isWindows()).toBe(false)
  expect(await WSL.isAvailable()).toBe(false)
  expect(await WSL.resolveAwsDir()).toBeUndefined()
})
