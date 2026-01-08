import fs from "node:fs"

const RESET = "\x1b[0m"
const DIM = "\x1b[2m"
const GRAY = "\x1b[38;2;107;114;128m"

export interface SessionInfo {
  sessionName: string
  accountName: string
  accountId: string
  roleName: string
  region: string
  profileName?: string
}

export function printSessionInfo(info: SessionInfo): void {
  const lines: string[] = [""]
  lines.push(`${GRAY}Session${RESET}  ${info.sessionName}`)
  lines.push(`${GRAY}Account${RESET}  ${info.accountName} ${DIM}${info.accountId}${RESET}`)
  lines.push(`${GRAY}Role${RESET}     ${info.roleName}`)
  lines.push(`${GRAY}Region${RESET}   ${info.region}`)
  if (info.profileName && info.profileName !== "default") {
    lines.push(`${GRAY}Profile${RESET}  ${info.profileName}`)
  }
  lines.push("")

  fs.writeSync(1, `${lines.join("\n")}\n`)
}
