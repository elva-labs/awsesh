import fs from "node:fs"
import { colorEnabled } from "./color"

export interface SessionInfo {
  sessionName: string
  accountName: string
  accountId: string
  roleName: string
  region: string
  profileName?: string
}

export interface EvalEnvironment {
  profileName: string
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

export function printSessionInfo(info: SessionInfo): void {
  const color = colorEnabled()
  const RESET = color ? "\x1b[0m" : ""
  const DIM = color ? "\x1b[2m" : ""
  const GRAY = color ? "\x1b[38;2;107;114;128m" : ""

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

export function printEvalEnvironment(environment: EvalEnvironment): void {
  const lines = [
    `export AWS_PROFILE=${shellQuote(environment.profileName)}`,
    `export AWSESH_ACCOUNT_ID=${shellQuote(environment.accountId)}`,
    `export AWSESH_ACCOUNT_NAME=${shellQuote(environment.accountName)}`,
    `export AWSESH_ROLE_NAME=${shellQuote(environment.roleName)}`,
    `export AWSESH_SESSION_NAME=${shellQuote(environment.sessionName)}`,
    `export AWS_REGION=${shellQuote(environment.region)}`,
    `export AWS_ACCESS_KEY_ID=${shellQuote(environment.accessKeyId)}`,
    `export AWS_SECRET_ACCESS_KEY=${shellQuote(environment.secretAccessKey)}`,
    `export AWS_SESSION_TOKEN=${shellQuote(environment.sessionToken)}`,
    `export AWS_SESSION_EXPIRATION=${shellQuote(environment.expiration)}`,
  ]

  fs.writeSync(1, `${lines.join("\n")}\n`)
}
