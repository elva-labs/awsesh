import { colorEnabled } from "@/util/color"

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

  // Wrap `text` in `code`…reset, but only when color is enabled. When piped or
  // NO_COLOR is set this returns the bare text so captured output stays plain.
  function paint(code: string, text: string): string {
    return colorEnabled() ? `${code}${text}${Style.reset}` : text
  }

  export function print(message: string) {
    process.stdout.write(message)
  }

  export function println(message = "") {
    console.log(message)
  }

  export function error(message: string) {
    console.error(paint(Style.red, message))
  }

  export function success(message: string) {
    println(paint(Style.green, message))
  }

  export function info(message: string) {
    println(paint(Style.blue, message))
  }

  export function warn(message: string) {
    println(paint(Style.yellow, message))
  }

  export function dim(text: string): string {
    return paint(Style.dim, text)
  }

  export function cyan(text: string): string {
    return paint(Style.cyan, text)
  }

  export function green(text: string): string {
    return paint(Style.green, text)
  }

  export function yellow(text: string): string {
    return paint(Style.yellow, text)
  }

  export function red(text: string): string {
    return paint(Style.red, text)
  }

  export function bold(text: string): string {
    return paint(Style.bold, text)
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
    const color = colorEnabled()
    const c = color ? Style.cyan : ""
    const g = color ? Style.dim : ""
    const r = color ? Style.reset : ""
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
