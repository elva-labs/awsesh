# AWSESH TUI Requirements & Design Specification

## Overview

This document outlines the complete requirements for the new AWSESH TUI (Terminal User Interface) application. The TUI will be built using OpenTUI and SolidJS, following the proven architectural patterns from the OpenCode project.

## Architecture Principles

Based on OpenCode's proven patterns:

- **SolidJS + OpenTUI**: Use SolidJS for reactive state management and OpenTUI for terminal rendering
- **Context-based architecture**: Use context providers for global state (theme, keybinds, routing, AWS state)
- **Dialog system**: Reusable dialog components for popups and confirmations
- **Route-based navigation**: Define clear routes for each screen/view
- **Configurable keybinds**: Allow users to customize keyboard shortcuts
- **Theme system**: Support multiple themes with light/dark mode detection
- **Component reusability**: Create reusable components (list views, dialogs, inputs)

## Screen Flow

```
Profile List (Initial Screen)
  ├─> Profile Add/Edit Screen
  │   └─> Back to Profile List
  │
  ├─> Delete Confirmation Dialog
  │   └─> Back to Profile List
  │
  └─> Account List Screen (after selecting profile)
      ├─> SSO Login Screen (if token expired)
      │   ├─> Opens browser automatically
      │   ├─> Shows device code
      │   ├─> Shows countdown timer
      │   └─> Auto-proceeds to Account List on success
      │
      ├─> Filter Dialog (press "/")
      │   └─> Back to Account List (press Enter)
      │
      ├─> Region Selector Dialog (press "r")
      │   └─> Back to Account List
      │
      ├─> Role List Dialog (press "R" or "l")
      │   └─> Back to Account List
      │
      ├─> Profile Name Input Dialog (press "p")
      │   └─> Back to Account List
      │
      ├─> Settings Screen (configurable keybind)
      │   └─> Back to Account List
      │
      └─> Success Screen (after selecting account)
          └─> Exit application (press "q")
```

## Detailed Screen Specifications

### 1. Profile List Screen

**Purpose**: Show all configured AWS SSO profiles or prompt to add one.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│ AWS SSO Profiles                            esc │
├─────────────────────────────────────────────────┤
│                                                 │
│  ● My Organization SSO                          │
│    https://myorg.awsapps.com/start              │
│                                                 │
│    Second Org SSO                               │
│    https://secondorg.awsapps.com/start          │
│                                                 │
├─────────────────────────────────────────────────┤
│ a Add  e Edit  d Delete  Enter Select          │
└─────────────────────────────────────────────────┘
```

**Empty State**:

```
┌─────────────────────────────────────────────────┐
│ AWS SSO Profiles                            esc │
├─────────────────────────────────────────────────┤
│                                                 │
│  No SSO profiles configured                     │
│                                                 │
│  Press 'a' to add your first profile            │
│                                                 │
├─────────────────────────────────────────────────┤
│ a Add                                           │
└─────────────────────────────────────────────────┘
```

**Features**:

- List of all configured SSO profiles
- Current selection indicated with "●"
- Empty state with helpful message
- Navigation: Arrow keys or vim keys (j/k)
- Actions:
  - `a` - Add new profile
  - `e` - Edit selected profile
  - `d` - Delete selected profile (shows confirmation dialog)
  - `Enter` - Select profile and proceed to Account List
  - `q` - Exit application
  - `?` - Show help

### 2. Profile Add/Edit Screen

**Purpose**: Form for creating or editing an SSO profile.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│ Add SSO Profile                             esc │
├─────────────────────────────────────────────────┤
│                                                 │
│  Profile Name:                                  │
│  > My Organization_                             │
│                                                 │
│  SSO Start URL:                                 │
│  > https://myorg.awsapps.com/start_             │
│                                                 │
│  SSO Region:                                    │
│  > us-east-1_                                   │
│                                                 │
│  Default Region:                                │
│  > us-east-1_                                   │
│                                                 │
├─────────────────────────────────────────────────┤
│ Tab Next Field  Enter Save  Esc Cancel         │
└─────────────────────────────────────────────────┘
```

