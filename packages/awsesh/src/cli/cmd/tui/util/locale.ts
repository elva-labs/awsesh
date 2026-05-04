export namespace Locale {
  export function titlecase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  export function truncate(str: string, length: number): string {
    if (str.length <= length) return str
    return str.slice(0, length - 3) + "..."
  }

  export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  export function pluralize(count: number, singular: string, plural?: string): string {
    if (count === 1) return singular
    return plural || `${singular}s`
  }

  export function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, "0")}`
  }
}
