# SDK Refactor Plan

## Overview

Extract core business logic into `@awsesh/core` SDK package, keeping CLI/TUI in main `awsesh` package.

## Updated Structure

```
awsesh-rewrite/
├── packages/
│   ├── core/                        # @awsesh/core - SDK Package
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts             # Factory + exports
│   │       ├── client.ts            # AWSClient (SSO operations)
│   │       ├── config.ts            # ConfigManager (credentials file)
│   │       ├── storage.ts           # Storage (generic key-value)
│   │       ├── sessions.ts          # Sessions storage
│   │       └── types.ts             # All domain types
│   │
│   └── awsesh/                      # Main app - CLI + TUI
│       ├── package.json
│       └── src/
│           ├── index.ts             # Entry point (yargs CLI)
│           ├── global.ts            # Paths configuration
│           ├── instance.ts          # App instance (creates SDK)
│           ├── cli/
│           │   ├── cmd.ts
│           │   ├── ui.ts
│           │   ├── bootstrap.ts
│           │   ├── auth.ts
│           │   ├── session.ts
│           │   ├── whoami.ts
│           │   └── migrate.ts
│           ├── tui/
│           │   ├── thread.ts
│           │   ├── app.tsx
│           │   ├── context/
│           │   │   ├── awsesh.tsx   # SDK provider
│           │   │   ├── aws.tsx      # AWS operations (uses SDK)
│           │   │   ├── config.tsx
│           │   │   ├── route.tsx
│           │   │   ├── theme.tsx
│           │   │   ├── keybind.tsx
│           │   │   ├── dialog.tsx
│           │   │   ├── toast.tsx
│           │   │   ├── command.tsx
│           │   │   ├── kv.tsx
│           │   │   ├── exit.tsx
│           │   │   └── helper.tsx
│           │   ├── routes/
│           │   ├── component/
│           │   ├── ui/
│           │   └── util/
│           ├── config/
│           │   ├── config.ts        # AppConfig (keybinds, theme, etc.)
│           │   └── migration-helper.ts
│           └── util/
│               ├── browser.ts
│               ├── clipboard.ts
│               ├── context.ts
│               ├── lock.ts
│               ├── log.ts
│               └── url.ts
│
├── package.json                     # Workspace root
└── bun.lockb
```

---

## packages/core/package.json

```json
{
  "name": "@awsesh/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@aws-sdk/client-sso": "^3.701.0",
    "@aws-sdk/client-sso-oidc": "^3.701.0",
    "@aws-sdk/client-sts": "^3.701.0"
  }
}
```

---

## packages/core/src/types.ts

```typescript
export interface AwseshOptions {
  configDir: string   // e.g. ~/.config/awsesh
  dataDir: string     // e.g. ~/.local/share/awsesh
  awsDir: string      // e.g. ~/.aws
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
  userCode: string
  deviceCode: string
  clientId: string
  clientSecret: string
  expiresAt: Date
  startUrl: string
}

export interface TokenCache {
  token: string
  expiresAt: string
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
  expiration: number
}

export interface LastSelected {
  session?: string
  account?: string
  role?: string
}
```

---

## packages/core/src/index.ts

