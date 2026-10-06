type Target = {
  os: "linux" | "darwin" | "win32"
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
  compile: Bun.Build.CompileTarget
}

export const allTargets: Target[] = [
  { os: "linux", arch: "arm64", compile: "bun-linux-arm64" },
  { os: "linux", arch: "x64", compile: "bun-linux-x64" },
  { os: "linux", arch: "x64", avx2: false, compile: "bun-linux-x64-baseline" },
  { os: "linux", arch: "arm64", abi: "musl", compile: "bun-linux-arm64-musl" },
  { os: "linux", arch: "x64", abi: "musl", compile: "bun-linux-x64-musl" },
  { os: "linux", arch: "x64", abi: "musl", avx2: false, compile: "bun-linux-x64-baseline-musl" },
  { os: "darwin", arch: "arm64", compile: "bun-darwin-arm64" },
  { os: "darwin", arch: "x64", compile: "bun-darwin-x64" },
  { os: "darwin", arch: "x64", avx2: false, compile: "bun-darwin-x64-baseline" },
  { os: "win32", arch: "x64", compile: "bun-windows-x64" },
  { os: "win32", arch: "x64", avx2: false, compile: "bun-windows-x64-baseline" },
]

export function targetName(target: Target) {
  return ["awsesh", target.os === "win32" ? "windows" : target.os, target.arch,
    target.avx2 === false ? "baseline" : undefined, target.abi].filter(Boolean).join("-")
}
