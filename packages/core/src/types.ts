export interface AwseshOptions {
  configDir: string
  dataDir: string
  awsDir: string
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

export interface ActiveCredential {
  profileName: string
  accountId: string
  accountName: string
  roleName: string
  sessionName: string
  expiration: string
  isDefault: boolean
}
