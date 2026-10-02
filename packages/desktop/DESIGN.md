# Desktop experience

## Direction

Sesh is a desktop workspace for AWS sessions, not a terminal in a window.
Prioritize macOS for implementation and hands-on testing, without forking the
application model or its shared interface for Windows and Linux.

Use a restrained native utility aesthetic: system typography, neutral surfaces,
compact lists, clear separators and a single blue accent. Reserve monospace for
account IDs and CLI values. Follow system light/dark appearance by default.

Background account/role retrieval and credential writes must not disable the
workspace. Queue SDK operations in order and keep navigation/selection local;
responses from an earlier organization cannot replace the current account list.
SSO authorization and confirmation dialogs are modal. Only a submitted form's own
controls are disabled during its save, not the rest of the workspace.

Use a compact header with authentication status, an icon refresh action and a
session-actions menu. Keep credential actions in the account inspector. Status
icons retain labels: green for signed in/default credentials, amber for signed out,
and a distinct secondary color for active named profiles.

## Workspace

- Persistent sidebar: SSO organizations, active credentials, settings and a
  discoverable Add Session action. Switching organizations does not require Back.
- Searchable account list: account names, IDs and credential status. Selection
  reveals details; single-clicking or pressing Enter never writes credentials.
  Double-clicking explicitly sets credentials using the selected/preferred role.
  Without an available selected role, focus the role chooser instead.
- Account inspector: role selection, region, CLI profile and active credential
  details in one place. Changes to preferences have explicit Save actions.
- Explicit primary actions: Set Credentials and Open AWS Console. A role choice
  remains local until Set Credentials or Make Preferred is requested.
- Credential workspace: active profiles, their account/role/session, expiration
  countdowns and clearly confirmed removal. Distinguish default credentials.
- Session management: edit, sign in, portal access, local sign-out and deletion.
  Double-click a signed-out organization to start sign-in.
  Destructive operations require confirmation and explain their scope.
- Settings: system/light/dark appearance and readable keyboard guidance.

Credential status should remain visible while browsing. Never expose access keys
or tokens in the interface, transport responses or clipboard actions.

## Platform boundary

Keep GPUI views and the SDK transport shared. Isolate modifier keys, system font
choices and application menu integration in a small platform module, not separate
application implementations. Retain conventional window decorations.

- macOS: Command shortcuts, standard application/Edit/View menus, system fonts
  and appearance, native clipboard integration.
- Windows: Control shortcuts and standard window controls; taskbar and installer
  integration in the dedicated Windows pass.
- Linux: Control shortcuts and compositor-appropriate decorations; validate both
  Wayland and X11, appearance integration and desktop launchers in the Linux pass.

GPUI paints its controls. These are not AppKit/WinUI/GTK widgets. Keyboard access,
focus visibility, contrast and platform behavior must be verified explicitly.

## SDK ownership

All AWS, authentication, caching, credential and persisted preference operations
remain in `@awsesh/core`. Rust owns presentation, transient selection, keyboard
navigation and platform integration. The bundled helper is an allowlisted transport.
No platform UI should duplicate AWS workflows or edit AWS files directly.

## Delivery

1. First desktop pass: shared sidebar/list/inspector, explicit actions, inline
   preferences, credential workspace, settings, platform shortcuts and macOS menus.
   Build and interactively verify on macOS using isolated sample data.
2. Complete the native experience: audit TUI parity, window/layout restoration,
   accessibility and keyboard focus
   across every state. Test real SSO with an authorized account. Add signing,
   notarization, an application icon and distribution packaging.
3. Dedicated Windows and Linux passes: compile and test on their actual platforms,
   refine fonts, menus, decorations, shortcuts and system integration, then provide
   suitable signed installers/packages. Shared source alone is not proof of support.

System-tray/menu-bar account switching is a later enhancement to the workspace,
not a replacement for it. Favorites, grouping and notifications should follow
observed usage rather than speculative configuration.

## Acceptance for the first pass

- Single-selecting accounts or roles cannot acquire/write credentials. Double-click
  is an explicit credential-setting gesture, subject to authentication and saved preferences.
- Organizations remain reachable from every workspace.
- Role, region and profile are visible together with explicit actions.
- Expiry and default-profile status are understandable without a command palette.
- Keyboard navigation, search, forms and destructive confirmations remain usable.
- SDK operations are covered by existing tests; no real AWS files are changed by
  automated/native smoke verification.
- Document what was actually tested, especially macOS-only verification and
  remaining feature parity or platform gaps.

## TUI theme comparison

The TUI has 35 bundled JSON themes under
`packages/awsesh/src/cli/cmd/tui/context/theme/`, plus custom `themes/*.json` in its
configuration directory. `context/theme.tsx` resolves named definitions, references,
light/dark variants and terminal ANSI colors into semantic tokens. Its theme picker
previews choices and restores the previous choice on cancel. Theme name and mode
are persisted through the CLI configuration layer. The `system` theme derives its
colors from the terminal palette.

The desktop currently supports persisted System/Light/Dark appearance, not named
themes. Its workspace colors in `src/ui.rs` and GPUI component colors in
`src/platform.rs` are still separate. Default/named credential status follows the
same success/secondary distinction as the TUI, but that does not make palettes shared.

Named-theme support is a contained follow-up, not a view rewrite:

1. Move the JSON catalog, custom-file discovery and color resolution into a
   presentation-independent SDK API. Return validated resolved RGBA/hex tokens,
   not OpenTUI `RGBA` objects. Keep terminal palette generation in the TUI adapter.
2. Map those tokens into both the workspace palette and GPUI's `Theme` fields,
   including input, button, popup, hover, focus, selection and disabled states.
3. Expose theme selection/preview in desktop settings and the command bar, with
   SDK-owned persistence. Retain a native desktop default and OS mode detection;
   a terminal-derived system palette has no desktop equivalent.

No new rendering dependency is needed. The remaining work is token/persistence
integration and contrast/interaction verification, not just importing JSON files.
