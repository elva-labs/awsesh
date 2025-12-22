# awsesh-rewrite Requirements

This document contains a comprehensive list of all features and requirements for the awsesh-rewrite project. It combines functionality from the original Go implementation, current rewrite status, and planned enhancements.

## Project Goals

- [ ] Complete TypeScript/SolidJS rewrite of awsesh
- [ ] Maintain feature parity with original Go implementation
- [ ] Provide both interactive TUI and CLI modes
- [ ] Make core SDK installable via npm for use in other projects
- [ ] Improve performance and user experience
- [ ] Support cross-platform usage (Linux, macOS, Windows, WSL)

---

## Core Functionality

### AWS SSO Management

- [ ] Support multiple SSO profiles simultaneously
- [ ] Add new SSO profiles via interactive form
- [ ] Edit existing SSO profiles
- [ ] Delete SSO profiles with confirmation dialog
- [ ] List and select from available SSO profiles
- [ ] Configure SSO profile settings:
  - [ ] Custom alias/name for each profile
  - [ ] Company name (derives portal URL)
  - [ ] SSO region configuration
  - [ ] Default region per profile
- [ ] Open SSO dashboard directly in browser (press `o` on profile)
- [ ] Remember last used SSO profile across sessions
- [ ] Support for China SSO URLs (`https://start.${SSO_REGION}.home.awsapps.cn/directory/${COMPANY_NAME}#/`)

### Authentication & Session Management

- [ ] Device code flow SSO login
- [ ] Automatic browser opening for SSO authentication
- [ ] Manual authentication fallback with verification code display
- [ ] Token caching with 8-hour expiration
- [ ] Automatic token refresh using cached tokens
- [ ] Token polling with timeout handling
- [ ] Session expiration tracking and display
- [ ] WSL (Windows Subsystem for Linux) support
- [ ] Handle expired tokens gracefully
- [ ] Track authentication request IDs to prevent stale processing

### Account Management

- [ ] List all AWS accounts accessible via SSO
- [ ] Fuzzy search/filter accounts by name
- [ ] Alphabetically sorted account list
- [ ] Account caching with 24-hour staleness detection
- [ ] Manual account refresh (press `R` on account list)
- [ ] Remember last selected account per profile
- [ ] Set account-specific custom regions (press `r` on account)
- [ ] Large account set optimization (lazy-load roles for >100 accounts)
- [ ] Background refresh while showing cached data

### Role Management

- [ ] List all available roles for selected account
- [ ] Alphabetically sorted role list
- [ ] Role selection for assumption
- [ ] Remember last used role per account
- [ ] Sequential role loading to avoid API rate limits
- [ ] Manual role refresh (press `r` in role view)
- [ ] Automatic role fallback (last selected or AdministratorAccess)
- [ ] Handle missing roles gracefully

### Credentials Management

- [ ] Obtain temporary AWS credentials via role assumption
- [ ] Write credentials to `~/.aws/credentials` file
- [ ] Support multiple named profiles in credentials file
- [ ] Custom profile names:
  - [ ] Press `p` in role view to set custom profile name
  - [ ] Remember profile name per account+role combination
  - [ ] Pre-fill with previously used profile name
- [ ] Export AWS environment variables in shell:
  - [ ] `AWS_PROFILE`
  - [ ] `AWS_REGION`
  - [ ] `AWS_ACCESS_KEY_ID`
  - [ ] `AWS_SECRET_ACCESS_KEY`
  - [ ] `AWS_SESSION_TOKEN`
  - [ ] `AWS_SESSION_EXPIRATION`
- [ ] Include session expiration timestamp in credentials
- [ ] Configurable session duration per SSO profile
- [ ] Flush/clear active credentials functionality

---

## User Interface (TUI)

### Interactive TUI Features

- [ ] Multiple screens/states:
  - [ ] SSO Profile Selection
  - [ ] Account Selection
  - [ ] Role Selection
  - [ ] Session Success Summary
  - [ ] Add/Edit SSO Profile Forms
  - [ ] Delete Confirmation Dialog
  - [ ] Region Setting Dialog
  - [ ] Profile Name Setting Dialog
  - [ ] Settings Dialog
  - [ ] Active Sessions View
