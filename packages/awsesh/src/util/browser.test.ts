import { describe, expect, test, afterEach } from "bun:test"
import { browserAvailable } from "./browser"

describe("browserAvailable", () => {
  const saved = {
    AWSESH_NO_BROWSER: process.env.AWSESH_NO_BROWSER,
    CI: process.env.CI,
    DISPLAY: process.env.DISPLAY,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
  }

  function set(key: keyof typeof saved, value?: string) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      set(key as keyof typeof saved, value)
    }
  })

  test("opts out when AWSESH_NO_BROWSER is set", () => {
    set("AWSESH_NO_BROWSER", "1")
    set("DISPLAY", ":0")
    expect(browserAvailable()).toBe(false)
  })

  test("opts out in CI", () => {
    set("AWSESH_NO_BROWSER", undefined)
    set("CI", "true")
    set("DISPLAY", ":0")
    expect(browserAvailable()).toBe(false)
  })

  test("is false on headless linux (no display)", () => {
    if (process.platform !== "linux") return
    set("AWSESH_NO_BROWSER", undefined)
    set("CI", undefined)
    set("DISPLAY", undefined)
    set("WAYLAND_DISPLAY", undefined)
    expect(browserAvailable()).toBe(false)
  })

  test("is true on linux with a display", () => {
    if (process.platform !== "linux") return
    set("AWSESH_NO_BROWSER", undefined)
    set("CI", undefined)
    set("DISPLAY", ":0")
    expect(browserAvailable()).toBe(true)
  })
})
