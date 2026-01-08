export namespace UI {
  export const Style = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[90m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
  }

  export function print(message: string) {
    process.stdout.write(message)
  }

  export function println(message = "") {
    console.log(message)
  }

  export function error(message: string) {
    console.error(`${Style.red}${message}${Style.reset}`)
  }

  export function success(message: string) {
    println(`${Style.green}${message}${Style.reset}`)
  }

  export function info(message: string) {
    println(`${Style.blue}${message}${Style.reset}`)
  }

  export function warn(message: string) {
    println(`${Style.yellow}${message}${Style.reset}`)
  }

  export function dim(text: string): string {
    return `${Style.dim}${text}${Style.reset}`
  }

  export function cyan(text: string): string {
    return `${Style.cyan}${text}${Style.reset}`
  }

  export function green(text: string): string {
    return `${Style.green}${text}${Style.reset}`
  }

  export function yellow(text: string): string {
    return `${Style.yellow}${text}${Style.reset}`
  }

  export function red(text: string): string {
    return `${Style.red}${text}${Style.reset}`
  }

  export function bold(text: string): string {
    return `${Style.bold}${text}${Style.reset}`
  }

  export function kv(key: string, value: string, indent = 2): string {
    const padding = " ".repeat(indent)
    return `${padding}${dim(`${key}:`)} ${value}`
  }

  export function bullet(text: string, status?: "active" | "inactive" | "error"): string {
    const dot = status === "active" 
      ? green("●")
      : status === "error"
        ? red("●")
        : dim("○")
    return `${dot} ${text}`
  }

  export function section(title: string) {
    println()
    println(cyan(title))
    println()
  }

export function logo(): string {
    const c = Style.cyan
    const g = Style.dim
    const r = Style.reset
    const p = "\u00A0"

    return [
      `${p.repeat(38)}${c}_${r}`,
      `${p.repeat(37)}${c}( )${r}`,
      `${p.repeat(3)}${c}_ _  _   _   _   ___    __    ___ | |__${r}`,
      `${p}${c}/'_\` )( ) ( ) ( )/',__) /'__\`\\/',__)|  _ \`\\${r}`,
      `${c}( (_| || \\_/ \\_/ |\\__, \\(  ___/\\__, \\| | | |${r}`,
      `${c}\`\\__,_)\`\\___x___/'(____/\`\\____)(____/(_) (_)${r}`,
      `${p.repeat(9)}${g}AWS Session Manager by Elva${r}`,
    ].join("\n")
  }
}
