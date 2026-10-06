# Sesh for macOS

Native Rust / GPUI client for awsesh. A desktop workspace with an organization
sidebar, searchable account list, account inspector and credential management.
No webview and no Rust AWS implementation. See [DESIGN.md](DESIGN.md) for the
design direction, delivery phases and platform verification requirements.

## Installation and support

Desktop distribution is Apple Silicon ARM64 only, targeting macOS 13 or newer.
Install the native app into `/Applications` with Homebrew:

```sh
brew install --cask elva-labs/elva/awsesh-desktop
```

On Homebrew versions requiring trusted taps, run `brew tap elva-labs/elva` and
`brew trust elva-labs/elva` first.

The cask is separate from the `awsesh` CLI formula. Uninstalling it leaves shared
AWS credentials and awsesh configuration intact. The Elva tap updates it from
newer public stable releases after verifying the desktop ZIP against `SHA256SUMS`.

Alternatively, from the first desktop-enabled [GitHub release](https://github.com/elva-labs/awsesh/releases),
download `awsesh-desktop-darwin-arm64.zip`, extract `Sesh.app` and move it to
`/Applications`. Both executables are bundled: `Contents/MacOS/sesh` is the native
Rust app and `Contents/MacOS/awsesh-sdk` embeds Bun and the shared JavaScript SDK.
No external Bun, Node, CLI or source checkout is required to run the installed app.

The first desktop release must be staged from a new tag after the release changes
reach `main`; do not retrofit `v1.0.19` or move any existing tag. Stable and beta
desktop archives follow the same immutable candidate and checksum contract as the
CLI and SDK. The minimum OS is a declared deployment target, not a claim that the
GUI or SSO has been tested on macOS 13.

### Follow-up acceptance and distribution work

The staged `v1.1.2` candidate passed production Developer ID signing, Apple
notarization, stapling and Gatekeeper assessment. Its frozen artifacts were
verified locally, and the application owner confirmed the installation works.

- Exercise the GUI on the oldest supported macOS 13 system and perform real SSO
  only with explicit authorization and isolated configuration.
- Application icon and in-app updating are not implemented. Homebrew users update
  the desktop app with `brew upgrade --cask awsesh-desktop`.
- Intel/universal and Windows/Linux desktop distribution are not provided.

## Development

Requires an Apple Silicon Mac, Xcode, Rust 1.99.0, and Bun 1.4.2. From the repository root:

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
target ARM64 with a macOS 13.0 deployment target and are ad-hoc signed for local use.
Stable and beta release versions are preserved in Rust Settings and the
`AWSESHReleaseVersion` bundle field; Apple's short version uses the numeric base.
CI uses its positive `GITHUB_RUN_NUMBER` as the bundle build version; local builds
use the numeric base version. GPUI compiles its
embedded Metal shaders at runtime, so no separate Metal compiler is required.

## Production signing

`bun run packages/desktop/script/release.ts` is the trusted macOS ARM64 staging
entry point, not the local build command. It requires all six company secrets:

| Secret | Expected value |
| --- | --- |
| `MACOS_CERTIFICATE` | Base64-encoded `.p12` containing a Developer ID Application certificate and private key |
| `MACOS_CERTIFICATE_PASSWORD` | Password for that `.p12` |
| `MACOS_SIGN_IDENTITY` | Matching Developer ID Application identity name or SHA-1 fingerprint |
| `NOTARY_KEY` | Base64-encoded, unencrypted PEM `.p8` App Store Connect private key |
| `NOTARY_KEY_ID` | App Store Connect API key ID |
| `NOTARY_ISSUER_ID` | App Store Connect issuer UUID |

These formats match the organization secrets consumed by the
[claude-stats release workflow](https://github.com/elva-labs/claude-stats/blob/main/.github/workflows/release.yml).
Only the certificate and notarization key are base64-encoded; the other four values
are plain text. The script validates these encodings and the imported identity and fails closed.
Credentials are written with restricted permissions to a temporary directory;
a temporary keychain uses a random per-run password. Signing selects that keychain
explicitly, without changing the default keychain. The temporary keychain is added
to the search list for certificate-chain discovery while retaining every original
entry. Native keychain deletion removes its search-list entry. Both credential
files and the keychain are removed in `finally`.

The compiled SDK helper is signed first with hardened runtime, a timestamp and
only `com.apple.security.cs.allow-jit`. The outer Rust app is signed last without
JIT exceptions. Library validation stays enabled; no sandbox entitlement is added.
The helper's empty snapshot and default appearance checks use isolated HOME/XDG,
a closed localhost AWS endpoint, disabled instance metadata and no Bun on PATH.
The GUI is not launched on hosted runners.

Native `ditto` packaging precedes `notarytool --wait`; the script requires Apple's
`Accepted` response and checks the notarization log for errors. It then staples
and validates the app and runs Gatekeeper assessment. The final
`dist/awsesh-desktop-darwin-arm64.zip` is created only after stapling, and removed
if signing, notarization, verification or cleanup fails. There is no ad-hoc release
fallback. Local ad-hoc verification does not prove notarization.

The existing tagged release workflow stages this ZIP alongside the CLI and SDK on
the ARM `macos-15` runner, with Rust 1.99.0. Signing secrets are bound only to the
trusted staging script step. Linux publication checks the frozen ZIP's paths,
plist and both ARM64 Mach-O headers without extracting it or rebuilding the app.
The separate ARM desktop PR CI job uses no signing secrets: it builds ad-hoc,
applies the release hardened-runtime/JIT settings, verifies signatures and minimum
OS, checks the isolated helper protocol and validates a temporary packaged ZIP.
The repository has access to all six organization secrets. A hosted run requires
these commits to be pushed and a pull request opened; production signing and
notarization remain restricted to trusted tagged staging after merging to `main`.

Manual installation and GUI testing of the notarized candidate have been confirmed
by the application owner. The tested OS version was not specified, so macOS 13
compatibility and authorized live SSO remain separate verification requirements.

## Controls

- Application shortcuts are remappable in Settings → Keyboard shortcuts. Click a
  shortcut and press its replacement; Escape cancels, Disable shortcut removes it,
  and Restore defaults resets the application bindings. Changes apply immediately
  and persist in `desktop.json`, independently of the TUI. Conflicts and reserved
  text-editing/window combinations are rejected without executing the recorded
  command. Use Command, Control or Option/Alt with a key, or a function key.
  Native menus, toolbar tooltips and the Settings labels follow the active bindings;
  standard text editing, window controls and unmodified navigation stay unchanged.
  The shortcuts below describe the defaults.
- Click, up/down or Enter to inspect an account. Double-click explicitly sets
  credentials for the selected, preferred or first available role.
- Escape dismisses a dialog; organizations remain available in the sidebar.
- Command-F to search; Command-R to refresh.
- Command-N / Command-E to create / edit an SSO session.
- Tab and Shift-Tab place the cursor at the end of session, region and profile
  fields without changing mouse cursor placement. The SSO start URL accepts an
  organization short name, previews the full `https://name.awsapps.com/start` URL,
  and expands on blur or save. Full URLs, including China-region URLs, are preserved.
- Command-O to open the selected account in AWS Console.
- Command-1 for accounts; Command-2 for credentials; Command-comma for settings.
- Command-K or Command-P opens the searchable command bar. Type to filter,
  use up/down to navigate and Enter to run a command. Escape dismisses it.
  Appearance commands select System, Light or Dark directly. Clear all active
  credentials asks for confirmation, removes every awsesh-tracked local profile
  and clears credential tracking; unrelated profiles and SSO sign-ins remain.
- The macOS window controls stay fixed above the sidebar. They integrate with its
  background when open and become a floating capsule when closed. Sidebar width
  and capsule background share Zeron's 200 ms ease-out transition, with immediate
  reversal and macOS Reduce Motion support. The native traffic lights remain native;
  application buttons toggle the sidebar, open the command bar and open Settings.
  The organization name, labeled sign-in status, session menu and refresh action
  share the same 38px top row. They move beside the fixed controls when collapsed.
  All top-row controls use 24px targets, centered 16px icons and 6px corners, with
  extra clearance after the native traffic lights.
  Command-B and View → Toggle Sidebar also show/hide the sidebar. Drag the
  empty top strip to move the window; double-click it to follow the system titlebar
  action. Double-clicking a toolbar button does not zoom the window.
  Drag the sidebar's right edge to resize it between 192px and 400px. The divider
  also accepts Tab focus and Left/Right or Home/End for keyboard resizing. Width
  and visibility are saved in `desktop.json` and restored on launch.
- Right-click organizations, accounts or credential profiles for contextual actions.
- The current organization does not reload when clicked again. Signed-out
  organizations and cached accounts are muted but remain available for inspection.
- Double-click a signed-out organization to start SSO sign-in.
- Role retrieval and credential setting run in the background without disabling
  navigation or other controls. SDK requests are ordered; stale organization
  responses cannot replace the account list you are currently viewing.
- Workspace controls have larger targets; the compact top row contains authentication
  status, refresh and a session-actions menu. Default credentials are green; named
  profiles use a distinct secondary color.
- Account names and IDs in the inspector are clickable to copy, with hover feedback
  and a “Click to copy” tooltip.
  Account rows show the most recently used CLI profile when known, including after
  expiration or credential removal. Configuring a profile alone does not mark it used.
  Rows also show remaining time for active credentials; an active default takes
  precedence when multiple profiles are active for an account.
- The inspector selects the preferred role, or the first available role when no
  preference exists. Use Set Credentials or Command-Enter without an extra role
  selection. You can still choose another role; preselection alone does not save
  a preference or set credentials.
- Region and CLI profile changes save after a 400 ms debounce, or immediately on
  blur or Enter. Edits retain their original account/role when navigating away.
  Pending or invalid changes block Set Credentials so it cannot use stale
  preferences. Failed saves leave the current input intact for correction.
- Role selection is local until Make Preferred or Set Credentials is requested.
- Credential details use the account inspector's headings, account ID placement,
  field sizing and action spacing. The selected preferred role has no extra status
  label; Make preferred remains available when choosing a different role.
- Both detail panes show an active credential's remaining time and local expiry
  without a checkmark or Default/Named profile status badge.
- Credentials show expiry countdowns, profile metadata, copy actions and confirmed removal.
- Appearance follows the system by default. Settings and the command bar offer the
  shared named themes; System/Light/Dark and theme selection are saved independently
  of the TUI in `desktop.json`. See [custom themes](../themes/README.md).
- Settings offers a 0–100% translucency slider over the selected theme, including
  the sidebar and status bar. The default is 10%, with a visible tick and pointer
  snapping within two percentage points.
  Saved amounts are preserved. Changes preview immediately and save automatically.
  Text, icons, menus and dialogs remain opaque. Clicking the track or thumb, or
  using Tab, focuses the slider; Left/Right
  adjusts it by 1% without snapping, and Home/End selects 0%/100%.
- Open theme location below the theme selector opens the shared themes directory
  and creates `theme.json.example` if absent. Rename it to a `.json` file and edit
  its colors to enable it; existing examples are never overwritten.
- Theme/role dropdowns and contextual menus have opaque backgrounds regardless of
  window translucency; filtering and selection remain keyboard-accessible.
  Search and form inputs use 44px targets, command rows are 44px, and popup-menu
  rows are 36px; native top-row buttons remain compact.
  Popup menus use compact shadows, and light-mode buttons have stronger fill contrast.
- Dither texture overlays a fixed-scale 4×4 Bayer pattern on the live, theme-tinted
  translucent background, below the controls. Native blur remains active; moving
  the window or changing what is behind it updates the backdrop normally. It does
  not load wallpaper artwork or capture the screen. This is a texture overlay,
  not color quantization of the backdrop. It is off by default; its selection is
  saved independently. Tab then Space/Enter toggles the checkbox. At 0%
  translucency the texture is hidden.
- macOS application, File, Edit and View menus expose common operations.
- Settings ends with the `awsesh --help` ASCII banner, “Open Source AWS Session
  Manager – presented by Elva” linking to https://elva-group.com, and the version;
  the sidebar keeps navigation only, without an application logo or name.

Windows and Linux use Control instead of Command. Their modifiers, technical fonts
and menu integration live in `src/platform.rs`; the workspace and SDK are shared.
These platforms have not yet been compiled or interactively verified. Their native
integration and distribution packages have dedicated follow-up passes.

### First-pass verification

The macOS release bundle was built, ad-hoc signing verified, and the shared
TypeScript checks and 209 existing tests passed. Native smoke checks used isolated
sample configuration and credential files: account navigation, Enter/role selection,
credential inspection, settings shortcuts and the dark appearance button. Browsing
left credentials and preferred-role storage unchanged; legacy appearance preferences
persisted through the helper. No live AWS authorization or credential retrieval was exercised.

The interaction pass also verified command-bar filtering and arrow/Enter execution,
organization and credential context menus, clipboard results for name/ID clicks,
preserved search when clicking the current organization, and the signed-out
double-click guard. Checks used the same isolated data; credential files were unchanged.

Background responsiveness was checked by suspending the isolated SDK helper with
a credential request in flight, then navigating accounts and opening the command
bar. A separate suspended role request verified account navigation and clipboard
actions remained usable. Double-clicking a signed-out organization opened the SSO
preparation dialog; Escape dismissed it while the helper was still suspended.
The suspended requests were never allowed to contact AWS.
An isolated region save was queued while the helper was suspended, followed by an
organization switch. After resuming the helper, the preference persisted and the
app remained on the new organization's account list.

The theme pass verified all 35 definitions in both modes, custom-theme validation,
independent desktop/TUI preferences and legacy appearance loading. Workspace
typechecks and 212 tests passed. A real TUI provider check exercised named/custom
palettes and preview/revert; the compiled desktop helper exercised ordered theme/mode
updates, persistence and invalid-input rejection without changing TUI/AWS files.
The signed macOS bundle was built and launched with isolated cached sample data;
the Rust palette transport and contrasting-foreground test also passed.

After granting macOS screenshot and Accessibility permissions, native checks verified
Nord/dark, a custom theme in both modes, GitHub/light, theme and role search filtering,
command-bar theme selection, the native Settings menu and appearance restoration
after restarting the application. The search check caught non-filtering select
delegates; both now use GPUI's built-in searchable collection. Screenshots confirmed
the selected palettes. TUI preferences, preferred roles and AWS files remained
unchanged. The isolated application and helper were closed afterward; no live AWS
authorization or credential retrieval was exercised.

The initial translucency pass was limited to the new settings: opaque/translucent toggling,
live slider adjustment, keyboard slider/texture-checkbox input, visible grain and
restoration after restart. Three focused appearance tests and the affected TypeScript
checks passed; the macOS release bundle was rebuilt. Screenshots verified theme-tinted
transparency and grain. At that point GPUI's blurred background was requested but
did not visibly blur the backdrop; the Zeron-reference pass below corrects this.

The Zeron-reference pass verified the floating toolbar on macOS 27 using isolated
sample data: sidebar/command-bar/Settings buttons, window drag, system double-click
zoom, native minimize/restore/close and fullscreen entry/exit. The capsule and Settings
also remained usable at the 960×620 minimum window size. A striped backdrop window
with large text visibly blurred behind the theme tint, while application controls
stayed sharp. Fixed-scale ordered texture, disabling/restoring translucency and
retained appearance preferences were checked. Three focused appearance tests, the
existing Rust palette test, desktop TypeScript checking and bundle signature
verification passed. AWS files, preferred roles and TUI preferences were unchanged;
no live AWS operation was exercised.

The sidebar-integration pass verified a single tint across sidebar and workspace
with 0%/10% captures, fixed traffic-light positions through the 200 ms transition,
mid-transition reversal, and sidebar/Settings-button double-clicks without zoom.
Empty-strip drag and system double-click zoom/restore, native minimize/restore,
fullscreen entry/exit, close and the 960×620 Settings layout passed on macOS 27.
Mouse adjustment selected 5%; Home selected 0%; End and Right were capped at 10%.
The rebuilt, signature-verified bundle restored the saved custom theme, mode,
10% translucency and texture after restart. Workspace typechecks, 213 existing
tests and the existing Rust palette test passed. Isolated AWS files, preferred
roles and TUI preferences were unchanged; verification processes were closed.

The unified-header pass checked the 38px top row with the sidebar open, animating
and collapsed, at 960×620 and in fullscreen. Theme/role dropdown and session-menu
fills were identical at 0% and 10% translucency while the workspace tint changed.
Search and keyboard role selection, Settings-button input, fixed traffic-light
positions, button double-click guards, empty-strip drag/zoom and native minimize
and fullscreen passed on macOS 27. The rebuilt bundle's signature, workspace
typechecks, 213 existing tests and the Rust palette test passed. Isolated AWS files,
preferred roles and TUI preferences remained unchanged; no live AWS operation ran.

The form and branding pass verified initial focus, Tab/Shift-Tab cursor placement
in session and inspector fields, preserved mouse placement, the live SSO URL preview,
blur expansion and saving a short name with Enter before blur. Screenshots checked
the circular refresh icon, navigation-only sidebar and branding-only Settings footer
at 960×620 with the sidebar open and collapsed. The rebuilt bundle's signature,
workspace typechecks, 213 existing tests and both Rust tests passed. Isolated AWS/TUI
files and inspector preferences remained unchanged; no live AWS operation ran, and
the verification application/helper were closed.

The Settings and command-bar pass verified direct System/Light/Dark commands,
the full 0–100% range, pointer snapping at 10%, keyboard 1% precision and the
default reset on macOS 27. Theme-folder opening created a valid but disabled
example without replacing an existing file. Credential-clear cancellation kept
tracking intact; confirmation removed tracked default and named profiles across
organizations while preserving an unrelated profile. The folded sidebar restored
after restart, including an immediate toggle/quit check. Taller inputs, dropdowns,
menus and command rows, popup-menu focus restoration, the linked Elva attribution,
and full/China SSO URL preservation were checked at 960×620. The rebuilt bundle's
signature, workspace typechecks, 213 existing tests and both Rust tests passed.
Isolated AWS configuration, TUI settings and account preferences stayed unchanged;
no live AWS operation ran, and the verification application/helper were closed.

The appearance and account-list refinement pass verified slider-thumb focus and
9%/10% arrow-key precision, full-range limits, sidebar mouse and keyboard resizing
from 192px to 400px, and retained width after folding. Screenshots checked removed
help/reset controls, stronger light-mode buttons, compact popup shadows and
post-dismissal account navigation. Named and default last-used profiles remained
visible after credential removal. Zeron-style wallpaper dithering was checked at
90% and 100%, in light/dark modes, with normal native blur restored when disabled.
Workspace typechecks, 213 existing Bun tests, both Rust tests and the rebuilt
bundle's signature passed. Isolated AWS/TUI files and account preferences matched
their prepared baselines; no live AWS operation ran.

The shortcut-remapping pass verified conflict and reserved-Quit rejection,
cancellation, immediate search/credential remaps, removal of old bindings and
retained text-editing shortcuts. Disabled alternatives and remaps restored after
restart alongside the saved sidebar width. Native menu key equivalents and
toolbar tooltips followed the bindings; recording/holding a key did not execute
its command before release. Tab/Shift-Tab, disabling, restoring defaults and the
960×620 Settings layout passed. Workspace typechecks, 213 existing Bun tests,
three Rust tests and the rebuilt bundle's signature passed. Isolated AWS/TUI files
and account preferences matched their baselines; no live AWS operation ran, and
the verification application/helper were closed.

The backdrop correction removed wallpaper loading and restored the dither effect
as an overlay above the live native blur and theme tint. Composited-screen captures
and pixel checks verified backdrop color changes and window movement through the
texture, unchanged opaque selector fills, opaque menus, and texture removal at 0%
without clearing its preference. Light/dark appearance, 10%/90%/100% translucency,
the 960×620 layout, restart restoration and Tab/Space/Enter toggling passed.
Workspace typechecks, 213 Bun tests, Rust tests and bundle signature
verification passed; isolated AWS/TUI files and account preferences were unchanged.
No live AWS operation ran, and the application/helper/backdrop windows were closed.

The role/default-shortcut pass verified first-role preselection, preservation of
saved preferred roles and an enabled Set Credentials button with isolated sample
data. Command-B folded the sidebar; Rust binding checks verified Command-O for
AWS Console. Typechecks, 213 Bun tests, three Rust tests, the release build and
bundle signature passed. Isolated AWS/TUI files and account preferences remained
unchanged; no live AWS operation ran, and verification processes were closed.

The inspector autosave pass verified focused debounce, immediate blur saving,
account/role switches and programmatic input resets. Suspending the isolated helper
verified that the latest queued edit wins, including a reversal to an earlier
in-flight value. Invalid profiles retained their input and blocked stale credential
actions; correction and clearing a profile saved successfully. Rust tests, 213 Bun
tests and the rebuilt bundle's signature passed. All eight isolated AWS/TUI/account
preference baselines were restored; no live AWS call ran, and processes were closed.

The expiry-display pass verified named/default account countdowns, default-profile
precedence and inactive rows in light/dark modes at full size and 960×620. Both
detail panes kept plain remaining-time/local-expiry cards, and scrolling retained
credential actions. Workspace typechecks, 213 Bun tests, three Rust tests, the
release build and bundle signature passed. Isolated AWS/TUI/account-preference
baselines were restored; no live AWS call ran, and verification processes were closed.

Setting credentials updates `~/.aws/credentials` through the SDK, including its
existing tracking and preferences. It cannot change the environment of an already
running shell. Session deletion removes the session configuration only; use sign-out
to remove its tracked credential profiles first. Sign-out clears local credentials,
not the browser's AWS session.

## Architecture

- `src/main.rs`: transient state, navigation and SDK request coordination.
- `src/ui.rs`: shared GPUI workspace, inspectors, settings and dialogs.
- `src/platform.rs`: platform shortcuts, fonts, application menus, titlebar setup
  and the macOS blur/window-drag adapter.
- `src/theme.rs`: resolved palette transport types and the GPUI rendering adapter.
- `bridge/index.ts`: allowlisted JSON-lines transport over private process pipes.
- `bridge/appearance.ts`: desktop appearance preferences and theme transport,
  independent of AWS workflows.
- `@awsesh/themes`: shared definitions, validation and color resolution.
- `@awsesh/core`'s `createWorkflow()`: session CRUD, authorization, account/role
  caching, preferences and credential lifecycle. Reusable by other clients.

The helper is long-lived so device authorization stays inside the SDK. Access
tokens, device secrets and role credentials never cross into Rust. Requests are
serialized and run off the UI thread. Closing the app terminates its helper.
The app shares the CLI/TUI's XDG configuration and data directories and `~/.aws`.
Development can select a Bun executable with `AWSESH_BUN`.

The macOS toolbar and blur integration follow the implementation references in
[DESIGN.md](DESIGN.md#macos-floating-window-toolbar). Windows/Linux retain their
existing window decorations.
