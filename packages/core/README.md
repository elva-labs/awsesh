# @awsesh/core

AWS SSO session management SDK for Node.js and Bun.

## Installation

```sh
npm install @awsesh/core
# or
bun add @awsesh/core
```

## Quick Start

```typescript
import { createAwsesh } from "@awsesh/core"

const awsesh = createAwsesh({
  configDir: "/home/user/.config/awsesh",
  dataDir: "/home/user/.local/share/awsesh",
  awsDir: "/home/user/.aws",
})

// List available SSO sessions
const sessions = await awsesh.sessions.list()

// Authenticate and get credentials
const session = sessions[0]
const loginInfo = await awsesh.sso.startLogin(session)

// Open this URL in browser for user to authenticate
console.log(loginInfo.verificationUriComplete)

// Poll until user completes authentication
const token = await awsesh.sso.pollForToken(session, loginInfo)

// List accessible accounts
const accounts = await awsesh.sso.listAccounts(session, token.token)

// Get credentials for a role
const creds = await awsesh.sso.getCredentials(
  session,
  token.token,
  accounts[0].accountId,
  "AdministratorAccess"
)

console.log(creds.accessKeyId)
```

For a complete working example, see [awsesh-sdk-example](https://github.com/elva-labs/awsesh-sdk-example).

---

## API Reference

### `createAwsesh(options)`

Creates an awsesh instance with all SDK functionality.

```typescript
interface AwseshOptions {
  configDir: string  // Directory for configuration (e.g., ~/.config/awsesh)
  dataDir: string    // Directory for data storage (e.g., ~/.local/share/awsesh)
  awsDir: string     // AWS directory (e.g., ~/.aws)
}

const awsesh = createAwsesh(options)
```

---

## Sessions

Manage SSO session configurations.

### `sessions.list()`

Returns all configured SSO sessions.

```typescript
const sessions = await awsesh.sessions.list()
// Returns: SSOSession[]
```

### `sessions.get(name)`

Get a specific session by name.

```typescript
const session = await awsesh.sessions.get("my-org")
// Returns: SSOSession | undefined
```

### `sessions.save(session)`

Save or update a session.

```typescript
await awsesh.sessions.save({
  name: "my-org",
  startUrl: "https://my-org.awsapps.com/start",
  ssoRegion: "us-east-1",
  defaultRegion: "eu-west-1",
})
```

### `sessions.remove(name)`

Delete a session.

```typescript
await awsesh.sessions.remove("my-org")
```

### `sessions.exists(name)`

Check if a session exists.

```typescript
const exists = await awsesh.sessions.exists("my-org")
// Returns: boolean
```

### `sessions.count()`

Get the number of configured sessions.

```typescript
const count = await awsesh.sessions.count()
// Returns: number
```

### Session Type

```typescript
interface SSOSession {
  name: string
  startUrl: string      // e.g., "https://my-org.awsapps.com/start"
  ssoRegion: string     // e.g., "us-east-1"
  defaultRegion: string // e.g., "eu-west-1"
}
```

---

## SSO Operations

Core AWS SSO authentication and authorization.

### `sso.startLogin(session)`

Initiate device code flow authentication.

```typescript
const loginInfo = await awsesh.sso.startLogin(session)
// Returns: SSOLoginInfo
```

The returned `loginInfo` contains:

```typescript
interface SSOLoginInfo {
  verificationUri: string         // Base URL for verification
  verificationUriComplete: string // URL with code pre-filled (open this)
  userCode: string                // Code to enter manually
  deviceCode: string              // Internal device code
  interval: number                // Polling interval in seconds
  clientId: string
  clientSecret: string
  expiresAt: Date                 // When the login request expires
  startUrl: string
}
```

### `sso.pollForToken(session, loginInfo)`

Poll for authentication completion. Call this after the user has opened `verificationUriComplete` in their browser.

```typescript
const result = await awsesh.sso.pollForToken(session, loginInfo)
// Returns: { token: string, expiresAt: Date }
```

This will poll at the interval specified in `loginInfo` until:
- User completes authentication (returns token)
- Request expires (throws error)
- User denies access (throws error)

### `sso.listAccounts(session, token)`

List all AWS accounts accessible to the user.

```typescript
const accounts = await awsesh.sso.listAccounts(session, token)
// Returns: Array<{ accountId: string, accountName: string, emailAddress: string }>
```

### `sso.listRoles(session, token, accountId)`

List roles available for a specific account.

```typescript
const roles = await awsesh.sso.listRoles(session, token, "123456789012")
// Returns: Array<{ roleName: string, accountId: string }>
```

### `sso.getCredentials(session, token, accountId, roleName)`

Get temporary AWS credentials for a role.

```typescript
const creds = await awsesh.sso.getCredentials(
  session,
  token,
  "123456789012",
  "AdministratorAccess"
)
// Returns: RoleCredentials
```

```typescript
interface RoleCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}
```

### `sso.getDashboardUrl(session)`

Get the SSO dashboard URL for a session.

```typescript
const url = awsesh.sso.getDashboardUrl(session)
// Returns: string
```

### `sso.getAccountUrl(session, accountId, token, roleName)`

Get a federated console URL for direct access to an account.

```typescript
const url = await awsesh.sso.getAccountUrl(session, accountId, token, roleName)
// Returns: string
```

---

## Token Cache

Manage cached authentication tokens.

### `tokens.get(startUrl)`

Get a valid cached token for a start URL.

```typescript
const token = await awsesh.tokens.get("https://my-org.awsapps.com/start")
// Returns: TokenCache | undefined (undefined if expired or not found)
```

### `tokens.getWithExpired(startUrl)`

Get a cached token even if expired (useful for checking if re-auth is needed).

```typescript
const token = await awsesh.tokens.getWithExpired(startUrl)
// Returns: TokenCache | undefined
```

### `tokens.save(startUrl, token, expiresAt)`

Cache a token.

```typescript
await awsesh.tokens.save(
  "https://my-org.awsapps.com/start",
  tokenString,
  new Date("2024-12-31T23:59:59Z")
)
```

### `tokens.remove(startUrl)`

Remove a cached token.

```typescript
await awsesh.tokens.remove("https://my-org.awsapps.com/start")
```

### `tokens.isValid(cache)`

Check if a token cache entry is still valid.

```typescript
const valid = awsesh.tokens.isValid(tokenCache)
// Returns: boolean
```

### Token Type

```typescript
interface TokenCache {
  token: string
  expiresAt: Date
  startUrl: string
}
```

---

## Account Cache

Cache account lists for faster access.

### `accounts.get(sessionName)`

Get cached accounts for a session.

```typescript
const cache = await awsesh.accounts.get("my-org")
// Returns: AccountCache | undefined
```

### `accounts.save(sessionName, cache)`

Save account cache.

```typescript
await awsesh.accounts.save("my-org", {
  accounts: [...],
  lastUpdated: Date.now(),
})
```

### Account Types

```typescript
interface Account {
  accountId: string
  name: string
  roles: string[]
  rolesLoaded: boolean
  region?: string        // Optional custom region override
}

interface AccountCache {
  accounts: Account[]
  lastUpdated: number    // Unix timestamp
}
```

---

## Credentials

Write credentials to AWS credentials file.

### `credentials.write(profileName, creds, region?)`

Write credentials to `~/.aws/credentials`.

```typescript
await awsesh.credentials.write("my-profile", {
  accessKeyId: "AKIA...",
  secretAccessKey: "...",
  sessionToken: "...",
  expiration: new Date(),
}, "eu-west-1")
```

### `credentials.removeProfile(profileName)`

Remove a profile from credentials file.

```typescript
await awsesh.credentials.removeProfile("my-profile")
```

### `credentials.listProfiles()`

List all profiles in credentials file.

```typescript
const profiles = await awsesh.credentials.listProfiles()
// Returns: string[]
```

---

## Active Credentials

Track active credential sessions.

### `activeCredentials.list()`

List all active (non-expired) credentials.

```typescript
const active = await awsesh.activeCredentials.list()
// Returns: ActiveCredential[]
```

### `activeCredentials.save(credential)`

Save an active credential entry.

```typescript
await awsesh.activeCredentials.save({
  profileName: "my-profile",
  accountId: "123456789012",
  accountName: "Production",
  roleName: "AdminRole",
  sessionName: "my-org",
  expiration: "2024-12-31T23:59:59Z",
  isDefault: true,
})
```

### `activeCredentials.remove(accountId, roleName)`

Remove a specific active credential.

```typescript
await awsesh.activeCredentials.remove("123456789012", "AdminRole")
```

### `activeCredentials.cleanup()`

Remove all expired credentials from tracking.

```typescript
await awsesh.activeCredentials.cleanup()
```

### Active Credential Type

```typescript
interface ActiveCredential {
  profileName: string
  accountId: string
  accountName: string
  roleName: string
  sessionName: string
  expiration: string    // ISO date string
  isDefault: boolean
}
```

---

## Preferences

Store user preferences.

### `lastSelected.get()` / `lastSelected.save()`

Remember last selected session/account/role.

```typescript
const last = await awsesh.lastSelected.get()
// Returns: { session?: string, account?: string, role?: string }

await awsesh.lastSelected.save({ session: "my-org", account: "123456789012" })
```

### `lastSession.get()` / `lastSession.save()`

Remember last used SSO session.

```typescript
const sessionName = await awsesh.lastSession.get()
await awsesh.lastSession.save("my-org")
```

### `lastAccountPerSession.get()` / `lastAccountPerSession.save()`

Remember last selected account per session.

```typescript
const accountId = await awsesh.lastAccountPerSession.get("my-org")
await awsesh.lastAccountPerSession.save("my-org", "123456789012")
```

### `preferredRoles.get()` / `preferredRoles.save()`

Remember preferred role per account.

```typescript
const role = await awsesh.preferredRoles.get("my-org", "123456789012")
await awsesh.preferredRoles.save("my-org", "123456789012", "AdminRole")
```

### `profileNames.get()` / `profileNames.save()`

Remember custom profile names for account/role combinations.

```typescript
const profileName = await awsesh.profileNames.get("my-org", "Production", "AdminRole")
await awsesh.profileNames.save("my-org", "Production", "AdminRole", "prod-admin")
```

---

## Low-Level Exports

For advanced use cases, you can import individual classes:

```typescript
import { AWSClient, Credentials, Sessions, Storage } from "@awsesh/core"

// Direct AWS SSO client
const client = new AWSClient("us-east-1")
const loginInfo = await client.startSSOLogin("https://my-org.awsapps.com/start")

// Direct storage access
const storage = Storage.create({ dir: "/path/to/storage" })
await storage.write("key", { data: "value" })
const data = await storage.read("key")
```

---

## Types

All types are exported from the package:

```typescript
import type {
  AwseshOptions,
  SSOSession,
  SSOLoginInfo,
  TokenCache,
  TokenResult,
  Account,
  AccountCache,
  RoleCredentials,
  LastSelected,
  ActiveCredential,
  LastSetCredential,
} from "@awsesh/core"
```
