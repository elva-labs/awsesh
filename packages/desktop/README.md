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

- Click, up/down or Enter to inspect an account. Double-click explicitly sets
  credentials for the selected/preferred role; without a role, choose one first.
- Escape dismisses a dialog; organizations remain available in the sidebar.
- Command-F to search; Command-R to refresh.
- Command-N / Command-E to create / edit an SSO session.
- Command-B to open the SSO dashboard or selected account in AWS Console.
- Command-1 for accounts; Command-2 for credentials; Command-comma for settings.
- Command-K or Command-P opens the searchable command bar. Type to filter,
  use up/down to navigate and Enter to run a command. Escape dismisses it.
- Right-click organizations, accounts or credential profiles for contextual actions.
- The current organization does not reload when clicked again. Signed-out
  organizations and cached accounts are muted but remain available for inspection.
- Double-click a signed-out organization to start SSO sign-in.
- Role retrieval and credential setting run in the background without disabling
  navigation or other controls. SDK requests are ordered; stale organization
  responses cannot replace the account list you are currently viewing.
- Controls have larger targets; the compact header contains authentication status,
  refresh and a session-actions menu. Default credentials are green; named profiles
  use a distinct secondary color.
- Account names and IDs in the inspector are clickable to copy, with hover feedback
  and a “Click to copy” tooltip.
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

The interaction pass also verified command-bar filtering and arrow/Enter execution,
organization and credential context menus, clipboard results for name/ID clicks,
preserved search when clicking the current organization, and the signed-out
double-click guard. Checks used the same isolated data; credential files were unchanged.

Background responsiveness was checked by suspending the isolated SDK helper with
a credential request in flight, then navigating accounts and opening the command
bar. A separate suspended role request verified account navigation and clipboard
actions remained usable. Double-clicking a signed-out organization opened the SSO
preparation dialog; Escape dismissed it while the helper was still suspended.
The suspended requests were never allowed to contact AWS. Named-theme support is
assessed in [DESIGN.md](DESIGN.md); it has not been implemented.
An isolated region save was queued while the helper was suspended, followed by an
organization switch. After resuming the helper, the preference persisted and the
app remained on the new organization's account list.

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
