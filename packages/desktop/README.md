# Sesh for macOS

Native Rust / GPUI client for awsesh. A desktop workspace with an organization
sidebar, searchable account list, account inspector and credential management.

## Installation and support

Desktop distribution is Apple Silicon ARM64 only, targeting macOS 13 or newer.
Install the native app into `/Applications` with Homebrew:

```sh
brew install --cask elva-labs/elva/awsesh-desktop
```

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

The macOS toolbar and blur integration were inspired by
[Zeron](https://github.com/zeronsh/zeron). Windows/Linux retain their existing
window decorations.
