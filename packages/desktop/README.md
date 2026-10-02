# Sesh for macOS

Native Rust / GPUI client for awsesh. A desktop workspace with an organization
sidebar, searchable account list, account inspector and credential management.
No webview and no Rust AWS implementation. See [DESIGN.md](DESIGN.md) for the
design direction, delivery phases and platform verification requirements.

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

- Click, up/down or Enter to inspect an account. Selection never writes credentials.
- Escape dismisses a dialog; organizations remain available in the sidebar.
- Command-F to search; Command-R to refresh.
- Command-N / Command-E to create / edit an SSO session.
- Command-B to open the SSO dashboard or selected account in AWS Console.
- Command-1 for accounts; Command-2 for credentials; Command-comma for settings.
- Command-P for context-sensitive commands.
- Select a role in the inspector, then use Set Credentials or Command-Enter.
- Region and CLI profile changes require their own Save action. Unsaved changes
  block Set Credentials so it cannot silently use old preferences.
- Role selection is local until Make Preferred or Set Credentials is requested.
- Credentials show expiry countdowns, profile metadata, copy actions and confirmed removal.
- Appearance follows the system by default; System/Light/Dark is saved by the SDK.
- macOS application, File, Edit and View menus expose common operations.

Windows and Linux use Control instead of Command. Their modifiers, technical fonts
and menu integration live in `src/platform.rs`; the workspace and SDK are shared.
These platforms have not yet been compiled or interactively verified. Their native
integration and distribution packages have dedicated follow-up passes.

### First-pass verification

The macOS release bundle was built, ad-hoc signing verified, and the shared
TypeScript checks and 209 existing tests passed. Native smoke checks used isolated
sample configuration and credential files: account navigation, Enter/role selection,
credential inspection, settings shortcuts and the dark appearance button. Browsing
left credentials and preferred-role storage unchanged; appearance persisted through
the SDK. No live AWS authorization or credential retrieval was exercised.

Setting credentials updates `~/.aws/credentials` through the SDK, including its
existing tracking and preferences. It cannot change the environment of an already
running shell. Session deletion removes the session configuration only; use sign-out
to remove its tracked credential profiles first. Sign-out clears local credentials,
not the browser's AWS session.

## Architecture

- `src/main.rs`: transient state, navigation and SDK request coordination.
- `src/ui.rs`: shared GPUI workspace, inspectors, settings and dialogs.
- `src/platform.rs`: platform shortcuts, fonts and application menus.
- `bridge/index.ts`: allowlisted JSON-lines transport over private process pipes.
- `@awsesh/core`'s `createWorkflow()`: session CRUD, authorization, account/role
  caching, preferences and credential lifecycle. Reusable by other clients.

The helper is long-lived so device authorization stays inside the SDK. Access
tokens, device secrets and role credentials never cross into Rust. Requests are
serialized and run off the UI thread. Closing the app terminates its helper.
The app shares the CLI/TUI's XDG configuration and data directories and `~/.aws`.
Development can select a Bun executable with `AWSESH_BUN`.
