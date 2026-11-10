export interface AwseshOptions {
  configDir: string
  dataDir: string
  awsDir: string
  /** Override the AWS directory at call time (e.g. to target WSL's ~/.aws instead of Windows'). Falls back to awsDir. */
  resolveAwsDir?: () => Promise<string>
  /** Command the AWS tools run for a managed profile's credentials; the profile name is appended. Without it, profiles cannot be synced. */
  credentialProcess?: string[] | (() => Promise<string[] | undefined>)
}

export interface SSOSession {
  name: string
  startUrl: string
  ssoRegion: string
  defaultRegion: string
  isChina?: boolean
}

export interface SSOLoginInfo {
  verificationUri: string
  verificationUriComplete: string
  userCode: string
  deviceCode: string
  interval: number
  clientId: string
  clientSecret: string
  expiresAt: Date
  startUrl: string
}

export interface TokenCache {
  token: string
  expiresAt: Date
  startUrl: string
}

export interface TokenResult {
  token: string
  expiresAt: Date
}

export interface Account {
  accountId: string
  name: string
  roles: string[]
  rolesLoaded: boolean
  region?: string
}

export interface AccountCache {
  accounts: Account[]
  lastUpdated: number
}

export interface AccountLayout {
  pinned: string[]
  groups: Record<string, string>
  collapsed: string[]
  favoritesCollapsed?: boolean
}

export interface RoleCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

export interface LastSelected {
  session?: string
  account?: string
  role?: string
}

export interface LastSelectedPerSession {
  [sessionName: string]: string
}

export interface ActiveCredential {
  profileName: string
  accountId: string
  accountName: string
  roleName: string
  sessionName: string
  expiration: string
  isDefault: boolean
  region?: string
}

export interface LastSetCredential {
  profileName: string
  accountId: string
  accountName: string
  roleName: string
  sessionName: string
  region?: string
  setAt: string
}

export interface SetCredentialOptions {
  credentials: RoleCredentials
  sessionName: string
  accountId: string
  accountName: string
  roleName: string
  region?: string
  profileName?: string
}

export interface SetCredentialResult {
  profileName: string
  expiration: Date
  isDefault: boolean
}

/** A profile awsesh keeps in ~/.aws/config, served through credential_process from the cached SSO login. */
export interface ProfileDefinition {
  session: string
  /** Account ID, or account name as listed in the SSO session */
  account: string
  role: string
  region?: string
}

export interface ManagedProfile extends ProfileDefinition {
  name: string
}

export interface ProfileSyncResult {
  written: string[]
  removed: string[]
  /** Profiles skipped because ~/.aws/config already has a section with that name that awsesh does not manage */
  conflicts: string[]
  /** Sections removed from ~/.aws/credentials whose temporary keys would shadow the managed profile */
  cleared: string[]
}

/** credential_process output, version 1 */
export interface ProcessCredentials {
  Version: 1
  AccessKeyId: string
  SecretAccessKey: string
  SessionToken: string
  Expiration: string
}
