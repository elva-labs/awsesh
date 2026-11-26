import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ProfileBinding, RoleCredentials, SSOSession, TokenCache } from "./types"

const namePattern = /^[a-zA-Z0-9_-]{1,128}$/
const inheritedCredentialVariables = new Set([
  "AWS_PROFILE", "AWS_DEFAULT_PROFILE",
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN", "AWS_ROLE_SESSION_NAME",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
  "AWS_CREDENTIAL_FILE", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_SDK_LOAD_CONFIG", "AWS_EC2_METADATA_DISABLED", "BOTO_CONFIG",
])

type ResolvedProfile = ProfileBinding & { region: string }
type SessionIdentity = Pick<SSOSession, "startUrl" | "ssoRegion">
type CredentialBinding = ProfileBinding & { session?: SessionIdentity }
export type ProfileEnvironmentOptions = { credentialCommand: readonly string[]; env?: NodeJS.ProcessEnv }

interface ProfileSessionAccess {
  getSession(name: string): Promise<SSOSession | undefined>
  getToken(startUrl: string): Promise<TokenCache | undefined>
  getRoleCredentials(session: SSOSession, token: string, accountId: string, role: string): Promise<RoleCredentials>
}

function readBinding(value: unknown): ProfileBinding {
  if (typeof value !== "object" || value === null
    || !("alias" in value) || typeof value.alias !== "string"
    || !("sessionName" in value) || typeof value.sessionName !== "string"
    || !("accountId" in value) || typeof value.accountId !== "string"
    || !("roleName" in value) || typeof value.roleName !== "string") {
    throw new Error("A profile requires an alias, SSO session name, account ID and role name")
  }
  const { alias, sessionName, accountId, roleName } = value
  if (!namePattern.test(alias)) throw new Error("Profile aliases may use letters, digits, hyphens and underscores (up to 128 characters)")
  if (alias.toLowerCase() === "default" || alias === "__proto__") throw new Error(`Reserved profile alias: ${alias}`)
  if (!sessionName.trim()) throw new Error(`Profile ${alias} requires an SSO session name`)
  if (!/^[0-9]{12}$/.test(accountId)) throw new Error(`Profile ${alias} requires a 12-digit AWS account ID`)
  if (!/^[\w+=,.@-]{1,64}$/.test(roleName)) throw new Error(`Profile ${alias} requires a valid IAM role name`)
  return { alias, sessionName, accountId, roleName }
}

export function readProfileBindings(value: unknown): ProfileBinding[] {
  if (!Array.isArray(value) || !value.length) throw new Error("At least one profile is required")
  const profiles = Array.from(value, readBinding)
  const aliases = new Set<string>()
  for (const { alias } of profiles) {
    if (aliases.has(alias)) throw new Error(`Duplicate profile alias: ${alias}`)
    aliases.add(alias)
  }
  return profiles
}

