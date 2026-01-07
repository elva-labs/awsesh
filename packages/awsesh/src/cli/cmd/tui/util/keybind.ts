import type { ParsedKey } from "@opentui/core"

export namespace Keybind {
  export interface Info {
    ctrl: boolean
    name: string
    shift: boolean
    leader: boolean
    meta: boolean
  }

  export function fromParsedKey(key: ParsedKey, leader = false): Info {
    return {
      name: key.name,
      ctrl: key.ctrl,
      meta: key.meta,
      shift: key.shift,
      leader,
    }
  }

  export function parse(str: string): Info {
    const withLeader = str.replace(/<leader>\+?/gi, "leader+")
    const parts = withLeader.split("+").filter((p) => p.length > 0)
    const result: Info = {
      ctrl: false,
      shift: false,
      leader: false,
      meta: false,
      name: "",
    }

    for (const part of parts) {
      const lower = part.toLowerCase()
      if (lower === "ctrl") result.ctrl = true
      else if (lower === "shift") result.shift = true
      else if (lower === "meta" || lower === "cmd") result.meta = true
      else if (lower === "leader") result.leader = true
      else if (lower === "space") result.name = "space"
      else {
        if (part.length === 1 && part !== part.toLowerCase()) {
          result.shift = true
        }
        result.name = lower
      }
    }

    return result
  }

  export function match(keybind: Info, input: Info): boolean {
    return (
      keybind.ctrl === input.ctrl &&
      keybind.shift === input.shift &&
      keybind.meta === input.meta &&
      keybind.leader === input.leader &&
      keybind.name === input.name
    )
  }

  export function format(keybind: Info): string {
    const parts: string[] = []
    if (keybind.leader) parts.push("<leader>")
    if (keybind.ctrl) parts.push("ctrl")
    if (keybind.meta) parts.push("meta")
    if (keybind.name) {
      if (keybind.shift && keybind.name.length === 1) {
        parts.push(keybind.name.toUpperCase())
      } else {
        if (keybind.shift) parts.push("shift")
        parts.push(keybind.name)
      }
    }
    return parts.join("+")
  }

  export function toShortString(keybind: Info): string {
    const parts: string[] = []
    if (keybind.ctrl) parts.push("C")
    if (keybind.shift) parts.push("S")
    if (keybind.meta) parts.push("M")
    parts.push(keybind.name)
    return parts.join("-")
  }
}