```typescript
export * from "./types"
export { AWSClient } from "./client"
export { ConfigManager } from "./config"
export { Sessions } from "./sessions"
export { Storage } from "./storage"

import { AWSClient } from "./client"
import { ConfigManager } from "./config"
import { Sessions } from "./sessions"
import { Storage } from "./storage"
import type {
  AwseshOptions,
  SSOSession,
  SSOLoginInfo,
  TokenCache,
  AccountCache,
  RoleCredentials,
  LastSelected,
} from "./types"

export function createAwsesh(options: AwseshOptions) {
  const { configDir, dataDir, awsDir } = options

  const storage = Storage.create({ dir: `${dataDir}/storage` })
  const sessions = Sessions.create({ dir: `${configDir}/sessions` })

  return {
    // SSO Session management
    sessions: {
      list: () => sessions.list(),
      get: (name: string) => sessions.load(name),
      save: (session: SSOSession) => sessions.save(session),
      remove: (name: string) => sessions.remove(name),
      exists: (name: string) => sessions.exists(name),
      count: () => sessions.count(),
    },

    // AWS SSO operations
    sso: {
      startLogin: (session: SSOSession) => {
        const client = new AWSClient(session.ssoRegion)
        return client.startSSOLogin(session.startUrl)
      },
      pollForToken: (session: SSOSession, loginInfo: SSOLoginInfo) => {
        const client = new AWSClient(session.ssoRegion)
        return client.pollForToken(loginInfo)
      },
      listAccounts: (session: SSOSession, token: string) => {
        const client = new AWSClient(session.ssoRegion)
        return client.listAccounts(token)
      },
      listRoles: (session: SSOSession, token: string, accountId: string) => {
        const client = new AWSClient(session.ssoRegion)
        return client.listAccountRoles(token, accountId)
      },
      getCredentials: (session: SSOSession, token: string, accountId: string, roleName: string) => {
        const client = new AWSClient(session.ssoRegion)
        return client.getRoleCredentials(token, accountId, roleName)
      },
      getDashboardUrl: (session: SSOSession) => {
        const client = new AWSClient(session.ssoRegion)
        return client.getDashboardURL(session.startUrl)
      },
      getAccountUrl: (session: SSOSession, accountId: string, token: string, roleName: string) => {
        const client = new AWSClient(session.ssoRegion)
        return client.getAccountURL(accountId, token, session.startUrl, roleName)
      },
    },

    // Token caching
    tokens: {
      get: (sessionName: string) => storage.read<TokenCache>(`tokens/${sessionName}`),
      save: (sessionName: string, cache: TokenCache) => storage.write(`tokens/${sessionName}`, cache),
      isValid: (cache: TokenCache) => new Date(cache.expiresAt) > new Date(),
    },

    // Account caching
    accounts: {
      get: (sessionName: string) => storage.read<AccountCache>(`accounts/${sessionName}`),
      save: (sessionName: string, cache: AccountCache) => storage.write(`accounts/${sessionName}`, cache),
    },

    // Last selected memory
    lastSelected: {
      get: () => storage.read<LastSelected>("last-selected"),
      save: (selected: LastSelected) => storage.write("last-selected", selected),
    },

    // Profile name memory (maps session+account+role to profile name)
    profileNames: {
      get: (key: string) => storage.read<string>(`profile-names/${key}`),
      save: (key: string, name: string) => storage.write(`profile-names/${key}`, name),
    },

    // AWS credentials file
    credentials: {
      write: async (profileName: string, creds: RoleCredentials, region?: string) => {
        await ConfigManager.writeCredentials({
          awsDir,
          profileName,
          credentials: creds,
          region,
        })
      },
    },
  }
}

export type Awsesh = ReturnType<typeof createAwsesh>
```

---

## packages/core/src/sessions.ts

```typescript
import type { SSOSession } from "./types"

export interface SessionsOptions {
  dir: string
}

export namespace Sessions {
  export function create(options: SessionsOptions) {
    const { dir } = options

    return {
      async list(): Promise<SSOSession[]> {
        const glob = new Bun.Glob("*.json")
        const results: SSOSession[] = []
        for await (const path of glob.scan({ cwd: dir })) {
          const file = Bun.file(`${dir}/${path}`)
          if (await file.exists()) {
            results.push(await file.json())
          }
        }
        return results
      },

      async load(name: string): Promise<SSOSession | undefined> {
        const file = Bun.file(`${dir}/${name}.json`)
        if (!(await file.exists())) return undefined
        return file.json()
      },

      async save(session: SSOSession): Promise<void> {
        await Bun.write(`${dir}/${session.name}.json`, JSON.stringify(session, null, 2))
      },

      async remove(name: string): Promise<void> {
        const path = `${dir}/${name}.json`
        const file = Bun.file(path)
        if (await file.exists()) {
          await Bun.remove(path)
        }
      },

      async exists(name: string): Promise<boolean> {
        const file = Bun.file(`${dir}/${name}.json`)
        return file.exists()
      },

      async count(): Promise<number> {
        const sessions = await this.list()
        return sessions.length
      },
    }
  }
}

export type Sessions = ReturnType<typeof Sessions.create>
```

---

## packages/core/src/storage.ts