**Features**:

- Form with four input fields
- Tab to navigate between fields
- Validation on save:
  - Profile name must be unique and non-empty
  - Start URL must be valid HTTPS URL
  - Regions must be valid AWS region codes
- Enter to save (only when all fields valid)
- Esc to cancel and return to Profile List

### 3. Delete Confirmation Dialog

**Purpose**: Confirm before deleting an SSO profile.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│           ┌─────────────────────────┐           │
│           │ Delete Profile?     esc │           │
│           ├─────────────────────────┤           │
│           │                         │           │
│           │ Are you sure you want   │           │
│           │ to delete "My Org SSO"? │           │
│           │                         │           │
│           │ This cannot be undone.  │           │
│           │                         │           │
│           │   [Cancel]  [Delete]    │           │
│           └─────────────────────────┘           │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Features**:

- Centered dialog with dark overlay background
- Shows profile name being deleted
- Warning message
- Two buttons: Cancel (default), Delete
- Navigate between buttons with arrow keys
- Enter to confirm selection
- Esc to cancel

### 4. SSO Login Screen

**Purpose**: Handle SSO device authorization when token is expired.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│ AWS SSO Login - My Organization                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  🔐 Authenticate with AWS SSO                   │
│                                                 │
│  A browser window has been opened to:           │
│  https://device.sso.us-east-1.amazonaws.com/    │
│                                                 │
│  Enter this code in the browser:                │
│                                                 │
│      ┌──────────────┐                           │
│      │  ABCD-1234   │                           │
│      └──────────────┘                           │
│                                                 │
│  Waiting for authentication...                  │
│                                                 │
│  ⏱️  Time remaining: 4:32                        │
│                                                 │
├─────────────────────────────────────────────────┤
│ Esc Cancel                                      │
└─────────────────────────────────────────────────┘
```

**Features**:

- Automatically opens browser to device authorization URL
- Displays device code prominently
- Shows countdown timer (updates every second)
- Polls AWS SSO for authorization (respects interval from API)
- On success: automatically proceeds to Account List
- On timeout: shows error and returns to Profile List
- On cancel (Esc): returns to Profile List

### 5. Account List Screen

**Purpose**: Main screen for browsing and selecting AWS accounts.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│ Accounts - My Organization              🔄 esc │
├─────────────────────────────────────────────────┤
│ Filter: _                                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  ● Production Account (123456789012)            │
│    Role: AdminRole  │  Region: us-east-1        │
│                                                 │
│    Development Account (987654321098)           │
│    Role: DevRole    │  Region: eu-west-1        │
│                                                 │
│    Staging Account (567890123456)               │
│    Role: ReadOnly   │  Region: us-west-2        │
│                                                 │
├─────────────────────────────────────────────────┤
│ / Filter  o Browser  p Profile  r Region       │
│ R Refresh  l Roles  Enter Select  q Exit        │
└─────────────────────────────────────────────────┘
```

**Features**:

- Shows list of accounts with:
  - Account name and ID
  - Currently selected/default role
  - Currently selected/default region
- Filter input at top (activated with `/`)
- Current selection indicated with "●"
- Navigation: Arrow keys or vim keys (j/k/h/l)
- Spinner (🔄) shown while loading accounts in background
- Actions:
  - `/` - Open filter (type to filter list, Enter to apply, clear with `/` + Enter)
  - `o` - Open account in AWS Console in browser
  - `p` - Set custom profile name for the account/role
  - `r` - Override region for this account
  - `R` - Refresh account list manually
  - `l` - View and select from available roles
  - `Enter` - Assume role and show success screen
  - `Esc` - Back to Profile List
  - `?` - Show help
  - `,` (configurable) - Open Settings

**Background Loading**:

- On first load: show cached accounts immediately
- Background: fetch fresh account list from AWS
- Update list seamlessly when new data arrives
- Show spinner indicator during background refresh

### 6. Filter Dialog

