import { Global } from "@/global"
import path from "path"
import fs from "fs/promises"

export namespace Log {
  export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR"
  
  let currentLevel: Level = "INFO"
  let printToStderr = false
  let logFilePath: string | undefined
  let fileLoggingEnabled = false
  
  const levelPriority: Record<Level, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }
  
  export function isDev(): boolean {
    return process.env.AWSESH_DEV === "1" || process.env.NODE_ENV === "development"
  }
  
  export async function init(opts: { level: Level; print?: boolean; file?: boolean }) {
    currentLevel = opts.level
    printToStderr = opts.print || false
    fileLoggingEnabled = opts.file ?? isDev()
    
    if (fileLoggingEnabled) {
      const logDir = path.join(Global.Path.data, "logs")
      await fs.mkdir(logDir, { recursive: true })
      logFilePath = path.join(logDir, `awsesh-${Date.now()}.log`)
    }
  }
  
  export function file(): string | undefined {
    return logFilePath
  }
  
  export function isFileLoggingEnabled(): boolean {
    return fileLoggingEnabled
  }
  
  function shouldLog(level: Level): boolean {
    return levelPriority[level] >= levelPriority[currentLevel]
  }
  
  async function writeLog(level: Level, service: string, msg: string, data?: any) {
    if (!shouldLog(level)) return
    
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level,
      service,
      message: msg,
      data,
    }
    
    const logLine = JSON.stringify(logEntry) + "\n"
    
    // Write to file if available
    if (logFilePath) {
      await fs.appendFile(logFilePath, logLine).catch(() => {})
    }
    
    // Print to stderr if requested
    if (printToStderr) {
      console.error(`[${level}] [${service}] ${msg}`, data || "")
    }
  }
  
  export function create(opts: { service: string }) {
    return {
      debug: (msg: string, data?: any) => writeLog("DEBUG", opts.service, msg, data),
      info: (msg: string, data?: any) => writeLog("INFO", opts.service, msg, data),
      warn: (msg: string, data?: any) => writeLog("WARN", opts.service, msg, data),
      error: (msg: string, data?: any) => writeLog("ERROR", opts.service, msg, data),
    }
  }
  
  export const Default = create({ service: "awsesh" })
}
