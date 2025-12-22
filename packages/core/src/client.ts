import {
  SSOClient,
  ListAccountsCommand,
  ListAccountRolesCommand,
  GetRoleCredentialsCommand,
} from "@aws-sdk/client-sso"
import {
  SSOOIDCClient,
  RegisterClientCommand,
  StartDeviceAuthorizationCommand,
  CreateTokenCommand,
} from "@aws-sdk/client-sso-oidc"
import type { SSOLoginInfo, Account, RoleCredentials } from "./types"

export class AWSClient {
  private ssoClient: SSOClient
  private oidcClient: SSOOIDCClient
  private region: string

  constructor(region: string) {
    this.region = region
    this.ssoClient = new SSOClient({ region })
    this.oidcClient = new SSOOIDCClient({ region })
  }

  async startSSOLogin(startUrl: string): Promise<SSOLoginInfo> {
    const registerResp = await this.oidcClient.send(
      new RegisterClientCommand({
        clientName: "awsesh",
        clientType: "public",
      })
    )

    const deviceResp = await this.oidcClient.send(
      new StartDeviceAuthorizationCommand({
        clientId: registerResp.clientId,
        clientSecret: registerResp.clientSecret,
        startUrl,
      })
    )

    return {
      verificationUri: deviceResp.verificationUri ?? "",
      verificationUriComplete: deviceResp.verificationUriComplete ?? "",
      userCode: deviceResp.userCode ?? "",
      deviceCode: deviceResp.deviceCode ?? "",
      interval: deviceResp.interval ?? 5,
      clientId: registerResp.clientId ?? "",
      clientSecret: registerResp.clientSecret ?? "",
      expiresAt: new Date(Date.now() + (deviceResp.expiresIn ?? 600) * 1000),
      startUrl,
    }
  }

  async pollForToken(info: SSOLoginInfo): Promise<string | null> {
    try {
      const response = await this.oidcClient.send(
        new CreateTokenCommand({
          clientId: info.clientId,
          clientSecret: info.clientSecret,
          grantType: "urn:ietf:params:oauth:grant-type:device_code",
          deviceCode: info.deviceCode,
        })
      )

      return response.accessToken ?? null
    } catch (error: unknown) {
      const err = error as { name?: string }
      if (err.name === "AuthorizationPendingException") {
        return null
      }
      if (err.name === "SlowDownException") {
        return null
      }
      if (err.name === "ExpiredTokenException") {
        throw new Error("Device code expired - please try again")
      }
      throw error
    }
  }

  async listAccounts(accessToken: string): Promise<Account[]> {
    const accounts: Account[] = []
    let nextToken: string | undefined

    do {
      const response = await this.ssoClient.send(
        new ListAccountsCommand({ accessToken, nextToken })
      )

      for (const acc of response.accountList ?? []) {
        accounts.push({
          accountId: acc.accountId ?? "",
          name: acc.accountName ?? "",
          roles: [],
          rolesLoaded: false,
        })
      }

      nextToken = response.nextToken
    } while (nextToken)

    accounts.sort((a, b) => a.name.localeCompare(b.name))
    return accounts
  }

  async listAccountRoles(accessToken: string, accountId: string): Promise<string[]> {
    const roles: string[] = []
    let nextToken: string | undefined

    do {
      const response = await this.ssoClient.send(
        new ListAccountRolesCommand({ accessToken, accountId, nextToken })
      )

      for (const role of response.roleList ?? []) {
        if (role.roleName) roles.push(role.roleName)
      }

      nextToken = response.nextToken
    } while (nextToken)

    roles.sort()
    return roles
  }

  async getRoleCredentials(
    accessToken: string,
    accountId: string,
    roleName: string
  ): Promise<RoleCredentials> {
    const response = await this.ssoClient.send(
      new GetRoleCredentialsCommand({ accessToken, accountId, roleName })
    )

    const creds = response.roleCredentials
    if (!creds) {
      throw new Error(`No credentials returned for ${accountId}/${roleName}`)
    }

    return {
      accessKeyId: creds.accessKeyId ?? "",
      secretAccessKey: creds.secretAccessKey ?? "",
      sessionToken: creds.sessionToken ?? "",
      expiration: new Date(creds.expiration ?? Date.now()),
    }
  }

  getRegion(): string {
    return this.region
  }

  getDashboardURL(startUrl: string): string {
    return startUrl
  }

  getAccountURL(
    accountId: string,
    _accessToken: string,
    startUrl: string,
    roleName: string
  ): string {
    const baseUrl = startUrl.replace(/\/$/, "")
    return `${baseUrl}#/console?account_id=${accountId}&role_name=${roleName}`
  }
}
