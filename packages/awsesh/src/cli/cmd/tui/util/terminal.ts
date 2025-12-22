import { RGBA } from "@opentui/core"

export namespace Terminal {
  export type Colors = Awaited<ReturnType<typeof colors>>

  export async function colors(): Promise<{
    background: RGBA | null
    foreground: RGBA | null
    colors: RGBA[]
  }> {
    if (!process.stdin.isTTY) return { background: null, foreground: null, colors: [] }

    return new Promise((resolve) => {
      let background: RGBA | null = null
      let foreground: RGBA | null = null
      const paletteColors: RGBA[] = []
      const timeout: NodeJS.Timeout = setTimeout(() => {
        cleanup()
        resolve({ background, foreground, colors: paletteColors })
      }, 1000)

      const cleanup = () => {
        process.stdin.setRawMode(false)
        process.stdin.removeListener("data", handler)
        clearTimeout(timeout)
      }

      const parseColor = (colorStr: string): RGBA | null => {
        if (colorStr.startsWith("rgb:")) {
          const parts = colorStr.substring(4).split("/")
          return RGBA.fromInts(
            Number.parseInt(parts[0], 16) >> 8,
            Number.parseInt(parts[1], 16) >> 8,
            Number.parseInt(parts[2], 16) >> 8,
            255
          )
        }
        if (colorStr.startsWith("#")) {
          return RGBA.fromHex(colorStr)
        }
        if (colorStr.startsWith("rgb(")) {
          const parts = colorStr.substring(4, colorStr.length - 1).split(",")
          return RGBA.fromInts(
            Number.parseInt(parts[0]),
            Number.parseInt(parts[1]),
            Number.parseInt(parts[2]),
            255
          )
        }
        return null
      }

      // biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal escape sequences require control characters
      const bgPattern = /\x1b]11;([^\x07\x1b]+)/
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal escape sequences require control characters
      const fgPattern = /\x1b]10;([^\x07\x1b]+)/
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Terminal escape sequences require control characters
      const palettePattern = /\x1b]4;(\d+);([^\x07\x1b]+)/g

      const handler = (data: Buffer) => {
        const str = data.toString()

        const bgMatch = bgPattern.exec(str)
        if (bgMatch) {
          background = parseColor(bgMatch[1])
        }

        const fgMatch = fgPattern.exec(str)
        if (fgMatch) {
          foreground = parseColor(fgMatch[1])
        }

        const paletteMatches = str.matchAll(palettePattern)
        for (const match of paletteMatches) {
          const index = Number.parseInt(match[1])
          const color = parseColor(match[2])
          if (color) paletteColors[index] = color
        }

        if (paletteColors.filter((c) => c !== undefined).length === 16) {
          cleanup()
          resolve({ background, foreground, colors: paletteColors })
        }
      }

      process.stdin.setRawMode(true)
      process.stdin.on("data", handler)

      process.stdout.write("\x1b]11;?\x07")
      process.stdout.write("\x1b]10;?\x07")
      for (let i = 0; i < 16; i++) {
        process.stdout.write(`\x1b]4;${i};?\x07`)
      }
    })
  }

  export async function getTerminalBackgroundColor(): Promise<"dark" | "light"> {
    const result = await colors()
    if (!result.background) return "dark"

    const { r, g, b } = result.background
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

    return luminance > 0.5 ? "light" : "dark"
  }
}
