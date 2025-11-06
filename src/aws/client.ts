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
import { Log } from "@/util/log"
import type { Account, SSOLoginInfo, RoleCredentials } from "@/types"

const log = Log.create({ service: "aws" })

export class AWSClient {
  private ssoClient: SSOClient
  private ssooidcClient: SSOOIDCClient
  private region: string
  
  constructor(region: string) {
    this.region = region
    this.ssoClient = new SSOClient({ region })
    this.ssooidcClient = new SSOOIDCClient({ region })
    log.info("AWS client initialized", { region })
  }
  
  async startSSOLogin(startUrl: string): Promise<SSOLoginInfo> {
    log.info("Starting SSO login", { startUrl })
    
    try {
      // Register client
      const registerResp = await this.ssooidcClient.send(
        new RegisterClientCommand({
          clientName: "awsesh",
          clientType: "public",
        })
      )
      
      log.debug("Client registered", { clientId: registerResp.clientId })
      
      // Start device authorization
      const deviceResp = await this.ssooidcClient.send(
        new StartDeviceAuthorizationCommand({
          clientId: registerResp.clientId,
          clientSecret: registerResp.clientSecret,
          startUrl,
        })
      )
      
      log.info("Device authorization started", {
        userCode: deviceResp.userCode,
        expiresIn: deviceResp.expiresIn,
      })
      
      return {
        verificationUri: deviceResp.verificationUri!,
        verificationUriComplete: deviceResp.verificationUriComplete!,
        userCode: deviceResp.userCode!,
        deviceCode: deviceResp.deviceCode!,
        interval: deviceResp.interval || 5,
        clientId: registerResp.clientId!,
        clientSecret: registerResp.clientSecret!,
        expiresAt: new Date(Date.now() + deviceResp.expiresIn! * 1000),
        startUrl,
      }
    } catch (error) {
      log.error("Failed to start SSO login", { error })
      throw new Error(`Failed to start SSO login: ${error}`)
    }
  }
  
  async pollForToken(info: SSOLoginInfo): Promise<string | null> {
    log.debug("Polling for token")
    
    try {
      const response = await this.ssooidcClient.send(
        new CreateTokenCommand({
          clientId: info.clientId,
          clientSecret: info.clientSecret,
          grantType: "urn:ietf:params:oauth:grant-type:device_code",
          deviceCode: info.deviceCode,
        })
      )
      
      if (response.accessToken) {
        log.info("Token received successfully")
        return response.accessToken
      }
      
      return null
    } catch (error: any) {
      if (error.name === "AuthorizationPendingException") {
        // Still waiting for user to authorize
        return null
      }
      if (error.name === "SlowDownException") {
        // We're polling too fast
        return null
      }
      if (error.name === "ExpiredTokenException") {
        throw new Error("Device code expired - please try again")
      }
      
      log.error("Error polling for token", { error: error.name })
      throw error
    }
  }
  
  async listAccounts(accessToken: string): Promise<Account[]> {
    log.info("Listing accounts")
    
    const accounts: Account[] = []
    let nextToken: string | undefined
    
    try {
      do {
        const response = await this.ssoClient.send(
          new ListAccountsCommand({
            accessToken,
            nextToken,
          })
        )
        
        for (const acc of response.accountList || []) {
          accounts.push({
            accountId: acc.accountId!,
            name: acc.accountName!,
            roles: [],
            rolesLoaded: false,
          })
        }
        
        nextToken = response.nextToken
      } while (nextToken)
      
      // Sort by name
      accounts.sort((a, b) => a.name.localeCompare(b.name))
      
      log.info("Accounts listed", { count: accounts.length })
      return accounts
    } catch (error) {
      log.error("Failed to list accounts", { error })
      throw new Error(`Failed to list accounts: ${error}`)
    }
  }
  
  async listAccountRoles(accessToken: string, accountId: string): Promise<string[]> {
    log.info("Listing roles for account", { accountId })
    
    const roles: string[] = []
    let nextToken: string | undefined
    
    try {
      do {
        const response = await this.ssoClient.send(
          new ListAccountRolesCommand({
            accessToken,
            accountId,
            nextToken,
          })
        )
        
        for (const role of response.roleList || []) {
          roles.push(role.roleName!)
        }
        
        nextToken = response.nextToken
      } while (nextToken)
      
      // Sort by name
      roles.sort()
      
      log.info("Roles listed", { accountId, count: roles.length })
      return roles
    } catch (error) {
      log.error("Failed to list roles", { accountId, error })
      throw new Error(`Failed to list roles for account ${accountId}: ${error}`)
    }
  }
  
  async getRoleCredentials(
    accessToken: string,
    accountId: string,
    roleName: string
  ): Promise<RoleCredentials> {
    log.info("Getting role credentials", { accountId, roleName })
    
    try {
      const response = await this.ssoClient.send(
        new GetRoleCredentialsCommand({
          accessToken,
          accountId,
          roleName,
        })
      )
      
      const creds = response.roleCredentials!
      
      log.info("Credentials retrieved", { accountId, roleName })
      
      return {
        accessKeyId: creds.accessKeyId!,
        secretAccessKey: creds.secretAccessKey!,
        sessionToken: creds.sessionToken!,
        expiration: new Date(creds.expiration!),
      }
    } catch (error) {
      log.error("Failed to get credentials", { accountId, roleName, error })
      throw new Error(`Failed to get credentials for ${accountId}/${roleName}: ${error}`)
    }
  }
  
  getRegion(): string {
    return this.region
  }
}
