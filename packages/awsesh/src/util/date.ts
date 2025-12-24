import type { DateFormat, TimeFormat } from "@/config/config"

export namespace DateUtil {
  export function format(
    date: Date | string,
    dateFormat: DateFormat,
    timeFormat: TimeFormat
  ): string {
    const d = typeof date === "string" ? new Date(date) : date
    const datePart = formatDate(d, dateFormat)
    const timePart = formatTime(d, timeFormat)
    return `${datePart} ${timePart}`
  }

  export function formatDate(date: Date | string, dateFormat: DateFormat): string {
    const d = typeof date === "string" ? new Date(date) : date
    const day = d.getDate().toString().padStart(2, "0")
    const month = (d.getMonth() + 1).toString().padStart(2, "0")
    const year = d.getFullYear()

    if (dateFormat === "dd/mm/yyyy") {
      return `${day}/${month}/${year}`
    }
    return `${month}/${day}/${year}`
  }

  export function formatTime(date: Date | string, timeFormat: TimeFormat): string {
    const d = typeof date === "string" ? new Date(date) : date
    const hours = d.getHours()
    const minutes = d.getMinutes().toString().padStart(2, "0")

    if (timeFormat === "24h") {
      return `${hours.toString().padStart(2, "0")}:${minutes}`
    }

    const period = hours >= 12 ? "PM" : "AM"
    const hours12 = hours % 12 || 12
    return `${hours12}:${minutes} ${period}`
  }
}