**Purpose**: Filter account list by typing.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│ Accounts - My Organization              🔄 esc │
├─────────────────────────────────────────────────┤
│ Filter: prod_                                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ● Production Account (123456789012)            │
│    Role: AdminRole  │  Region: us-east-1        │
│                                                 │
├─────────────────────────────────────────────────┤
│ Enter Apply  / Clear  Esc Cancel                │
└─────────────────────────────────────────────────┘
```

**Features**:

- Input field with focus
- Live filtering as you type (fuzzy search)
- Enter to apply filter and return focus to list
- `/` when filter is active clears the filter
- Esc to cancel and clear filter

### 7. Region Selector Dialog

**Purpose**: Override default region for an account.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│     ┌─────────────────────────────────┐         │
│     │ Select Region              esc  │         │
│     ├─────────────────────────────────┤         │
│     │ Search: _                       │         │
│     ├─────────────────────────────────┤         │
│     │                                 │         │
│     │  ● us-east-1  US East (N. VA)   │         │
│     │    us-east-2  US East (Ohio)    │         │
│     │    us-west-1  US West (N. CA)   │         │
│     │    us-west-2  US West (Oregon)  │         │
│     │    eu-west-1  Europe (Ireland)  │         │
│     │    eu-central-1  Europe (Frank) │         │
│     │                                 │         │
│     └─────────────────────────────────┘         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Features**:

- Centered dialog
- Search/filter input
- List of AWS regions with descriptions
- Shows current region with "●"
- Arrow keys or vim keys to navigate
- Enter to select
- Esc to cancel

### 8. Role List Dialog

**Purpose**: View and select from available roles for an account.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│     ┌─────────────────────────────────┐         │
│     │ Select Role                esc  │         │
│     ├─────────────────────────────────┤         │
│     │ Search: _                       │         │
│     ├─────────────────────────────────┤         │
│     │                                 │         │
│     │  ● AdminRole                    │         │
│     │    ReadOnlyRole                 │         │
│     │    DeveloperRole                │         │
│     │    DataScientistRole            │         │
│     │                                 │         │
│     ├─────────────────────────────────┤         │
│     │ p Set Profile  Enter Select     │         │
│     └─────────────────────────────────┘         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Features**:

- Centered dialog
- Search/filter input
- List of available roles for the account
- Shows current default role with "●"
- Arrow keys or vim keys to navigate
- Enter to select role and assume it immediately
- `p` to set custom profile for the selected role
- Esc to cancel

### 9. Profile Name Input Dialog

**Purpose**: Set custom AWS profile name for account/role combination.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│     ┌─────────────────────────────────┐         │
│     │ Set Profile Name           esc  │         │
│     ├─────────────────────────────────┤         │
│     │                                 │         │
│     │ Profile Name:                   │         │
│     │ > production_                   │         │
│     │                                 │         │
│     │ This will be used in:           │         │
│     │ • AWS_PROFILE env var           │         │
│     │ • ~/.aws/credentials            │         │
│     │                                 │         │
│     ├─────────────────────────────────┤         │
│     │ Enter Save  Esc Cancel          │         │
│     └─────────────────────────────────┘         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Features**:

- Centered dialog
- Input pre-filled with previously used profile name (if any)
- Shows helpful context about where profile name is used
- Enter to save
- Esc to cancel

### 10. Success Screen

**Purpose**: Show confirmation of assumed role with credential details.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│ ✓ Credentials Set                               │
├─────────────────────────────────────────────────┤
│                                                 │
│  Profile:    production                         │
│  SSO:        My Organization                    │
│  Account:    Production (123456789012)          │
│  Role:       AdminRole                          │
│  Region:     us-east-1                          │
│                                                 │
│  Expires:    2024-03-15 14:30:00 UTC            │
│                                                 │
│  Environment variables set:                     │
│  • AWS_PROFILE=production                       │
│  • AWS_REGION=us-east-1                         │
│  • AWS_ACCESS_KEY_ID=AKIA...                    │
│  • AWS_SECRET_ACCESS_KEY=****                   │
│  • AWS_SESSION_TOKEN=****                       │
│  • AWS_SESSION_EXPIRATION=2024-03-15T14:30:00Z  │
│                                                 │
├─────────────────────────────────────────────────┤
│ q Exit  Esc Back to Accounts                    │
└─────────────────────────────────────────────────┘
```