```typescript
export interface StorageOptions {
  dir: string
}

export namespace Storage {
  export function create(options: StorageOptions) {
    const { dir } = options

    return {
      async read<T>(key: string): Promise<T | undefined> {
        const path = `${dir}/${key}.json`
        const file = Bun.file(path)
        if (!(await file.exists())) return undefined
        return file.json()
      },

      async write<T>(key: string, value: T): Promise<void> {
        const path = `${dir}/${key}.json`
        const parentDir = path.substring(0, path.lastIndexOf("/"))
        await Bun.write(path, JSON.stringify(value, null, 2))
      },

      async update<T>(key: string, fn: (existing: T) => T): Promise<void> {
        const existing = await this.read<T>(key)
        if (!existing) throw new Error(`Key not found: ${key}`)
        await this.write(key, fn(existing))
      },

      async remove(key: string): Promise<void> {
        const path = `${dir}/${key}.json`
        const file = Bun.file(path)
        if (await file.exists()) {
          await Bun.remove(path)
        }
      },

      async list<T>(prefix: string): Promise<T[]> {
        const glob = new Bun.Glob(`${prefix}/*.json`)
        const results: T[] = []
        for await (const path of glob.scan({ cwd: dir })) {
          const value = await this.read<T>(path.replace(".json", ""))
          if (value) results.push(value)
        }
        return results
      },

      async exists(key: string): Promise<boolean> {
        const path = `${dir}/${key}.json`
        const file = Bun.file(path)
        return file.exists()
      },
    }
  }
}

export type Storage = ReturnType<typeof Storage.create>
```

---

## packages/core/src/config.ts

```typescript
import type { RoleCredentials } from "./types"

export interface WriteCredentialsOptions {
  awsDir: string
  profileName: string
  credentials: RoleCredentials
  region?: string
}

export namespace ConfigManager {
  export async function writeCredentials(options: WriteCredentialsOptions): Promise<void> {
    const { awsDir, profileName, credentials, region } = options
    const credentialsPath = `${awsDir}/credentials`

    const file = Bun.file(credentialsPath)
    let content = (await file.exists()) ? await file.text() : ""

    const section = `[${profileName}]
aws_access_key_id = ${credentials.accessKeyId}
aws_secret_access_key = ${credentials.secretAccessKey}
aws_session_token = ${credentials.sessionToken}${region ? `\nregion = ${region}` : ""}`

    const sectionRegex = new RegExp(`\\[${profileName}\\][^\\[]*`, "g")
    if (content.match(sectionRegex)) {
      content = content.replace(sectionRegex, section + "\n")
    } else {
      content = content.trim() + "\n\n" + section + "\n"
    }

    await Bun.write(credentialsPath, content)
  }
}
```

---

## packages/core/src/client.ts

```typescript
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
    const registerResponse = await this.oidcClient.send(
      new RegisterClientCommand({
        clientName: "awsesh",
        clientType: "public",
      })
    )

    const deviceAuthResponse = await this.oidcClient.send(
      new StartDeviceAuthorizationCommand({
        clientId: registerResponse.clientId!,
        clientSecret: registerResponse.clientSecret!,
        startUrl,
      })
    )

    return {
      verificationUri: deviceAuthResponse.verificationUri!,
      userCode: deviceAuthResponse.userCode!,
      deviceCode: deviceAuthResponse.deviceCode!,
      clientId: registerResponse.clientId!,
      clientSecret: registerResponse.clientSecret!,
      expiresAt: new Date(Date.now() + (deviceAuthResponse.expiresIn ?? 600) * 1000),
      startUrl,
    }
  }

  async pollForToken(info: SSOLoginInfo): Promise<string | null> {
    const interval = 5000
    const maxAttempts = Math.floor((info.expiresAt.getTime() - Date.now()) / interval)

    for (let i = 0; i < maxAttempts; i++) {
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
      } catch (error: any) {
        if (error.name === "AuthorizationPendingException") {
          await new Promise((resolve) => setTimeout(resolve, interval))
          continue
        }
        if (error.name === "SlowDownException") {
          await new Promise((resolve) => setTimeout(resolve, interval * 2))
          continue
        }
        throw error
      }
    }
    return null
  }

  async listAccounts(accessToken: string): Promise<Account[]> {
    const accounts: Account[] = []
    let nextToken: string | undefined

    do {
      const response = await this.ssoClient.send(
        new ListAccountsCommand({ accessToken, nextToken })
      )
      for (const account of response.accountList ?? []) {
        accounts.push({
          accountId: account.accountId!,
          name: account.accountName!,
          roles: [],
          rolesLoaded: false,
        })
      }
      nextToken = response.nextToken
    } while (nextToken)

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

    const creds = response.roleCredentials!
    return {
      accessKeyId: creds.accessKeyId!,
      secretAccessKey: creds.secretAccessKey!,
      sessionToken: creds.sessionToken!,
      expiration: creds.expiration!,
    }
  }

  getDashboardURL(startUrl: string): string {
    return startUrl
  }

  getAccountURL(accountId: string, accessToken: string, startUrl: string, roleName: string): string {
    const baseUrl = startUrl.replace(/\/$/, "")
    return `${baseUrl}/#/console?account_id=${accountId}&role_name=${roleName}`
  }
}
```

---

## packages/awsesh/src/global.ts

```typescript
import { xdgConfig, xdgData } from "xdg-basedir"
import { homedir } from "os"
import { join } from "path"

export namespace Global {
  export const Path = {
    config: join(xdgConfig ?? join(homedir(), ".config"), "awsesh"),
    data: join(xdgData ?? join(homedir(), ".local", "share"), "awsesh"),
    aws: join(homedir(), ".aws"),
    awsConfig: join(homedir(), ".aws", "config"),
    awsCredentials: join(homedir(), ".aws", "credentials"),
  }

  export const Limits = {
    maxAccountsForRoleLoading: 100,
  }
}
```

---

## packages/awsesh/src/instance.ts

```typescript
import { createAwsesh, type Awsesh } from "@awsesh/core"
import { Global } from "./global"

let instance: Awsesh | undefined

export function getAwsesh(): Awsesh {
  if (!instance) {
    instance = createAwsesh({
      configDir: Global.Path.config,
      dataDir: Global.Path.data,
      awsDir: Global.Path.aws,
    })
  }
  return instance
}
```

---

## packages/awsesh/src/tui/context/awsesh.tsx

```typescript
import { createSimpleContext } from "./helper"
import { createAwsesh } from "@awsesh/core"
import { Global } from "../../global"

export const { use: useAwsesh, provider: AwseshProvider } = createSimpleContext({
  name: "Awsesh",
  init: () => {
    return createAwsesh({
      configDir: Global.Path.config,
      dataDir: Global.Path.data,
      awsDir: Global.Path.aws,
    })
  },
})
```

---

## TUI Usage Example

```typescript
// packages/awsesh/src/tui/context/aws.tsx
import { useAwsesh } from "./awsesh"

export const { use: useAWS, provider: AWSProvider } = createSimpleContext({
  name: "AWS",
  init: () => {
    const awsesh = useAwsesh()
    const [sessions, setSessions] = createSignal<SSOSession[]>([])
    const [accounts, setAccounts] = createStore<Record<string, Account[]>>({})

    async function loadSessions() {
      const list = await awsesh.sessions.list()
      setSessions(list)
    }

    async function loadAccounts(sessionName: string) {
      const session = await awsesh.sessions.get(sessionName)
      if (!session) return

      const cached = await awsesh.accounts.get(sessionName)
      if (cached && Date.now() - cached.lastUpdated < config.cacheAccountDuration) {
        setAccounts(sessionName, cached.accounts)
        return
      }

      const tokenCache = await awsesh.tokens.get(sessionName)
      if (!tokenCache || !awsesh.tokens.isValid(tokenCache)) {
        return
      }

      const list = await awsesh.sso.listAccounts(session, tokenCache.token)
      setAccounts(sessionName, list)
      await awsesh.accounts.save(sessionName, { accounts: list, lastUpdated: Date.now() })
    }

    async function getCredentials(sessionName: string, accountId: string, roleName: string, region?: string) {
      const session = await awsesh.sessions.get(sessionName)
      const tokenCache = await awsesh.tokens.get(sessionName)
      if (!session || !tokenCache) return

      const creds = await awsesh.sso.getCredentials(session, tokenCache.token, accountId, roleName)

      const key = `${sessionName}/${accountId}/${roleName}`
      let profileName = await awsesh.profileNames.get(key)
      if (!profileName) {
        profileName = `${sessionName}-${accountId}`
      }

      await awsesh.credentials.write(profileName, creds, region)
      return { profileName, credentials: creds }
    }

    return {
      sessions,
      accounts,
      loadSessions,
      loadAccounts,
      getCredentials,
    }
  },
})
```

---

## External SDK Usage

```typescript
import { createAwsesh } from "@awsesh/core"

const awsesh = createAwsesh({
  configDir: "/custom/config",
  dataDir: "/custom/data",
  awsDir: "/custom/.aws",
})

const sessions = await awsesh.sessions.list()
const session = sessions[0]

const loginInfo = await awsesh.sso.startLogin(session)
console.log(`Open: ${loginInfo.verificationUri}`)
console.log(`Code: ${loginInfo.userCode}`)

const token = await awsesh.sso.pollForToken(session, loginInfo)
if (token) {
  await awsesh.tokens.save(session.name, {
    token,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    startUrl: session.startUrl,
  })
}

const accounts = await awsesh.sso.listAccounts(session, token)
const creds = await awsesh.sso.getCredentials(session, token, accounts[0].accountId, "AdminRole")
await awsesh.credentials.write("my-profile", creds, "eu-west-1")
```

---

## Implementation Order

1. Create workspace root package.json
2. Create packages/core/ with all SDK files
3. Create packages/awsesh/ structure
4. Move existing src/ files to packages/awsesh/src/
5. Update imports to use @awsesh/core
6. Add AwseshProvider to TUI context stack
7. Refactor aws.tsx context to use SDK
8. Update CLI commands to use SDK
9. Test and fix any issues
