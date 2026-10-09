import { buildMacos } from "./build-macos"
import { buildWindows } from "./build-windows"

const builders = {
  "darwin-arm64": buildMacos,
  "win32-x64": buildWindows,
} as const

const host = `${process.platform}-${process.arch}`
const builder = builders[host as keyof typeof builders]
if (!builder) {
  throw new Error(`Unsupported build host ${host}. Build the macOS app on ARM64 macOS and the Windows client on Windows x64.`)
}
await builder()
