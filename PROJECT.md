# AWSESH - Consolidated Requirements & Status

This document consolidates all requirements, features, bugs, and status from the various markdown files in this project.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Known Bugs](#known-bugs)
3. [TODO Items](#todo-items)
4. [Core Requirements](#core-requirements)
5. [TUI Requirements](#tui-requirements)
6. [SDK Refactor Plan](#sdk-refactor-plan)
7. [Implementation Status](#implementation-status)

---

## Project Overview

AWSESH is an interactive AWS SSO session manager. This is a ground-up rewrite in TypeScript using OpenTUI and SolidJS, following the proven architectural patterns from OpenCode while maintaining all the functionality of the original Go version.

### Tech Stack

- **Runtime**: Bun 1.3.1+
- **Framework**: SolidJS 1.9.9+ (reactive state management)
- **TUI Library**: OpenTUI 0.1.46+ (@opentui/core, @opentui/solid)
- **AWS SDK**: v3 (@aws-sdk/client-sso, client-sso-oidc, client-sts)
- **TypeScript**: 5.8.2+
- **Package Manager**: Bun (exclusive)

### Project Goals

- [x] Complete TypeScript/SolidJS rewrite of awsesh
- [ ] Maintain feature parity with original Go implementation
- [x] Provide both interactive TUI and CLI modes
- [x] Make core SDK installable via npm for use in other projects
- [x] Improve performance and user experience
- [x] Support cross-platform usage (Linux, macOS, Windows, WSL)

---

## Known Bugs

### Active Bugs

1. **Cannot select text to copy**
   - Unable to select text in the TUI to copy it

1. **SSO sessions view should reload after deleting a session**
   - When deleting an SSO session, the SSO sessions view should reload to reflect the deletion. Maybe add a border around the indicator

1. **Sometimes loads system theme instead of set theme**
   - The app sometimes loads the system theme instead of the user's configured theme, theme seems to have been removed

1. **Command palette doesn't show item options until selector moves**
   - When opening the command palette directly after entering a new page (like AWS SSO sessions or accounts page), it doesn't show options for the selected list item until you move the selector at least once

1. **Accounts list doesn't update after setting CLI profile**
   - When setting a CLI profile on an account, the accounts list doesn't refresh to reflect the change

1. **Filter state preservation bug**
   - Filtering accounts, selecting one without roles, going back shows 0 results

1. **Account list not updated after setting CLI profile**
   - When setting a CLI profile on an account, the accounts list view doesn't refresh to show the updated profile name

---

## TODO Items

### UI/UX Improvements

- [x] Show active default session in layout
- [ ] Add page to see active sessions (default and profiles)
- [ ] Show version at the bottom like in opencode
- [x] Auto detect dark/light mode

### Mouse Support

- [ ] Make all interactive elements mouse clickable
- [ ] Clickable list items (profiles, accounts, roles, regions)
- [ ] Clickable buttons in dialogs (Cancel, Confirm, Delete, etc.)
- [ ] Clickable action bar items at the bottom of screens
- [ ] Clickable tabs and navigation elements
- [ ] Mouse hover states for interactive elements
- [ ] Scroll support for lists with mouse wheel
- [ ] Click to focus input fields

### Theme Updates

- [ ] Update themes to use the new accenting of opencode (in flexoki the command dialog is now orange in opencode instead of green for us in flexoki light, investigate what has changed in the theme handling)

### SDK & Distribution

- [x] Make the SDK installable from other repos through npm
- [ ] Create OpenCode plugin for AWS authorization using awsesh SDK

### Code Quality

- [ ] Look for unused and deprecated code and functionality
- [ ] Look for placeholder functionality

### Configuration

- [x] Move all configuration into the new config `~/.config/awsesh/config.json`
- [x] Keep only SSO profiles and other very AWS specific things in the `.aws/config` file
- [x] Update config migration helper

### Logging

- [ ] Implement structured logging system
- [ ] Log to file instead of stdout (avoid TUI interference)
- [ ] Configurable log levels (debug, info, warn, error)
- [ ] Log file location in XDG data directory (`~/.local/share/awsesh/logs/`)
- [ ] Log rotation and cleanup of old log files
- [ ] Include timestamps and context in log entries
- [ ] Debug mode flag to enable verbose logging
- [ ] Log AWS API calls and responses (sanitized, no secrets)

### New Features

- [ ] Have a whoami command which outputs role, session details and such
- [ ] Kill credentials command in command palette - clears all credentials from `~/.aws/credentials` file

---

## Core Requirements

### AWS SSO Management

- [x] Support multiple SSO profiles simultaneously
- [x] Add new SSO profiles via interactive form
- [x] Edit existing SSO profiles
- [x] Delete SSO profiles with confirmation dialog
- [x] List and select from available SSO profiles
- [x] Configure SSO profile settings:
  - [x] Custom alias/name for each profile
  - [x] Company name (derives portal URL)
  - [x] SSO region configuration
  - [x] Default region per profile
- [x] Open SSO dashboard directly in browser (press `o` on profile)
- [x] Remember last used SSO profile across sessions
- [ ] Support for China SSO URLs

### Authentication & Session Management

- [x] Device code flow SSO login
- [x] Automatic browser opening for SSO authentication
- [x] Manual authentication fallback with verification code display
- [ ] Automatic token refresh using cached tokens
- [ ] Token polling with timeout handling
- [ ] Session expiration tracking and display
- [x] WSL (Windows Subsystem for Linux) support
- [ ] Handle expired tokens gracefully
- [ ] Track authentication request IDs to prevent stale processing

### Account Management

- [x] List all AWS accounts accessible via SSO
- [x] Fuzzy search/filter accounts by name
- [x] Alphabetically sorted account list
- [ ] Account caching with 24-hour staleness detection
- [x] Manual account refresh (press `R` on account list)
- [ ] Remember last selected account per profile
- [x] Set account-specific custom regions (press `r` on account)
- [ ] Large account set optimization (lazy-load roles for >100 accounts)
- [x] Background refresh while showing cached data

### Role Management

- [x] List all available roles for selected account
- [x] Alphabetically sorted role list
- [x] Role selection for assumption
- [x] Remember last used role per account
- [x] Sequential role loading to avoid API rate limits
- [ ] Manual role refresh (press `r` in role view)
- [x] Automatic role fallback (last selected or AdministratorAccess)
- [ ] Handle missing roles gracefully

### Credentials Management

- [x] Obtain temporary AWS credentials via role assumption
- [x] Support multiple named profiles in credentials file

---

## TUI Requirements

### Screens

1. **Profile List Screen** - Show all configured SSO profiles or prompt to add one
2. **Profile Add/Edit Screen** - Form for creating or editing an SSO profile
3. **Delete Confirmation Dialog** - Confirm before deleting an SSO profile
4. **SSO Login Screen** - Handle SSO device authorization when token is expired
5. **Account List Screen** - Main screen for browsing and selecting AWS accounts
6. **Filter Dialog** - Filter account list by typing
7. **Region Selector Dialog** - Override default region for an account
8. **Role List Dialog** - View and select from available roles for an account
9. **Profile Name Input Dialog** - Set custom AWS profile name for account/role combination
10. **Success Screen** - Show confirmation of assumed role with credential details
11. **Settings Screen** - Configure application defaults and behavior

### Keyboard Navigation

- [x] Arrow keys for navigation
- [x] Enter to select
- [x] Esc to go back
- [x] `/` to filter/search
- [x] `q` or `Ctrl+C` to quit
- [x] `a` to add new SSO profile
- [x] `e` to edit SSO profile
- [x] `d` to delete SSO profile
- [x] `o` to open in browser
- [x] `r` to set region
- [x] `R` to refresh
- [x] `p` to set custom profile name
- [x] Configurable keybinds with leader key support
- [x] Command palette (Ctrl+P style)

### Mouse Support Requirements

- [ ] All interactive elements must be mouse clickable
- [ ] List items clickable
- [ ] Dialog buttons clickable
- [ ] Action bar items clickable
- [ ] Navigation elements clickable
- [ ] Input fields clickable to focus
- [ ] Mouse hover states for visual feedback
- [x] Mouse wheel scrolling for lists
- [x] Click outside dialog to close (where appropriate)

### UI Components

- [x] Dialog system with stack management (Confirm, Select, Prompt, Alert)
- [x] Toast notification system
- [x] Filterable list with fuzzy search (using fuzzysort)
- [x] Form components (Input, FormField, ListItem)
- [x] Spinner component for loading states
- [x] Layout components
- [x] Account selector
- [x] Region selector (dialog and inline)
- [x] Role selector
- [x] Profile name input
- [x] Settings dialog
- [x] Theme list dialog

---

## SDK Refactor Plan

### Overview

Extract core business logic into `@awsesh/core` SDK package, keeping CLI/TUI in main `awsesh` package.

### Proposed Structure

```
awsesh-rewrite/
├── packages/
│   ├── core/                        # @awsesh/core - SDK Package
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts             # Factory + exports
│   │       ├── client.ts            # AWSClient (SSO operations)
│   │       ├── config.ts            # ConfigManager (credentials file)
│   │       ├── storage.ts           # Storage (generic key-value)
│   │       ├── sessions.ts          # Sessions storage
│   │       └── types.ts             # All domain types
│   │
│   └── awsesh/                      # Main app - CLI + TUI
│       ├── package.json
│       └── src/
│           ├── index.ts             # Entry point (yargs CLI)
│           ├── global.ts            # Paths configuration
│           ├── instance.ts          # App instance (creates SDK)
│           ├── cli/
│           └── tui/
```

### SDK API

```typescript
import { createAwsesh } from "@awsesh/core";

const awsesh = createAwsesh({
  configDir: "/custom/config",
  dataDir: "/custom/data",
  awsDir: "/custom/.aws",
});

// Session management
await awsesh.sessions.list();
await awsesh.sessions.get(name);
await awsesh.sessions.save(session);
await awsesh.sessions.remove(name);

// SSO operations
await awsesh.sso.startLogin(session);
await awsesh.sso.pollForToken(session, loginInfo);
await awsesh.sso.listAccounts(session, token);
await awsesh.sso.listRoles(session, token, accountId);
await awsesh.sso.getCredentials(session, token, accountId, roleName);

// Token/account caching
await awsesh.tokens.get(sessionName);
await awsesh.tokens.save(sessionName, cache);
await awsesh.accounts.get(sessionName);
await awsesh.accounts.save(sessionName, cache);

// Credentials file
await awsesh.credentials.write(profileName, creds, region);
```

---

## Implementation Status

### Completed (Phase 1-5) ✅

- Context-based state management
- Theme system with multiple themes
- Dialog system (all variants)
- Toast notification system
- Filterable list component
- All screen components
- Routing system
- Keybind system
- TypeScript type safety
- Profile management screens
- SSO login flow UI
- Account browsing UI
- Success/confirmation screens

### Remaining Work

#### Features to Complete

- [x] Actual browser opening (placeholder in code)
- [x] Delete confirmation dialog screen
- [x] Region selector dialog screen
- [x] Profile name input dialog screen
- [x] Settings screen
- [ ] Help dialog
- [x] Command palette (Ctrl+P)

---

## CLI Commands

### Direct Session Setup

- Non-interactive mode: `awsesh <SSONAME> <ACCOUNTNAME> [ROLENAME]`
- Browser-only mode: `awsesh <SSONAME> <ACCOUNTNAME> -b`
- Custom region: `awsesh <SSONAME> <ACCOUNTNAME> -r <region>`
- Custom profile: `awsesh <SSONAME> <ACCOUNTNAME> -p <profile>`

### Shell Integration

- Eval mode: `awsesh --eval` or `awsesh -e`
- Shell functions for Bash/Zsh/Fish
- Starship prompt compatibility

### Quick Commands

- Version display: `awsesh -v` or `awsesh --version`
- Whoami command: `awsesh -w` or `awsesh --whoami`
- Last session browser: `awsesh -b`
- TUI command (interactive mode)
- Session command (CLI mode)
- Auth command
- Migrate command

---

## Configuration

### File Locations

- **Config**: `~/.config/awsesh/config.json` (XDG compliant)
- **Data**: `~/.local/share/awsesh/storage/` (XDG compliant)
- **Tokens**: `storage/token/*.json`
- **Accounts**: `storage/accounts/*.json`
- **Profiles**: `storage/profile/*.json`
- **Preferences**: `storage/preference/*.json`

### Config Format

```json
{
  "theme": "catppuccin",
  "defaultRegion": "eu-west-1",
  "autoAssumeRole": true,
  "cacheAccountDuration": 15,
  "keybinds": {
    "leader": ["ctrl+space"],
    "quit": ["ctrl+q", "<leader>q"],
    "filter": ["<leader>f"]
  }
}
```
