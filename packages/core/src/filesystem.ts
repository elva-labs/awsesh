import path from "node:path"
import fs from "node:fs/promises"

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf-8")
  return JSON.parse(content) as T
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function listJsonFiles(
  dir: string,
  options: { recursive?: boolean } = {}
): Promise<string[]> {
  const recursive = options.recursive ?? false
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entry.name)
      continue
    }

    if (recursive && entry.isDirectory()) {
      const nestedFiles = await listJsonFiles(entryPath, { recursive: true })
      for (const nestedFile of nestedFiles) {
        files.push(path.posix.join(entry.name, nestedFile))
      }
    }
  }

  return files
}
