import fs from "node:fs/promises"
import path from "node:path"
import { Storage, type Account, type SSOSession } from "@awsesh/core"
import { getAwsesh } from "@/instance"
import { Global } from "@/global"

// An agent session (a Claude Code session, a shell) with an AWS account of its own. The session's AWS config
// points the AWS tools at `awsesh agent creds`, so switching only changes this record.
export interface AgentSession {
  id: string
  cwd: string
  agent: string
  bin: string
  configFile: string
  org?: string
  accountId?: string
  accountName?: string
  role?: string
  region?: string
  updatedAt: string
}

// .sesh/scope.json: which org/account/role an agent may use, and which of them it must ask about first
export interface ScopeRule {
  match: string
  ask: boolean
}

export interface Scope {
  path: string
  default?: string
  allow: ScopeRule[]
}

// What switching to an account would do: the role it lands on and the rule that allows it
export interface Resolved {
  org: string
  accountId: string
  accountName: string
  role: string
  region: string
  ask: boolean
  rule?: string
  // Whether a scope file applied at all; without one, nothing limits the switch
  scoped: boolean
  // Whether the org's SSO login is still valid; without it the session gets no keys until someone logs in
  loggedIn: boolean
}

interface CachedKeys {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: string
}

const PROFILE = "awsesh"
const SCOPE_FILE = path.join(".sesh", "scope.json")
const REFRESH_MARGIN_MS = 5 * 60 * 1000

const storage = Storage.create({ dir: path.join(Global.Path.data, "storage") })
const configDir = path.join(Global.Path.data, "agent")

const glob = (pattern: string) =>
  new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i")

export namespace Agent {
  export const get = (id: string) => storage.read<AgentSession>(`agent/${id}`)

  export async function list(): Promise<AgentSession[]> {
    const ids = await storage.list("agent")
    const sessions = await Promise.all(ids.map((id) => get(id)))
    return sessions.filter((s): s is AgentSession => s !== undefined)
  }

  const save = (session: AgentSession) =>
    storage.write<AgentSession>(`agent/${session.id}`, { ...session, updatedAt: new Date().toISOString() })

  async function writeConfig(session: AgentSession) {
    const lines = [`[profile ${PROFILE}]`, `credential_process = ${session.bin} agent creds --id ${session.id}`]
    if (session.region) lines.push(`region = ${session.region}`)
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(session.configFile, `${lines.join("\n")}\n`)
  }