**Features**:

- Shows all credential information
- Displays what environment variables were set
- Actions:
  - `q` - Exit application and print summary to terminal
  - `Esc` - Return to Account List (keep credentials active)

### 11. Settings Screen

**Purpose**: Configure application defaults and behavior.

**Layout**:

```
┌─────────────────────────────────────────────────┐
│ Settings                                    esc │
├─────────────────────────────────────────────────┤
│                                                 │
│  Theme:                                         │
│  > opencode                              ▼      │
│                                                 │
│  Auto-assume role on account select:            │
│  > [X] Enabled                                  │
│                                                 │
│  Cache account list duration:                   │
│  > 15 minutes                            ▼      │
│                                                 │
│  Default region:                                │
│  > us-east-1                             ▼      │
│                                                 │
├─────────────────────────────────────────────────┤
│ Enter Edit  Esc Back                            │
└─────────────────────────────────────────────────┘
```

**Features**:

- List of configurable settings
- Navigate with arrow keys or vim keys
- Enter to edit/toggle setting
- Esc to return to previous screen
- Settings stored persistently

## Reusable Components

Following OpenCode patterns, create these reusable components:

### 1. Dialog System

**Base Dialog** (`ui/dialog.tsx`):

- Centered overlay with dark background
- Configurable size (medium, large)
- Stack-based (can have nested dialogs)
- Esc to close
- Click outside to close

**Dialog Variants**:

- `DialogConfirm` - Confirmation with Cancel/Confirm buttons
- `DialogSelect` - Searchable list selection
- `DialogPrompt` - Single input field
- `DialogAlert` - Information display

### 2. List View Component

**FilterableList** (`ui/list.tsx`):

- Generic list with filtering
- Search input
- Keyboard navigation (arrows, vim keys, page up/down)
- Mouse support
- Configurable item renderer
- Category grouping support
- Virtual scrolling for large lists

### 3. Input Components

**TextInput** (`ui/input.tsx`):

- Focused/unfocused states
- Placeholder text
- Cursor rendering
- Copy/paste support

**FormField** (`ui/form-field.tsx`):

- Label + Input combination
- Validation state
- Error messages

### 4. Status Components

**Spinner** (`ui/spinner.tsx`):

- Animated loading indicator
- Multiple variants

**Toast** (`ui/toast.tsx`):

- Temporary notifications
- Auto-dismiss
- Variants: info, success, warning, error

## Context Providers

Following OpenCode architecture:

### 1. ThemeProvider (`context/theme.tsx`)

- Manages current theme
- Light/dark mode detection
- Theme switching
- Custom theme loading
- Provides theme colors to components

### 2. RouteProvider (`context/route.tsx`)

- Manages current route/screen
- Navigation functions
- Route history
- Route data passing

### 3. KeybindProvider (`context/keybind.tsx`)

- Loads keybind configuration
- Provides keybind matching
- Allows runtime keybind changes
- Leader key support

### 4. AWSProvider (`context/aws.tsx`)

- Manages AWS state (profiles, accounts, tokens)
- Handles SSO authentication
- Account list fetching/caching
- Role credential fetching
- Token management

### 5. DialogProvider (`context/dialog.tsx`)

- Manages dialog stack
- Show/hide dialogs
- Dialog size control

### 6. ExitProvider (`context/exit.tsx`)

- Manages application exit
- Cleanup on exit
- Exit hooks

### 7. ConfigProvider (`context/config.tsx`)

- Manages user settings
- Persists configuration
- Provides config values

## Keybind Configuration

Store in `~/.config/awsesh/keybinds.json` (or XDG config location):

