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
  details in one place. Region/profile preferences save after a 400 ms debounce,
  blur or Enter; captured edits remain bound to their original account/role.
  Pending or invalid preferences cannot silently be used to acquire credentials.
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
application implementations. Retain native window controls; only macOS uses the
floating titlebar treatment.

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

## Shared themes, separate appearance preferences

`@awsesh/themes` owns the 35 bundled JSON definitions, custom-file discovery,
validation and reference/light/dark/ANSI resolution. It has no AWS, OpenTUI or GPUI
dependencies and returns normalized hex colors. Both interfaces discover custom
files in `$XDG_CONFIG_HOME/awsesh/themes/*.json`, defaulting to
`~/.config/awsesh/themes/*.json`. Invalid files are skipped individually with warnings.
See [the theme format](../themes/README.md).

The TUI adapts those colors into OpenTUI `RGBA` values. Its `system` palette remains
terminal-derived; its picker still previews choices and restores the original on
cancel. The existing `config.json` theme and theme_mode preferences are unchanged.

Desktop settings and the command bar expose the same named catalog. The Bun helper
loads and resolves themes through separate `getAppearance`/`setAppearance`
operations, not through `createWorkflow()` or AWS snapshots. Rust receives the
selected theme's light and dark palettes and maps them into GPUI's global theme:
workspace surfaces, inputs, buttons, menus, hover/focus/selection, disabled text and
semantic status colors. Theme tokens containing alpha are first composited over
the native palette. Optional window translucency is applied afterward, so it works
with both named themes and the native system palette without modifying definitions.

Desktop selection and System/Light/Dark mode are saved in `desktop.json`, independent
of TUI preferences. The old desktop appearance preference is retained as a read-only
migration fallback. System uses the native desktop palette; system-mode changes
select the appropriate resolved variant locally without another helper request.
Theme and mode writes are partial, ordered updates so changing both quickly cannot
overwrite the other choice with an earlier value.

Desktop-only `translucency`, `dithering`, `sidebarVisible` and `sidebarWidth`
preferences also live in `desktop.json`. Sidebar visibility and its 192–400px width
restore on launch; its divider supports dragging and keyboard focus.
The same desktop-only file stores sparse application shortcut overrides. A single
Rust action catalog owns default bindings, Settings rows and tooltip labels. The
shortcut recorder intercepts keys before action dispatch; validation rejects
duplicates, unsupported keys and editing/window-control conflicts. Rebuilding the
keymap retains the component/navigation/system bindings captured at startup, then
recreates native menus from the current application bindings. Empty string values
disable individual shortcuts; clearing the override map restores defaults.
The 0–100% slider defaults to 10%, with a visible tick and pointer
snapping within two percentage points. Keyboard adjustments retain 1% precision.
Values above 0% request GPUI's native blurred
window background and reduce the theme tint's opacity by the selected percentage.
One window tint covers the workspace, sidebar and status bar; those window-sized
panels do not paint a second tint over it. This avoids alpha stacking that previously
made the sidebar appear opaque. Component surfaces retain their own theme colors.
Text and icon opacity is unchanged, and popovers and dialogs retain opaque surfaces.
GPUI's select component uses the global window background for both its field and
dropdown. `theme::opaque_select` scopes an opaque version of that token to the
select's layout/render traversal, then restores the window tint before sibling
elements render. Both the role and theme selectors use it; searchable-list state,
deferred popup placement and keyboard behavior remain owned by gpui-component.
Popup menus use the separate, opaque `popover` token and restore workspace focus
when dismissed. Main input fields use 44px minimum heights; selectors use large
search/list sizing, and popup-menu rows use 36px custom labels. No dependency fork
is needed. Open theme location creates a disabled, non-overwriting example from
the bundled GitHub definition, then reveals it in the native file manager.
The slider previews locally and debounces persistence by 150 ms, without queueing
a helper write for every drag event. Its strength is retained when switching themes
or light/dark modes. Legacy `translucent: false` settings become 0%; saved strengths
are preserved. Subsequent writes omit the removed boolean. Native blur support depends on the
platform; the current application bundle is verified on macOS.
The slider controls tint opacity, not blur radius. GPUI 0.2.2 uses the AppKit
`Selection` effect material, which no longer supplies backdrop blur on recent macOS.
After each blurred-background request, `platform::apply_window_background` obtains
the borrowed AppKit view from GPUI's raw window handle, validates its runtime type
and changes only GPUI's `BlurredView` to the public `UnderWindowBackground` material
with `BehindWindow` blending. This follows Zeron's backend correction without
vendoring GPUI or changing its lifecycle; GPUI still creates, resizes and removes
the effect view. The raw pointer is used only during the borrowed window's lifetime
on GPUI's UI thread. The system can still disable effects for accessibility.

The optional dither texture sits above the native blurred backdrop and the single
window tint, but below all controls. A cached transparent SVG tiles a 4×4 Bayer
matrix of balanced bright/dark 2×2 cells at fixed scale; its 12% maximum opacity
does not fade to invisibility at the default 10% translucency. No second window
tint is painted, and the live backdrop remains owned by macOS. There is no
wallpaper loading, screen capture or background-image processing. Disabling the
texture leaves the same native blur in place; 0% translucency hides it without
clearing the checkbox preference. This is ordered texture compositing, not the
color quantization of an image used by Zeron. GPUI does not expose the native
blurred backdrop pixels for such a filter.