- [ ] Dynamic theming (adapts to terminal background)
- [ ] Auto-detect dark/light mode
- [ ] Show active default session in layout
- [ ] Show version at bottom (like opencode)
- [ ] Loading indicators with spinner animations
- [ ] Error display with styled error boxes
- [ ] Success confirmation with session details
- [ ] Context-sensitive help text in each view
- [ ] Verification code display with copy hint
- [ ] Pagination for long lists
- [ ] Responsive layout adapting to terminal size

### Keyboard Navigation

- [ ] Arrow keys for navigation
- [ ] Enter to select
- [ ] Esc to go back
- [ ] `/` to filter/search
- [ ] `q` or `Ctrl+C` to quit
- [ ] `a` to add new SSO profile
- [ ] `e` to edit SSO profile
- [ ] `d` to delete SSO profile
- [ ] `o` to open in browser
- [ ] `r` to set region
- [ ] `R` to refresh
- [ ] `p` to set custom profile name
- [ ] `w` for whoami command
- [ ] Configurable keybinds with leader key support
- [ ] Command palette (Ctrl+P style)

### Visual Styling

- [ ] Title boxes with borders
- [ ] Error boxes (red borders)
- [ ] Success boxes (green borders)
- [ ] Verification/code boxes (blue borders)
- [ ] Muted text for secondary info
- [ ] Primary/secondary color highlighting
- [ ] 29+ available themes (opencode, dracula, nord, catppuccin, gruvbox, tokyonight, flexoki, etc.)
- [ ] Theme switching and persistence
- [ ] Fix flexoki command dialog color issue
- [ ] Update themes to use new accenting pattern from opencode

### UI Components

- [ ] Dialog system with stack management:
  - [ ] Confirm dialog
  - [ ] Select dialog
  - [ ] Prompt dialog
  - [ ] Alert dialog
- [ ] Toast notification system
- [ ] Filterable list with fuzzy search (using fuzzysort)
- [ ] Form components (Input, FormField, ListItem)
- [ ] Spinner component for loading states
- [ ] Layout components
- [ ] Account selector
- [ ] Region selector (dialog and inline)
- [ ] Role selector
- [ ] Profile name input
- [ ] Settings dialog
- [ ] Theme list dialog

---

## Command-Line Interface (CLI)

### Direct Session Setup

- [ ] Non-interactive mode: `awsesh <SSONAME> <ACCOUNTNAME> [ROLENAME]`
- [ ] Role auto-selection (uses last selected if not specified)
- [ ] Browser-only mode: `awsesh <SSONAME> <ACCOUNTNAME> -b`
- [ ] Custom region: `awsesh <SSONAME> <ACCOUNTNAME> -r <region>`
- [ ] Custom profile: `awsesh <SSONAME> <ACCOUNTNAME> -p <profile>`

### Shell Integration

- [ ] Eval mode: `awsesh --eval` or `awsesh -e`
- [ ] Shell functions for Bash/Zsh/Fish
- [ ] Starship prompt compatibility (AWS module support)
- [ ] Environment variable export functionality

### Quick Commands

- [ ] Version display: `awsesh -v` or `awsesh --version`
- [ ] Whoami command: `awsesh -w` or `awsesh --whoami` with detailed session info
  - [ ] Show current role
  - [ ] Show session details
  - [ ] Show expiration time
- [ ] Last session browser: `awsesh -b`
- [ ] TUI command (interactive mode)
- [ ] Session command (CLI mode)
- [ ] Auth command
- [ ] Migrate command

---

## Configuration & Persistence

### Configuration Files

- [ ] Config file location: `~/.config/awsesh/` (XDG compliant)
- [ ] Data file location: `~/.local/share/awsesh/storage/` (XDG compliant)
- [ ] Tokens cache: `token/*.json`
- [ ] Accounts cache: `accounts/*.json`
- [ ] Profiles: `profile/*.json`
- [ ] Preferences: `preference/*.json`
- [ ] Respect `AWS_CONFIG_FILE` environment variable
- [ ] Respect `AWS_SHARED_CREDENTIALS_FILE` environment variable
- [ ] Respect `XDG_CONFIG_HOME` environment variable
- [ ] Respect `XDG_DATA_HOME` environment variable
- [ ] AWS Config integration (read SSO profiles from `~/.aws/config`)

