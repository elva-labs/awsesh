import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { missingFile, readJsonFile, replaceJsonFile } from "./filesystem"
import type { createProfileGroups } from "./profile-groups"
import type { createProfileSets, ProfileEnvironmentOptions } from "./profile-sets"
import type { WorkspaceBinding, WorkspaceTarget } from "./types"

const declaration = path.join(".sesh", "workspace.json")

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function ifPresent<T>(operation: Promise<T>): Promise<T | undefined> {
  try {
    return await operation
  } catch (error) {
    if (missingFile(error)) return undefined
    throw error
  }
}

async function canonicalDirectory(directory: string): Promise<string> {
  const root = await fs.realpath(directory)
  if (!(await fs.stat(root)).isDirectory()) throw new Error(`Not a directory: ${JSON.stringify(directory)}`)
  return root
}

function readOrg(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new Error("Organization names may use letters, digits, hyphens and underscores (up to 128 characters)")
  }
  return value
}

function readDeclaration(value: unknown) {
  if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1
    || !("profiles" in value) || !Array.isArray(value.profiles) || !value.profiles.length) {
    throw new Error("Expected a version 1 workspace declaration with at least one profile")
  }
  return Array.from(value.profiles, (profile: unknown) => {
    if (typeof profile !== "object" || profile === null
      || !("org" in profile) || !("alias" in profile) || typeof profile.alias !== "string"
      || !("accountId" in profile) || typeof profile.accountId !== "string"
      || !("roleName" in profile) || typeof profile.roleName !== "string") {
      throw new Error("Each workspace profile requires an alias, org, account ID and role name")
    }
    return { alias: profile.alias, org: readOrg(profile.org), accountId: profile.accountId, roleName: profile.roleName }
  })
}