Theme import UI and desktop preview/cancel can be added later without moving themes
into the SDK. File-based installation already makes a definition available to both
interfaces, without forcing either interface to select it.

## macOS floating window toolbar

The supplied screenshot shows a compact, rounded titlebar toolbar around the native
traffic lights, not a bottom status bar. One GPUI control group is pinned above the
sidebar at the window's top-left. Its position and identity do not change when the
sidebar toggles: the background integrates with the open sidebar and becomes an
inset, theme-tinted capsule when closed. AppKit owns close, minimize and fullscreen controls. Its existing useful
actions are Toggle Sidebar, Commands and Settings; no navigation-history subsystem
was added merely to reproduce the screenshot's arrows.

The pinned GPUI 0.2.2 already exposes the required window setup:

```rust
titlebar: Some(gpui::TitlebarOptions {
    title: Some("Sesh".into()),
    appears_transparent: true,
    traffic_light_position: Some(gpui::point(gpui::px(18.), gpui::px(14.))),
}),
```

`appears_transparent` enables full-size content behind the titlebar on macOS;
`traffic_light_position` moves the actual AppKit standard window buttons. Keep
`titlebar: Some(...)`: removing it is not the way to preserve the standard controls.
The leading traffic-light slot disappears in fullscreen, where AppKit owns its
auto-revealing controls; it returns when fullscreen exits. Application actions have
fixed-width slots, keyboard focus and tooltips. Sidebar width and capsule-background
opacity share Zeron's 200 ms CSS ease-out curve (`cubic-bezier(0, 0, 0.58, 1)`).
The organization/screen title, labeled authentication status, session menu and
refresh action occupy the same 38px top row instead of a second 56px header below
an empty titlebar strip. Their horizontal clearance follows the same sidebar
progress and finishes just after the fixed capsule when collapsed. Controls are
24px high with centered 16px icons, 6px corners and 2px action spacing; title/status
groups use 8px separation. Native traffic lights have a larger reserved leading
slot, and a 4px top inset aligns the row optically. Icon-only buttons omit empty
labels rather than reserving a text gap beside the icon. Windows/Linux use the
same compact workspace header below their existing native decorations.
A manual, persistent transition starts reversals from the painted progress and
does not replay on screen changes; macOS Reduce Motion snaps to the target.
Empty-surface drag follows Zeron's
titlebar event handling. GPUI 0.2.2's macOS `start_window_move()` is a no-op, so the
platform adapter calls AppKit's public `performWindowDragWithEvent` with the current
event; double-click delegates to GPUI's system titlebar action. Toolbar buttons clear
pending drag state and stop mouse/click propagation. GPUI's content view receives an
ivar-free subclass that overrides AppKit's private `_opaqueRectForWindowMoveWhenInTitlebar`
hook, matching Zeron's app-owned-titlebar boundary. This prevents AppKit from also
interpreting toolbar double-clicks as native titlebar zoom, without disabling window
movement or tiling. GPUI keeps its inherited rendering, input and destruction methods;
the subclass adds no instance storage and is installed on the UI thread. This hook
needs re-verification on older/newer macOS versions. Inactive-window
actions use muted text. Sidebar visibility is transient, not another preference.

**Glass is a separate choice.** A tinted translucent capsule needs no extra
dependency. `WindowBackgroundAppearance::Blurred` is available for native blur
behind the window; in the macOS implementation it installs an NSVisualEffectView
behind the whole GPUI content view. It is not a per-element backdrop filter and
does not automatically blur GPUI content inside the application under a toolbar.
An exact within-window glass effect would need a separate rendering/AppKit
integration experiment; a screenshot cannot establish which method its app uses.

Windows/Linux retain their existing decorations. Full macOS accessibility coverage
and older macOS releases remain part of the native-platform acceptance pass.

Source references for the pinned dependencies:

- [GPUI TitlebarOptions and WindowBackgroundAppearance](https://docs.rs/gpui/0.2.2/gpui/struct.TitlebarOptions.html)
- [gpui-component TitleBar](https://docs.rs/gpui-component/0.5.1/gpui_component/struct.TitleBar.html)
- GPUI source: `src/platform/mac/window.rs`, `move_traffic_light` and
  `set_background_appearance`; gpui-component source: `src/title_bar.rs`.
- [Zeron floating titlebar](https://github.com/zeronsh/zeron/blob/64ad6f6ef03a8282c1847329804542f014c97d54/crates/ui/src/shell.rs)
  and [ordered background dithering](https://github.com/zeronsh/zeron/blob/64ad6f6ef03a8282c1847329804542f014c97d54/crates/ui/src/new_thread_background_effects.rs).
- [Zeron's GPUI macOS blur correction](https://github.com/zeronsh/zui/blob/667d0aaf9531d2d1b2d0674a5e55f977df1b09f6/crates/gpui_macos/src/window.rs),
  `blurred_view_init_with_frame` and `opaque_rect_for_window_move_when_in_titlebar`.