```json
{
  "quit": ["q", "ctrl+c"],
  "back": ["escape"],
  "help": ["?"],
  "filter": ["/"],
  "refresh": ["R"],
  "settings": [","],
  "browser_open": ["o"],
  "profile_set": ["p"],
  "region_set": ["r"],
  "role_list": ["l"],
  "profile_add": ["a"],
  "profile_edit": ["e"],
  "profile_delete": ["d"],
  "nav_up": ["up", "k"],
  "nav_down": ["down", "j"],
  "nav_left": ["left", "h"],
  "nav_right": ["right", "l"],
  "nav_page_up": ["pageup", "ctrl+u"],
  "nav_page_down": ["pagedown", "ctrl+d"],
  "select": ["enter"],
  "leader": ["space"]
}
```

## Theme System

Store themes in `~/.config/awsesh/themes/` (or XDG config location).

**Default themes to include**:

- opencode (default)
- dracula
- nord
- catppuccin
- gruvbox
- tokyo-night

Follow OpenCode's theme JSON schema.

## State Management

### Profile State

```typescript
interface ProfileState {
  profiles: SSOProfile[];
  current: string | null; // current profile name
  loading: boolean;
  error: string | null;
}
```

### Account State

```typescript
interface AccountState {
  accounts: Account[];
  loading: boolean;
  backgroundRefresh: boolean;
  lastRefresh: number;
  filter: string;
  selected: string | null; // account ID
}
```

### Auth State

```typescript
interface AuthState {
  tokens: Map<string, TokenCache>; // keyed by startUrl
  loginInProgress: SSOLoginInfo | null;
  loginTimeRemaining: number;
}
```

### Route State

```typescript
type Route =
  | { type: "profile-list" }
  | { type: "profile-form"; mode: "add" | "edit"; data?: SSOProfile }
  | { type: "account-list"; profile: string }
  | { type: "sso-login"; profile: string }
  | { type: "success"; data: SuccessData }
  | { type: "settings" };
```

## File Storage

Following XDG Base Directory specification:

**Config directory** (`~/.config/awsesh/` or `$XDG_CONFIG_HOME/awsesh/`):

- `keybinds.json` - User keybind configuration
- `settings.json` - User settings
- `themes/` - Custom themes

**Data directory** (`~/.local/share/awsesh/` or `$XDG_DATA_HOME/awsesh/`):

- `storage/profile/` - SSO profile configs
- `storage/token/` - Cached SSO tokens
- `storage/preference/` - User preferences per account/role
- `storage/account-cache/` - Cached account lists

## Error Handling

- Network errors: Show toast notification, allow retry
- Token expiration: Auto-redirect to SSO Login screen
- Invalid configuration: Show error dialog with fix suggestions
- AWS API errors: Show user-friendly error messages

## Performance Considerations

1. **Account List Loading**:
   - Show cached data immediately
   - Fetch fresh data in background
   - Update seamlessly when ready

2. **Large Account Lists**:
   - Virtual scrolling for >100 accounts
   - Efficient filtering with fuzzy search
   - Lazy-load roles on demand

3. **Token Management**:
   - Cache tokens on disk
   - Check expiration before use
   - Auto-refresh if possible

4. **Responsive UI**:
   - Target 60 FPS rendering
   - Debounce filter input
   - Efficient re-renders with SolidJS

## Accessibility

- Full keyboard navigation
- Mouse support as enhancement
- Clear visual indicators for focused elements
- High contrast color schemes
- Screen reader friendly (where possible in terminal)

## Testing Strategy

1. **Unit Tests**:
   - Context provider logic
   - Keybind matching
   - Filter/search functions
   - Route navigation

2. **Integration Tests**:
   - Full screen flows
   - Dialog interactions
   - AWS API mocking

3. **Manual Testing**:
   - Different terminal emulators
   - Different color schemes
   - Edge cases (no profiles, expired tokens, etc.)

## Migration from Old Version

The application should detect old config files and offer to migrate:

1. Detect `~/.aws/awsesh*` files
2. Show migration prompt
3. Convert INI format to JSON
4. Preserve all data (profiles, tokens, preferences)
5. Create backups of old files

## Future Enhancements

Ideas for post-MVP features:

- MCP server integration (if applicable)
- Account favorites/pinning
- Recent account history
- Multi-profile credential management
- Role chaining support
- Custom account grouping/tags
- Export/import configuration
- Cloud sync of preferences