export function createWorkspaces(
  directory: string,
  groups: Pick<ReturnType<typeof createProfileGroups>, "get">,
  profileSets: Pick<ReturnType<typeof createProfileSets>, "resolveTargets" | "withResolvedEnvironment">,
  sessionExists: (name: string) => Promise<boolean>,
) {
  function recordFile(kind: string, identifier: string): string {
    return path.join(directory, kind, `${digest(identifier)}.json`)
  }

  async function readRecord(file: string): Promise<string | undefined> {
    const value = await ifPresent(readJsonFile<unknown>(file))
    if (value === undefined || typeof value === "string" && value.length > 0) return value
    throw new Error(`Invalid workspace record: ${JSON.stringify(file)}`)
  }

  async function findSource(directory: string): Promise<Pick<WorkspaceBinding, "root" | "source"> | undefined> {
    let root = await canonicalDirectory(directory)
    const ancestors: string[] = []
    while (true) {
      const group = await readRecord(recordFile("personal", root))
      if (group !== undefined) return { root, source: { kind: "personal", group } }
      ancestors.push(root)
      const parent = path.dirname(root)
      // A linked Git worktree or submodule has a .git file instead of a directory.
      if (parent === root || await ifPresent(fs.lstat(path.join(root, ".git")))) break
      root = parent
    }
    for (const ancestor of ancestors) {
      const file = path.join(ancestor, declaration)
      const entry = await ifPresent(fs.lstat(file))
      if (!entry) continue
      if (!entry.isFile()) throw new Error(`Expected a regular workspace file: ${JSON.stringify(file)}`)
      return { root: ancestor, source: { kind: "shared", file } }
    }
    return undefined
  }

  async function targetsFor(source: WorkspaceBinding["source"]): Promise<WorkspaceTarget[]> {
    if (source.kind === "personal") {
      const group = await groups.get(source.group)
      if (!group) throw new Error(`Profile group not found: ${JSON.stringify(source.group)}`)
      return profileSets.resolveTargets(group.profiles)
    }

    const file = source.file
    try {
      const profiles = readDeclaration(await readJsonFile<unknown>(file))
      const sessions = new Map<string, string>()
      const bindings = []
      for (const { org, ...profile } of profiles) {
        const sessionName = sessions.get(org) ?? await readRecord(recordFile("organizations", org))
        if (!sessionName) throw new Error(`No local mapping for ${org}. Run awsesh workspace map ${org} <sso-session>.`)
        sessions.set(org, sessionName)
        bindings.push({ ...profile, sessionName })
      }
      const targets = await profileSets.resolveTargets(bindings)
      return targets.map((target, index) => ({ ...target, org: profiles[index].org }))
    } catch (error) {
      throw new Error(`${JSON.stringify(file)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function resolve(directory: string) {
    const selected = await findSource(directory)
    if (!selected) return undefined
    const { root, source } = selected
    const targets = await targetsFor(source)
    const { dev, ino, birthtimeMs } = await fs.stat(root)
    const ordered = [...targets].sort((left, right) => left.alias < right.alias ? -1 : left.alias > right.alias ? 1 : 0)
    const fingerprint = digest(JSON.stringify([1, root, dev, ino, birthtimeMs, source, ordered]))
    const trustFile = recordFile(`trust-${source.kind}`, root)
    const approved = await readRecord(trustFile)
    const trust = approved === fingerprint ? "trusted" : approved === undefined ? "untrusted" : "changed"
    const binding: WorkspaceBinding = { root, source, targets, trust }
    return { binding, fingerprint, trustFile }
  }

  async function requireBinding(directory: string) {
    const result = await resolve(directory)
    if (!result) throw new Error("No workspace binding found. Define a personal binding or add .sesh/workspace.json.")
    return result
  }

  return {
    /** Bind this exact directory to an existing local profile group. */
    async bind(directory: string, group: string): Promise<void> {
      const root = await canonicalDirectory(directory)
      if (!await groups.get(group)) throw new Error(`Profile group not found: ${JSON.stringify(group)}`)
      await replaceJsonFile(recordFile("personal", root), group)
      const { binding, fingerprint, trustFile } = await requireBinding(root)
      if (binding.source.kind !== "personal" || binding.source.group !== group) {
        throw new Error("The workspace binding changed during selection. Inspect the binding and try again.")
      }
      await replaceJsonFile(trustFile, fingerprint)
    },

    /** Remove the personal binding at this exact directory. */
    async unbind(directory: string): Promise<void> {
      const root = await canonicalDirectory(directory)
      await fs.rm(recordFile("personal", root), { force: true })
    },

    /** Map a portable organization name to an existing local SSO session. */
    async mapOrganization(org: string, sessionName: string): Promise<void> {
      const file = recordFile("organizations", readOrg(org))
      if (!sessionName.trim() || !await sessionExists(sessionName)) {
        throw new Error(`SSO session not found: ${JSON.stringify(sessionName)}`)
      }
      await replaceJsonFile(file, sessionName)
    },

    /** Resolve the effective binding and its trust status without authenticating. */
    async inspect(directory: string): Promise<WorkspaceBinding | undefined> {
      return (await resolve(directory))?.binding
    },

    /** Approve the currently resolved binding in local configuration. */
    async trust(directory: string): Promise<WorkspaceBinding> {
      const { binding, fingerprint, trustFile } = await requireBinding(directory)
      await replaceJsonFile(trustFile, fingerprint)
      return { ...binding, trust: "trusted" }
    },

    /** Run with the exact approved targets in an isolated AWS environment. */
    async withEnvironment<T>(
      directory: string,
      options: ProfileEnvironmentOptions,
      run: (env: NodeJS.ProcessEnv) => Promise<T>,
    ): Promise<T> {
      const { binding } = await requireBinding(directory)
      if (binding.trust !== "trusted") {
        const reason = binding.trust === "changed" ? "Workspace grants changed." : "Workspace is not trusted."
        throw new Error(`${reason} Run awsesh workspace inspect, then awsesh workspace trust to approve.`)
      }
      return profileSets.withResolvedEnvironment(binding.targets, options, run)
    },
  }
}
