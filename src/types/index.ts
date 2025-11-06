// Core types for awsesh

export interface SSOProfile {
  name: string
  startUrl: string
  ssoRegion: string
  defaultRegion: string
}

export interface Account {
  accountId: string
  name: string
  roles: string[]
  rolesLoaded: boolean
  region?: string
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

export interface RoleCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

export interface LastSelected {
  profile?: string
  account?: string
  role?: string
}

export interface AccountCache {
  accounts: Account[]
  lastUpdated: number
}

export type ViewState = "sso-select" | "account-select" | "role-select" | "success"