function quoteCommandPart(part: string): string {
  // Keep command words literal for both shell-based and argv-based AWS providers.
  if (!part || /["\p{C}$`%!]|\s[;#]/u.test(part)
    || (process.platform === "win32" ? part.endsWith("\\") : part.includes("\\"))) {
    throw new Error("The credential process command contains an unsupported character")
  }
  return `"${part}"`
}

export function createProfileSets(access: ProfileSessionAccess) {
  async function sessionFor(profile: ProfileBinding) {
    const session = await access.getSession(profile.sessionName)
    if (!session) throw new Error(`SSO session ${JSON.stringify(profile.sessionName)} not found for profile ${profile.alias}`)
    return session
  }

  async function resolveTargets(profiles: readonly ProfileBinding[]) {
    const bindings = readProfileBindings(profiles)
    return Promise.all(bindings.map(async (profile) => {
      const session = await sessionFor(profile)
      const region = session.defaultRegion
      if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) {
        throw new Error(`Invalid default region for SSO session ${JSON.stringify(session.name)}`)
      }
      return { ...profile, region, startUrl: session.startUrl, ssoRegion: session.ssoRegion }
    }))
  }

  async function resolve(profiles: readonly ProfileBinding[]): Promise<ResolvedProfile[]> {
    return (await resolveTargets(profiles)).map(({ alias, sessionName, accountId, roleName, region }) =>
      ({ alias, sessionName, accountId, roleName, region }))
  }

  async function runWithEnvironment<T>(
    profiles: readonly (CredentialBinding & { region: string })[],
    options: ProfileEnvironmentOptions,
    run: (env: NodeJS.ProcessEnv) => Promise<T>,
  ): Promise<T> {
    if (!options.credentialCommand.length) throw new Error("A credential process command is required")
    const command = options.credentialCommand.map(quoteCommandPart).join(" ")
    const config = profiles.map(({ region, ...profile }) => {
      const binding = Buffer.from(JSON.stringify(profile)).toString("base64url")
      return `[profile ${profile.alias}]\nregion = ${region}\ncredential_process = ${command} ${binding}\n`
    }).join("\n")

    const directory = await fs.mkdtemp(path.join(tmpdir(), "awsesh-profiles-"))
    try {
      const configFile = path.join(directory, "config")
      const credentialsFile = path.join(directory, "credentials")
      await fs.writeFile(configFile, config, { mode: 0o600 })
      await fs.writeFile(credentialsFile, "", { mode: 0o600 })
      const env = Object.fromEntries(Object.entries(options.env ?? process.env).filter(
        ([name]) => !inheritedCredentialVariables.has(name.toUpperCase()),
      ))
      return await run({
        ...env,
        AWS_CONFIG_FILE: configFile,
        AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
        AWS_SDK_LOAD_CONFIG: "1",
        AWS_EC2_METADATA_DISABLED: "true",
        BOTO_CONFIG: credentialsFile,
      })
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }

  return {
    resolve,
    resolveTargets,

    async withResolvedEnvironment<T>(
      profiles: readonly (ResolvedProfile & SessionIdentity)[],
      options: ProfileEnvironmentOptions,
      run: (env: NodeJS.ProcessEnv) => Promise<T>,
    ): Promise<T> {
      const pinned = profiles.map(({ alias, sessionName, accountId, roleName, region, startUrl, ssoRegion }) =>
        ({ alias, sessionName, accountId, roleName, region, session: { startUrl, ssoRegion } }))
      return runWithEnvironment(pinned, options, run)
    },

    /** Resolve a binding supplied by a generated config and return AWS credential_process JSON data. */
    async credentialProcess(binding: string) {
      const decoded: unknown = JSON.parse(Buffer.from(binding, "base64url").toString("utf8"))
      const profile = readBinding(decoded)
      const session = await sessionFor(profile)
      if (typeof decoded === "object" && decoded !== null && "session" in decoded) {
        const expected = decoded.session
        if (typeof expected !== "object" || expected === null
          || !("startUrl" in expected) || expected.startUrl !== session.startUrl
          || !("ssoRegion" in expected) || expected.ssoRegion !== session.ssoRegion) {
          throw new Error(`SSO session changed for profile ${profile.alias}. Review and trust the workspace again.`)
        }
      }
      const signIn = `Run awsesh auth for SSO session ${JSON.stringify(session.name)} and try again.`
      const token = await access.getToken(session.startUrl)
      if (!token || !(token.expiresAt.getTime() > Date.now())) {
        throw new Error(`No valid SSO login for profile ${profile.alias}. ${signIn}`)
      }

      let credentials: RoleCredentials
      try {
        credentials = await access.getRoleCredentials(session, token.token, profile.accountId, profile.roleName)
      } catch (error) {
        if (error instanceof Error && error.name === "UnauthorizedException") {
          throw new Error(`SSO login rejected for profile ${profile.alias}. ${signIn}`)
        }
        throw error
      }
      if (!credentials.accessKeyId || !credentials.secretAccessKey || !credentials.sessionToken
        || !(credentials.expiration.getTime() > Date.now())) {
        throw new Error(`SSO returned invalid or expired credentials for profile ${profile.alias}`)
      }
      return {
        Version: 1,
        AccessKeyId: credentials.accessKeyId,
        SecretAccessKey: credentials.secretAccessKey,
        SessionToken: credentials.sessionToken,
        Expiration: credentials.expiration.toISOString(),
      }
    },

    /** Run with an isolated AWS environment. The command prefix receives an opaque binding as its last argument. */
    async withEnvironment<T>(
      profiles: readonly ProfileBinding[],
      options: ProfileEnvironmentOptions,
      run: (env: NodeJS.ProcessEnv) => Promise<T>,
    ): Promise<T> {
      return runWithEnvironment(await resolve(profiles), options, run)
    },
  }
}
