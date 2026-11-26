import path from "node:path"
import { listJsonFiles, missingFile, readJsonFile, replaceJsonFile } from "./filesystem"
import { readProfileBindings } from "./profile-sets"
import type { ProfileBinding, ProfileGroup } from "./types"

export function createProfileGroups(
  directory: string,
  resolve: (profiles: readonly ProfileBinding[]) => Promise<ProfileBinding[]>,
) {
  function fileName(name: string) {
    if (!/^[a-z0-9_-]{1,128}$/.test(name)) {
      throw new Error("Group names may use lowercase letters, digits, hyphens and underscores (up to 128 characters)")
    }
    return `group-${name}.json`
  }

  async function readGroup(file: string): Promise<ProfileGroup> {
    const value = await readJsonFile<unknown>(path.join(directory, file))
    if (typeof value !== "object" || value === null || !("name" in value) || typeof value.name !== "string"
      || fileName(value.name) !== file || !("profiles" in value)) {
      throw new Error(`Invalid profile group file: ${file}`)
    }
    return { name: value.name, profiles: readProfileBindings(value.profiles) }
  }

  return {
    async get(name: string): Promise<ProfileGroup | undefined> {
      try {
        return await readGroup(fileName(name))
      } catch (error) {
        if (missingFile(error)) return undefined
        throw error
      }
    },

    async list(): Promise<ProfileGroup[]> {
      let files: string[]
      try {
        files = await listJsonFiles(directory)
      } catch (error) {
        if (missingFile(error)) return []
        throw error
      }
      return Promise.all(files.filter((file) => file.startsWith("group-")).sort().map(readGroup))
    },

    /** Replace the entire definition in one write so concurrent readers see a complete group. */
    async save(name: string, profiles: readonly ProfileBinding[]): Promise<void> {
      const target = path.join(directory, fileName(name))
      const bindings = readProfileBindings(profiles)
      await resolve(bindings)
      await replaceJsonFile(target, { name, profiles: bindings })
    },
  }
}
