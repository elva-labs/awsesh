# Sesh for macOS

Native Rust / GPUI client for awsesh. Uses the TUI's list layout, account metadata,
selection highlight, search and credential footer. No webview and no Rust AWS implementation.

## Development

Requires macOS, Xcode, a stable Rust toolchain, and Bun. From the repository root:

```sh
bun install
bun run dev:desktop
```

## Build an application

```sh
bun run build:desktop
open packages/desktop/dist/Sesh.app
```

The build packages both the native executable and a compiled Bun SDK helper.
The app does not require Bun, Node, the CLI or this checkout at runtime. Builds
target the Mac's current architecture and are ad-hoc signed for local use;
distribution signing and notarization are not configured. GPUI compiles its
embedded Metal shaders at runtime, so no separate Metal compiler is required.

## Controls

- Click to select; double-click or Enter to activate.
- Up/down or j/k to navigate. Escape to go back or dismiss a dialog.
- `/` or Command-F to search; Command-R to refresh.
- Command-N / Command-E to create / edit an SSO session.
- Command-B to open the SSO dashboard or selected account in AWS Console.
- Command-1 to view active credentials; Command-P for other commands.
- Select an account to load its roles, then select a role to set credentials.
- Region, CLI profile, preferred role, sign-out and removal are available from the interface.

Setting credentials updates `~/.aws/credentials` through the SDK, including its
existing tracking and preferences. It cannot change the environment of an already
running shell. Session deletion removes the session configuration only; use sign-out
to remove its tracked credential profiles first. Sign-out clears local credentials,
not the browser's AWS session.

## Architecture

- `src/`: GPUI presentation, native input, navigation and browser opening.
- `bridge/index.ts`: allowlisted JSON-lines transport over private process pipes.
- `@awsesh/core`'s `createWorkflow()`: session CRUD, authorization, account/role
  caching, preferences and credential lifecycle. Reusable by other clients.

The helper is long-lived so device authorization stays inside the SDK. Access
tokens, device secrets and role credentials never cross into Rust. Requests are
serialized and run off the UI thread. Closing the app terminates its helper.
The app shares the CLI/TUI's XDG configuration and data directories and `~/.aws`.
Development can select a Bun executable with `AWSESH_BUN`.
