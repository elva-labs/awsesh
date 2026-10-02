# Desktop experience

## Direction

Sesh is a desktop workspace for AWS sessions, not a terminal in a window.
Prioritize macOS for implementation and hands-on testing, without forking the
application model or its shared interface for Windows and Linux.

Use a restrained native utility aesthetic: system typography, neutral surfaces,
compact lists, clear separators and a single blue accent. Reserve monospace for
account IDs and CLI values. Follow system light/dark appearance by default.

## Workspace

- Persistent sidebar: SSO organizations, active credentials, settings and a
  discoverable Add Session action. Switching organizations does not require Back.
- Searchable account list: account names, IDs and credential status. Selection
  reveals details; clicking, double-clicking or pressing Enter never writes credentials.
- Account inspector: role selection, region, CLI profile and active credential
  details in one place. Changes to preferences have explicit Save actions.
- Explicit primary actions: Set Credentials and Open AWS Console. A role choice
  remains local until Set Credentials or Make Preferred is requested.
- Credential workspace: active profiles, their account/role/session, expiration
  countdowns and clearly confirmed removal. Distinguish default credentials.
- Session management: edit, sign in, portal access, local sign-out and deletion.
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
   context menus, a searchable command palette, accessibility and keyboard focus
   across every state. Test real SSO with an authorized account. Add signing,
   notarization, an application icon and distribution packaging.
3. Dedicated Windows and Linux passes: compile and test on their actual platforms,
   refine fonts, menus, decorations, shortcuts and system integration, then provide
   suitable signed installers/packages. Shared source alone is not proof of support.

System-tray/menu-bar account switching is a later enhancement to the workspace,
not a replacement for it. Favorites, grouping and notifications should follow
observed usage rather than speculative configuration.

## Acceptance for the first pass

- Selecting accounts or roles cannot acquire/write credentials.
- Organizations remain reachable from every workspace.
- Role, region and profile are visible together with explicit actions.
- Expiry and default-profile status are understandable without a command palette.
- Keyboard navigation, search, forms and destructive confirmations remain usable.
- SDK operations are covered by existing tests; no real AWS files are changed by
  automated/native smoke verification.
- Document what was actually tested, especially macOS-only verification and
  remaining feature parity or platform gaps.
