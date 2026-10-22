# Sesh desktop client

Native Rust / GPUI client for awsesh. A desktop workspace with an organization
sidebar, searchable account list, account inspector and credential management.

## Installation and support

| Platform | Target | Distribution |
|---|---|---|
| macOS | Apple Silicon ARM64, macOS 13+ | Homebrew cask `elva-labs/elva/awsesh-desktop` |
| Windows | Windows 11 x64 | Scoop package `elva/awsesh-desktop` or unsigned portable ZIP from Releases |

Install the macOS app into `/Applications`:

```sh
brew install --cask elva-labs/elva/awsesh-desktop
```

Install the Windows app with [Scoop](https://scoop.sh):

```powershell
scoop bucket add elva https://github.com/elva-labs/scoop-elva
scoop install elva/awsesh-desktop
```

Alternatively, download `awsesh-desktop-win32-x64.zip` from the
[latest release](https://github.com/elva-labs/awsesh/releases/latest), extract
it, and run `Sesh\sesh.exe`. See
[Windows package](#windows-package).

## Development

Requires Rust 1.99.0 and Bun 1.4.4. From the repository root:

```sh
bun install
bun run dev:desktop
```

Platform prerequisites:

- macOS: Apple Silicon Mac and Xcode.
- Windows: Windows 11 x64, Visual Studio Build Tools 2022 with the "Desktop
  development with C++" workload (MSVC and the Windows SDK).

`dev:desktop` runs a debug build. On Windows the debug build keeps a console
window for diagnostics; release builds do not.

## Build

```sh
bun run build:desktop
```

`script/build.ts` dispatches on the host. Both targets compile the native
executable and a standalone Bun SDK helper, and neither requires Bun, Node,
Rust, the CLI or this checkout at runtime.

### macOS

Produces `packages/desktop/dist/Sesh.app`. The build targets ARM64 with a macOS
13.0 deployment target and is ad-hoc signed for local use. Stable and beta
release versions are preserved in Rust Settings and the `AWSESHReleaseVersion`
bundle field; Apple's short version uses the numeric base. CI uses its positive
`GITHUB_RUN_NUMBER` as the bundle build version; local builds use the numeric
base. GPUI compiles its embedded Metal shaders at runtime, so no separate Metal
compiler is required.

### Windows

Produces `packages/desktop/dist/awsesh-desktop-win32-x64.zip`. See
[Windows package](#windows-package).

## Windows package

Releases attach this ZIP as a release asset. The Scoop manifest (package
`awsesh-desktop`) is maintained in
[elva-labs/scoop-elva](https://github.com/elva-labs/scoop-elva). The ZIP extracts to:

```text
Sesh/
  sesh.exe
  awsesh-sdk.exe
  awsesh-sdk-linux-x64
  LICENSE
```

Run `sesh\sesh.exe`. The helper is discovered relative to the executable, so the
package works from any directory, including paths with spaces or non-ASCII
characters.

Build properties:

- Static CRT. The package imports no `vcruntime140.dll` or `msvcp140.dll` and
  needs no Visual C++ Redistributable.
- GPUI's embedded manifest declares `PerMonitorV2` DPI awareness, so the window
  is crisp at 150% and 200% scaling. It requests `asInvoker`, so no elevation.
- The executable carries the Sesh icon (resource ID 1), product metadata
  (`ProductName`, `CompanyName`, `FileDescription`) and `AWSESHReleaseVersion`.
- Version is `MAJOR.MINOR.PATCH`; the full release string, including any
  `-beta.N`, is preserved in the string metadata and application Settings.

The package is unsigned. Windows SmartScreen may warn on first launch. Signing
is not part of this build.

### WSL workspace

On Windows, Settings > Integration > **Use WSL workspace** makes the native
desktop app use the same AWS workspace as the CLI/TUI in the default WSL distro,
under its default user. This is shared storage, not copying or synchronizing two
sets of files:

- SSO session definitions: Linux `~/.config/awsesh/sessions/`.
- SSO tokens, account/role caches, preferences, last selections and credential
  tracking: Linux `~/.local/share/awsesh/storage/`.
- AWS credentials: Linux `~/.aws/credentials`.

The packaged Windows helper launches the bundled Linux helper through `wsl.exe`;
all AWS workflow operations run inside Linux. No Bun, Node or awsesh installation
is required in WSL. An x64 glibc distribution such as Ubuntu is required. The
helper runs through `sh -lc`, so the Linux login environment's `XDG_CONFIG_HOME`
and `XDG_DATA_HOME` overrides apply. Exports only made in an interactive shell
are not necessarily available to the helper.

Desktop appearance, shortcuts, themes and window geometry stay on Windows. The
workspace selector is stored separately in Windows
`~/.config/awsesh/workspace.json` (or under `XDG_CONFIG_HOME`):

```json
{ "useWslWorkspace": true }
```

Switching waits until the app is idle, starts and checks the new helper, then
reloads its workspace. Failed switches leave the previous workspace selected.
If an already-selected WSL workspace cannot start, AWS operations fail rather
than silently using Windows data; Settings remains available to switch back.
Windows and WSL data are not automatically migrated or merged. The earlier
credential-only `useWslCredentials` setting is not promoted to a full workspace
selection; enable the new toggle explicitly.

The desktop refreshes its snapshot every 30 seconds; Refresh can show CLI/TUI
changes sooner. This does not add cross-process locking to the existing storage
format, so simultaneous writes from multiple clients still have the existing
read-modify-write race limitation.

For development, build the bundled Linux helper with `bun run build:desktop`
before enabling WSL mode in `dev:desktop`.

## Architecture

- `src/main.rs`: transient state, navigation and SDK request coordination.
- `src/ui.rs`: shared GPUI workspace, inspectors, settings and dialogs.
- `src/platform.rs`: platform shortcuts, fonts, application menus, titlebar
  setup and the macOS blur/window-drag adapter.
- `src/theme.rs`: resolved palette transport types and the GPUI rendering adapter.
- `src/sdk.rs`: helper discovery and the private JSON-lines transport.
- `build.rs`: Windows icon and VERSIONINFO resources.
- `bridge/index.ts`: allowlisted JSON-lines transport over private process pipes.
- `bridge/appearance.ts`: desktop appearance preferences and theme transport,
  independent of AWS workflows.
- `script/`: host dispatcher, per-platform packaging, helper protocol
  verification, package validation and the Scoop manifest generator.
- `@awsesh/themes`: shared definitions, validation and color resolution.
- `@awsesh/core`'s `createWorkflow()`: session CRUD, authorization, account/role
  caching, preferences and credential lifecycle. Reusable by other clients.

The helper is long-lived so device authorization stays inside the SDK. Access
tokens, device secrets and role credentials never cross into Rust. Requests are
serialized and run off the UI thread. Closing the app terminates its helper; on
Windows the helper also exits if the parent is killed, because its standard input
closes. The app shares the CLI/TUI's XDG configuration and data directories and
`~/.aws`. Development can select a Bun executable with `AWSESH_BUN`.

The macOS toolbar and blur integration were inspired by
[Zeron](https://github.com/zeronsh/zeron). Windows uses GPUI's native window
decorations and acrylic translucency.

## Limitations

- The Windows client does not read the OS reduce-motion preference, so the
  sidebar animation always runs.
- AWS path overrides (`AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`,
  `AWS_PROFILE`) are not honored; the helper always uses `~/.aws`, matching macOS.