### Persistent Settings

- [ ] Last used SSO profile (global)
- [ ] Last used account per SSO profile
- [ ] Last used role per SSO profile + account
- [ ] Account regions per SSO profile + account
- [ ] Custom profile names per SSO profile + account + role
- [ ] SSO token cache with expiration time
- [ ] Account list cache with timestamp and staleness detection
- [ ] Theme preference
- [ ] Keybind configuration

### Storage System

- [ ] JSON-based storage with file locking
- [ ] Migration from old INI-based config files:
  - [ ] Automatic detection of old config
  - [ ] Interactive migration prompt
  - [ ] Manual migration command with dry-run support
  - [ ] Backup creation of old files
  - [ ] Migrate profiles, tokens, accounts, preferences
- [ ] Improved config migration helper
- [ ] AWS credentials file writing (INI format)
- [ ] Concurrency-safe file operations

---

## AWS Console Integration

### Browser Opening

- [ ] Open SSO dashboard (press `o` on SSO profile)
- [ ] Open account in console (press `o` on account)
- [ ] Open role in console (press `o` on role)
- [ ] Direct browser mode: `awsesh <SSO> <ACCOUNT> -b`
- [ ] Generate properly formatted AWS console URLs with account/role
- [ ] Cross-platform browser support:
  - [ ] macOS: `open`
  - [ ] Linux: `xdg-open`, `sensible-browser`
  - [ ] Windows: `rundll32`
  - [ ] WSL: `cmd.exe /c start`

---

## Performance & Optimization

### Caching Strategy

- [ ] Token cache with 8-hour lifetime
- [ ] Account cache with 24-hour staleness marker
- [ ] Role cache preserved during account refresh
- [ ] Lazy role loading (only when account selected if >100 accounts)
- [ ] Sequential role loading to avoid API rate limits
- [ ] Background refresh showing old data while loading

### Rate Limiting Protection

- [ ] AWS SDK retry strategy (up to 10 attempts)
- [ ] Sequential loading to prevent parallel API calls
- [ ] Account threshold (disable auto role loading when >100 accounts)
- [ ] Graceful handling of throttling errors

---

## Error Handling & Resilience

- [ ] API error handling with user-friendly messages
- [ ] Token expiration detection and handling
- [ ] Authentication timeout handling
- [ ] Rate limit error handling with retries
- [ ] Missing role handling with fallback
- [ ] Network error recovery with clear messages
- [ ] Invalid profile detection and validation
- [ ] Request ID tracking to prevent stale processing
- [ ] Dead token recovery without losing last selected role
- [ ] Filter state preservation (fix bug: filtering accounts, selecting one without roles, going back shows 0 results)

---

## Developer Features

### Build & Distribution

- [ ] Bun build system
- [ ] TypeScript compilation with strict mode
- [ ] Version injection via build flags
- [ ] Cross-platform support:
  - [ ] Linux (x86_64, ARM64)
  - [ ] macOS (Intel, Apple Silicon)
  - [ ] Windows (x86_64)
  - [ ] Windows Subsystem for Linux (WSL)
- [ ] Homebrew formula for macOS installation
- [ ] GitHub Actions CI/CD:
  - [ ] Automated builds
  - [ ] Release automation
  - [ ] Homebrew tap updates
- [ ] Installation scripts (automated install/uninstall)
- [ ] Binary distribution

### SDK & NPM Distribution

- [ ] Make core SDK installable via npm
- [ ] Allow use in other projects/repos
- [ ] Provide TypeScript types
- [ ] Documentation for SDK usage
- [ ] Create OpenCode plugin for AWS authorization using awsesh SDK
- [ ] Separate core functionality from CLI/TUI

### Documentation