  // The nearest .sesh/scope.json at or above a folder, as git finds .git
  export async function scopeFor(cwd: string): Promise<Scope | undefined> {
    let dir = path.resolve(cwd)
    while (true) {
      const file = path.join(dir, SCOPE_FILE)
      try {
        const raw = JSON.parse(await fs.readFile(file, "utf-8")) as { default?: string; allow?: (string | Partial<ScopeRule>)[] }
        const allow = (raw.allow ?? []).map((rule) =>
          typeof rule === "string" ? { match: rule, ask: false } : { match: String(rule.match ?? ""), ask: rule.ask === true },
        )
        return { path: file, default: raw.default, allow }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`${file} is not valid: ${String(error)}`)
      }
      const parent = path.dirname(dir)
      if (parent === dir) return undefined
      dir = parent
    }
  }

  // Writes a scope to <cwd>/.sesh/scope.json, after checking each rule reads as org/account/role
  export async function setScope(cwd: string, scope: { default?: string; allow: (string | ScopeRule)[] }) {
    for (const rule of scope.allow) {
      const match = typeof rule === "string" ? rule : rule.match
      if (match.split("/").length !== 3) throw new Error(`"${match}" is not org/account/role`)
    }
    const file = path.join(path.resolve(cwd), SCOPE_FILE)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, `${JSON.stringify(scope, null, 2)}\n`)
    return scopeFor(cwd)
  }

  const ruleFor = (scope: Scope, target: string) => scope.allow.find((rule) => glob(rule.match).test(target))

  export function environment(session: AgentSession): Record<string, string | null> {
    return {
      AWS_CONFIG_FILE: session.configFile,
      AWS_PROFILE: PROFILE,
      AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
      AWSESH_AGENT_SESSION: session.id,
      AWS_ACCESS_KEY_ID: null,
      AWS_SECRET_ACCESS_KEY: null,
      AWS_SESSION_TOKEN: null,
      AWS_REGION: null,
      AWS_DEFAULT_REGION: null,
    }
  }

  // Registers a session; a new one starts on its scope's default account when it has one
  export async function register(input: { id: string; cwd: string; agent: string; bin: string }) {
    const existing = await get(input.id)
    let session: AgentSession = {
      ...existing,
      ...input,
      configFile: path.join(configDir, `${input.id}.config`),
      updatedAt: new Date().toISOString(),
    }
    await writeConfig(session)
    await save(session)

    let note: string | undefined
    const scope = await scopeFor(session.cwd)
    if (!session.accountName && scope?.default) {
      const [org, account, role] = scope.default.split("/")
      try {
        session = await use(session.id, org ?? "", account ?? "", role)
      } catch (error) {
        note = `Could not start on ${scope.default}: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    return { session, scope, note }
  }

  export async function end(id: string) {
    const session = await get(id)
    if (session) await fs.rm(session.configFile, { force: true })
    await storage.remove(`agent/${id}`)
  }

  async function findAccount(sso: SSOSession, name: string): Promise<Account> {
    const awsesh = getAwsesh()
    const byName = (accounts: Account[]) =>
      accounts.find((a) => a.name.toLowerCase() === name.toLowerCase() || a.accountId === name)
    const cached = byName((await awsesh.accounts.get(sso.name))?.accounts ?? [])
    if (cached?.rolesLoaded) return cached

    const token = await awsesh.tokens.get(sso.startUrl)
    if (!token) throw new Error(`The awsesh login for ${sso.name} has expired. Run: awsesh auth ${sso.name}`)
    const account = cached ?? byName(await awsesh.sso.listAccounts(sso, token.token))
    if (!account) throw new Error(`No account named ${name} in ${sso.name}.`)
    const roles = await awsesh.sso.listRoles(sso, token.token, account.accountId)
    return { ...account, roles, rolesLoaded: true }
  }

  // Works out the role a switch lands on and the scope rule that allows it, without switching.
  // Without a role: a role the scope allows without asking, the saved default first; else the first allowed role.
  export async function resolve(id: string, org: string, accountName: string, role?: string): Promise<Resolved> {
    const session = await get(id)
    if (!session) throw new Error(`No agent session ${id}.`)
    const awsesh = getAwsesh()
    const sso = await awsesh.sessions.get(org) ?? (await awsesh.sessions.list()).find((s) => s.name.toLowerCase() === org.toLowerCase())
    if (!sso) throw new Error(`awsesh has no SSO session named "${org}".`)
    const account = await findAccount(sso, accountName)
    const scope = await scopeFor(session.cwd)

    const preferred = await awsesh.preferredRoles.get(sso.name, account.accountId)
    const candidates = role
      ? account.roles.filter((r) => r.toLowerCase() === role.toLowerCase())
      : [...new Set([...(preferred && account.roles.includes(preferred) ? [preferred] : []), ...account.roles])]
    if (candidates.length === 0) throw new Error(`${account.name} has no role ${role}. Roles: ${account.roles.join(", ")}`)

    const target = (r: string) => `${sso.name}/${account.name}/${r}`
    const allowed = scope ? candidates.filter((r) => ruleFor(scope, target(r))) : candidates
    // Without a named role, prefer one the scope allows without asking: least privilege until the agent asks to step up
    const chosen = role || !scope ? allowed[0] : (allowed.find((r) => !ruleFor(scope, target(r))?.ask) ?? allowed[0])
    if (!chosen) {
      throw new Error(`${target(role ?? "*")} is outside this project's scope (${scope?.path}). Allowed: ${scope?.allow.map((r) => r.match).join(", ")}`)
    }
    const rule = scope ? ruleFor(scope, target(chosen)) : undefined
    const region = (await awsesh.preferredRegions.get(sso.name, account.accountId)) ?? sso.defaultRegion
    const loggedIn = (await awsesh.tokens.get(sso.startUrl)) !== undefined
    return {
      org: sso.name,
      accountId: account.accountId,
      accountName: account.name,
      role: chosen,
      region,
      ask: rule?.ask ?? false,
      rule: rule?.match,
      scoped: scope !== undefined,
      loggedIn,
    }
  }

  // Points the session at an account; the next AWS command in it uses that account
  export async function use(id: string, org: string, accountName: string, role?: string): Promise<AgentSession> {
    const resolved = await resolve(id, org, accountName, role)
    const session = (await get(id)) as AgentSession
    const updated: AgentSession = {
      ...session,
      org: resolved.org,
      accountId: resolved.accountId,
      accountName: resolved.accountName,
      role: resolved.role,
      region: resolved.region,
    }
    await writeConfig(updated)
    await save(updated)
    return updated
  }

  // credential_process output for the session's current account; never prompts
  export async function creds(id: string) {
    const session = await get(id)
    if (!session) throw new Error(`No agent session ${id}.`)
    if (!session.org || !session.accountId || !session.role) {
      throw new Error(`No AWS account is set for this session yet. Set one with: awsesh agent use --id ${id} <org> <account>`)
    }

    const cacheKey = `agent-keys/${session.org}/${session.accountId}/${session.role}`
    const cached = await storage.read<CachedKeys>(cacheKey)
    let keys = cached && Date.parse(cached.expiration) - Date.now() > REFRESH_MARGIN_MS ? cached : undefined

    if (!keys) {
      const awsesh = getAwsesh()
      const sso = await awsesh.sessions.get(session.org)
      if (!sso) throw new Error(`awsesh has no SSO session named "${session.org}".`)
      const token = await awsesh.tokens.get(sso.startUrl)
      if (!token) throw new Error(`The awsesh login for ${session.org} has expired. Run: awsesh auth ${session.org}`)
      const fresh = await awsesh.sso.getCredentials(sso, token.token, session.accountId, session.role)
      keys = {
        accessKeyId: fresh.accessKeyId,
        secretAccessKey: fresh.secretAccessKey,
        sessionToken: fresh.sessionToken,
        expiration: fresh.expiration.toISOString(),
      }
      await storage.write<CachedKeys>(cacheKey, keys)
    }

    return {
      Version: 1,
      AccessKeyId: keys.accessKeyId,
      SecretAccessKey: keys.secretAccessKey,
      SessionToken: keys.sessionToken,
      Expiration: keys.expiration,
    }
  }
}