- [ ] Comprehensive README with usage guide
- [ ] Feature requirements tracking (this document)
- [ ] Pull request template
- [ ] Agent guidelines (AGENTS.md)
- [ ] Migration guide from Go version
- [ ] Shell integration examples
- [ ] Demo GIFs or screenshots

### Code Quality

- [ ] TypeScript strict mode (passing typecheck)
- [ ] Follow AGENTS.md style guidelines:
  - [ ] Use `bun` exclusively
  - [ ] Named imports
  - [ ] PascalCase for components
  - [ ] camelCase for functions/variables
  - [ ] Single-word names preferred
  - [ ] Avoid destructuring
  - [ ] Prefer const over let
  - [ ] Avoid else statements
  - [ ] Avoid try/catch where possible
  - [ ] Avoid any type
  - [ ] Use Bun APIs
  - [ ] No inline comments unless requested
- [ ] Remove unused and deprecated code
- [ ] Remove placeholder functionality
- [ ] Comprehensive test coverage
- [ ] Automated testing in CI/CD

---

## Platform Support

### Operating Systems

- [ ] Linux (x86_64, ARM64)
- [ ] macOS (Intel, Apple Silicon)
- [ ] Windows (x86_64)
- [ ] Windows Subsystem for Linux (WSL)

### Shell Support

- [ ] Bash
- [ ] Zsh
- [ ] Fish
- [ ] PowerShell (Windows)

---

## Technical Architecture

### Tech Stack

- [ ] Runtime: Bun 1.3.1+
- [ ] Framework: SolidJS 1.9.9+ (reactive state management)
- [ ] TUI Library: OpenTUI 0.1.46+ (@opentui/core, @opentui/solid)
- [ ] AWS SDK: v3 (@aws-sdk/client-sso, client-sso-oidc, client-sts)
- [ ] TypeScript 5.8.2+
- [ ] Package Manager: Bun (exclusive)

### Architecture Patterns

- [ ] Context-based state management with `createSimpleContext` helper
- [ ] Provider stacking pattern (Exit → KV → Config → Route → Theme → Keybind → Dialog → Toast → Command → AWS)
- [ ] Dialog static methods (`.show()` pattern for promises)
- [ ] Type-safe routing with union types
- [ ] Modular component architecture
- [ ] Clean separation of concerns

### Context Providers

- [ ] Exit context
- [ ] KV (key-value storage) context
- [ ] Config context
- [ ] Route context with 8+ route types
- [ ] Theme context with 29+ themes
- [ ] Keybind context
- [ ] Dialog context with stack management
- [ ] Toast context
- [ ] Command context (command palette)

---

## Future Enhancements

- [ ] Enhanced `--env` flag functionality
- [ ] Additional profile support features
- [ ] Session management improvements
- [ ] Multi-region session support
- [ ] Integration with other AWS tools
- [ ] Advanced filtering and search capabilities
- [ ] Export session history
- [ ] Session analytics and usage tracking

---

## Testing Requirements

- [ ] Unit tests for core functionality
- [ ] Integration tests for AWS operations
- [ ] E2E tests for TUI workflows
- [ ] CLI command tests
- [ ] Migration tests
- [ ] Storage and caching tests
- [ ] Error handling tests
- [ ] Cross-platform compatibility tests

---

## Documentation Requirements

- [ ] README with quick start guide
- [ ] Installation instructions for all platforms
- [ ] Usage examples (TUI and CLI)
- [ ] Shell integration guide
- [ ] Migration guide from Go version
- [ ] SDK usage documentation for npm package
- [ ] Configuration reference
- [ ] Troubleshooting guide
- [ ] Contributing guidelines
- [ ] Changelog

---

## Completion Criteria

- [ ] All core functionality implemented
- [ ] Feature parity with original Go implementation
- [ ] All tests passing
- [ ] Type checking passing (strict mode)
- [ ] Documentation complete
- [ ] Cross-platform builds working
- [ ] Homebrew formula tested
- [ ] NPM package published
- [ ] Migration from Go version tested
- [ ] Performance optimizations complete
- [ ] All critical bugs fixed
- [ ] Code quality guidelines followed
