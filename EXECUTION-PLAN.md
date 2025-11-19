# AWSESH TUI - Execution Plan

## Overview

This document outlines the step-by-step execution plan for building the new AWSESH TUI, following the patterns established in OpenCode. The plan is organized into phases that can be executed sequentially, with each phase building on the previous one.

## Key Patterns from OpenCode to Follow

### 1. Project Structure
```
src/
  cli/
    cmd/
      tui/
        component/      # Reusable UI components
        context/        # Context providers (state management)
        routes/         # Screen/route components
        ui/             # Base UI components (dialog, toast, etc.)
        util/           # Utility functions
        app.tsx         # Main app component
        thread.ts       # TUI entry point
```

### 2. Context Provider Pattern

Use `createSimpleContext` helper:
```typescript
export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: (props) => {
    // Context logic here
    return {
      theme: ...,
      setTheme: ...,
    }
  }
})
```

Stack providers in app.tsx from outermost to innermost:
```typescript
<ExitProvider onExit={onExit}>
  <KVProvider>           // Key-value persistent storage
    <ConfigProvider>      // User settings
      <RouteProvider>     // Navigation
        <ThemeProvider>   // Theme system
          <KeybindProvider> // Keybinds
            <DialogProvider> // Dialog management
              <AWSProvider>  // AWS-specific state
                <App />
              </AWSProvider>
            </DialogProvider>
          </KeybindProvider>
        </ThemeProvider>
      </RouteProvider>
    </ConfigProvider>
  </KVProvider>
</ExitProvider>
```

### 3. Dialog Pattern

```typescript
// Define dialog component
function MyDialog(props: { onConfirm: () => void }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  
  useKeyboard((evt) => {
    if (evt.name === "return") {
      props.onConfirm()
      dialog.clear()
    }
  })
  
  return <box>...</box>
}

// Use dialog - static method pattern
MyDialog.show = (dialog: DialogContext, ...args) => {
  return new Promise<ReturnType>((resolve) => {
    dialog.replace(
      () => <MyDialog onConfirm={() => resolve(true)} />,
      () => resolve(false)
    )
  })
}

// Usage in component
const dialog = useDialog()
const result = await MyDialog.show(dialog, arg1, arg2)
```

### 4. Route Pattern

```typescript
// Define routes
export type Route =
  | { type: "profile-list" }
  | { type: "account-list", profile: string }
  | { type: "sso-login", profile: string, loginInfo: SSOLoginInfo }
  // ... other routes

// Navigate
const route = useRoute()
route.navigate({ type: "account-list", profile: "my-org" })

// Render based on route
<Switch>
  <Match when={route.data.type === "profile-list"}>
    <ProfileListScreen />
  </Match>
  <Match when={route.data.type === "account-list"}>
    <AccountListScreen />
  </Match>
</Switch>
```

### 5. Keybind Pattern

```typescript
// In component
const keybind = useKeybind()

useKeyboard((evt) => {
  if (keybind.match("filter", evt)) {
    // Handle filter keybind
  }
})

// Global keybinds via command system
command.register(() => [
  {
    title: "Open Settings",
    value: "settings.open",
    keybind: "settings_open",
    category: "Settings",
    onSelect: () => {
      route.navigate({ type: "settings" })
    }
  }
])
```

### 6. Theme Pattern

```typescript
const { theme } = useTheme()

// Use theme colors
<box backgroundColor={theme.background}>
  <text fg={theme.text}>Hello</text>
  <text fg={theme.textMuted}>Muted text</text>
</box>
```

## Phase 1: Foundation & Infrastructure

### 1.1 Setup Base Structure

**Goal**: Create the foundational file structure and helper utilities.

**Tasks**:
- [ ] Create directory structure matching OpenCode pattern
- [ ] Create `context/helper.tsx` with `createSimpleContext` utility
- [ ] Set up base TypeScript types in `types/` (keep existing, add route types)
- [ ] Create `util/` directory with common utilities

**Files to Create**:
```
src/cli/cmd/tui/
  context/
    helper.tsx          # createSimpleContext utility
  util/
    keybind.ts          # Keybind parsing and matching
    locale.ts           # String formatting utilities
  types.ts              # Type definitions for routes
```

**Estimated Time**: 2 hours

### 1.2 Context Providers - Core

**Goal**: Implement essential context providers.

**Tasks**:
- [ ] Implement `ExitProvider` (context/exit.tsx)
- [ ] Implement `KVProvider` for persistent storage (context/kv.tsx)
- [ ] Implement `RouteProvider` (context/route.tsx)
- [ ] Implement `ThemeProvider` (context/theme.tsx)
- [ ] Implement `KeybindProvider` (context/keybind.tsx)
- [ ] Implement `ConfigProvider` (context/config.tsx)

**Route Types**:
```typescript
export type Route =
  | { type: "profile-list" }
  | { type: "profile-form", mode: "add" | "edit", profile?: SSOProfile }
  | { type: "account-list", profile: string }
  | { type: "sso-login", profile: string, loginInfo: SSOLoginInfo }
  | { type: "success", credentials: CredentialInfo }
  | { type: "settings" }
```

**Config Structure**:
```typescript
interface AppConfig {
  theme: string
  autoAssumeRole: boolean
  cacheAccountDuration: number  // minutes
  defaultRegion: string
  keybinds: KeybindsConfig
}
```

**Files to Create**:
```
src/cli/cmd/tui/
  context/
    exit.tsx
    kv.tsx
    route.tsx
    theme.tsx
    keybind.tsx
    config.tsx
```

**Estimated Time**: 6 hours

### 1.3 Theme System

**Goal**: Implement complete theme system with multiple themes.

**Tasks**:
- [ ] Create theme type definitions
- [ ] Port default themes from OpenCode (opencode, dracula, nord, catppuccin, gruvbox)
- [ ] Implement theme loading from config directory
- [ ] Implement light/dark mode detection
- [ ] Implement theme switching

**Files to Create**:
```
src/cli/cmd/tui/
  context/
    theme/
      opencode.json
      dracula.json
      nord.json
      catppuccin.json
      gruvbox.json
```

**Estimated Time**: 4 hours

### 1.4 AWS Context Provider

**Goal**: Centralize all AWS-related state management.

**Tasks**:
- [ ] Implement `AWSProvider` (context/aws.tsx)
- [ ] Profile management (load, save, delete)
- [ ] Token management (load, save, check expiration)
- [ ] Account caching (load, save with TTL)
- [ ] SSO authentication flow
- [ ] Account list fetching (with background refresh)
- [ ] Role credential fetching

**State Structure**:
```typescript
interface AWSState {
  profiles: {
    list: SSOProfile[]
    current: string | null
    loading: boolean
    error: string | null
  }
  tokens: Map<string, TokenCache>
  accounts: {
    data: Account[]
    loading: boolean
    backgroundRefresh: boolean
    lastRefresh: number
  }
  auth: {
    loginInProgress: SSOLoginInfo | null
    timeRemaining: number
  }
}
```

**Files to Create**:
```
src/cli/cmd/tui/
  context/
    aws.tsx
```

**Estimated Time**: 8 hours

## Phase 2: UI Components & Dialog System

### 2.1 Base Dialog System

**Goal**: Implement the foundational dialog system.

**Tasks**:
- [ ] Implement `DialogProvider` (ui/dialog.tsx)
- [ ] Implement base `Dialog` component with overlay
- [ ] Implement dialog stack management
- [ ] Implement click-outside-to-close
- [ ] Implement ESC-to-close

**Files to Create**:
```
src/cli/cmd/tui/
  ui/
    dialog.tsx
```

**Pattern Reference**: `/Users/alvinjohansson/code/elva/tui/opencode/packages/opencode/src/cli/cmd/tui/ui/dialog.tsx`

**Estimated Time**: 3 hours

### 2.2 Dialog Variants

**Goal**: Create reusable dialog components.

**Tasks**:
- [ ] Implement `DialogConfirm` (ui/dialog-confirm.tsx)
- [ ] Implement `DialogSelect` (ui/dialog-select.tsx)
- [ ] Implement `DialogPrompt` (ui/dialog-prompt.tsx)
- [ ] Implement `DialogAlert` (ui/dialog-alert.tsx)

**Files to Create**:
```
src/cli/cmd/tui/
  ui/
    dialog-confirm.tsx
    dialog-select.tsx
    dialog-prompt.tsx
    dialog-alert.tsx
```

**Pattern References**:
- DialogConfirm: `/Users/alvinjohansson/code/elva/tui/opencode/packages/opencode/src/cli/cmd/tui/ui/dialog-confirm.tsx`
- DialogSelect: `/Users/alvinjohansson/code/elva/tui/opencode/packages/opencode/src/cli/cmd/tui/ui/dialog-select.tsx`

**Estimated Time**: 6 hours

### 2.3 Reusable UI Components

**Goal**: Build common UI components used across the app.

**Tasks**:
- [ ] Implement `Toast` system (ui/toast.tsx)
- [ ] Implement `Spinner` component (ui/spinner.tsx)
- [ ] Implement `Input` component (ui/input.tsx)
- [ ] Implement `FormField` component (ui/form-field.tsx)
- [ ] Implement `ListItem` component (ui/list-item.tsx)

**Files to Create**:
```
src/cli/cmd/tui/
  ui/
    toast.tsx
    spinner.tsx
    input.tsx
    form-field.tsx
    list-item.tsx
```

**Estimated Time**: 5 hours

### 2.4 Filterable List Component

**Goal**: Create a powerful, reusable filterable list component.

**Tasks**:
- [ ] Implement `FilterableList` component (ui/filterable-list.tsx)
- [ ] Add fuzzy search support (use fuzzysort like OpenCode)
- [ ] Add keyboard navigation (arrows, vim keys, page up/down)
- [ ] Add mouse support
- [ ] Add category grouping
- [ ] Add virtual scrolling for performance

**Files to Create**:
```
src/cli/cmd/tui/
  ui/
    filterable-list.tsx
```

**Pattern Reference**: `/Users/alvinjohansson/code/elva/tui/opencode/packages/opencode/src/cli/cmd/tui/ui/dialog-select.tsx`

**Estimated Time**: 6 hours

## Phase 3: Screen Components (Routes)

### 3.1 Profile List Screen

**Goal**: First screen showing all SSO profiles.

**Tasks**:
- [ ] Implement `ProfileListScreen` component (routes/profile-list.tsx)
- [ ] Show list of profiles or empty state
- [ ] Handle profile selection
- [ ] Handle add/edit/delete actions
- [ ] Implement keybinds (a, e, d, enter, q)

**Files to Create**:
```
src/cli/cmd/tui/
  routes/
    profile-list.tsx
```

**Estimated Time**: 4 hours

### 3.2 Profile Form Screen

**Goal**: Add/Edit SSO profile form.

**Tasks**:
- [ ] Implement `ProfileFormScreen` component (routes/profile-form.tsx)
- [ ] Create form with 4 fields (name, startUrl, ssoRegion, defaultRegion)
- [ ] Implement tab navigation between fields
- [ ] Add validation
- [ ] Handle save/cancel

**Files to Create**:
```
src/cli/cmd/tui/
  routes/
    profile-form.tsx
```

**Estimated Time**: 5 hours

### 3.3 SSO Login Screen

**Goal**: Handle device authorization flow.

**Tasks**:
- [ ] Implement `SSOLoginScreen` component (routes/sso-login.tsx)
- [ ] Display device code prominently
- [ ] Show countdown timer (update every second)
- [ ] Open browser automatically
- [ ] Poll for authorization
- [ ] Handle success/timeout/cancel
- [ ] Auto-navigate to Account List on success

**Files to Create**:
```
src/cli/cmd/tui/
  routes/
    sso-login.tsx
```

**Estimated Time**: 6 hours

### 3.4 Account List Screen

**Goal**: Main screen for browsing accounts and assuming roles.

**Tasks**:
- [ ] Implement `AccountListScreen` component (routes/account-list.tsx)
- [ ] Display account list with role and region info
- [ ] Show filter input
- [ ] Implement all keybinds (/, o, p, r, R, l, enter, esc)
- [ ] Handle background account refresh
- [ ] Show loading states
- [ ] Filter functionality

**Files to Create**:
```
src/cli/cmd/tui/
  routes/
    account-list.tsx
```

**Estimated Time**: 8 hours

### 3.5 Success Screen

**Goal**: Show credential confirmation before exit.

**Tasks**:
- [ ] Implement `SuccessScreen` component (routes/success.tsx)
- [ ] Display all credential information
- [ ] Show environment variables
- [ ] Handle exit (q) and back (esc)
- [ ] Print summary to terminal on exit

**Files to Create**:
```
src/cli/cmd/tui/
  routes/
    success.tsx
```

**Estimated Time**: 3 hours

### 3.6 Settings Screen

**Goal**: Configure application settings.

**Tasks**:
- [ ] Implement `SettingsScreen` component (routes/settings.tsx)
- [ ] Show configurable settings
- [ ] Handle setting changes
- [ ] Persist changes to config

**Files to Create**:
```
src/cli/cmd/tui/
  routes/
    settings.tsx
```

**Estimated Time**: 4 hours

## Phase 4: Feature Dialogs

### 4.1 Profile Delete Confirmation Dialog

**Goal**: Confirm before deleting a profile.

**Tasks**:
- [ ] Create `ProfileDeleteDialog` component (component/profile-delete-dialog.tsx)
- [ ] Use `DialogConfirm` as base
- [ ] Show profile name
- [ ] Handle delete action

**Files to Create**:
```
src/cli/cmd/tui/
  component/
    profile-delete-dialog.tsx
```

**Estimated Time**: 2 hours

### 4.2 Region Selector Dialog

**Goal**: Select AWS region for an account.

**Tasks**:
- [ ] Create `RegionSelectorDialog` component (component/region-selector-dialog.tsx)
- [ ] Use `DialogSelect` as base
- [ ] List all AWS regions with descriptions
- [ ] Show current region
- [ ] Handle selection

**Files to Create**:
```
src/cli/cmd/tui/
  component/
    region-selector-dialog.tsx
```

**Estimated Time**: 3 hours

### 4.3 Role List Dialog

**Goal**: Select from available roles for an account.

**Tasks**:
- [ ] Create `RoleListDialog` component (component/role-list-dialog.tsx)
- [ ] Use `DialogSelect` as base
- [ ] Show roles for selected account
- [ ] Show current default role
- [ ] Handle role selection (assume immediately)
- [ ] Add "p" keybind to set profile name

**Files to Create**:
```
src/cli/cmd/tui/
  component/
    role-list-dialog.tsx
```

**Estimated Time**: 4 hours

### 4.4 Profile Name Input Dialog

**Goal**: Set custom AWS profile name.

**Tasks**:
- [ ] Create `ProfileNameDialog` component (component/profile-name-dialog.tsx)
- [ ] Use `DialogPrompt` as base
- [ ] Pre-fill with previous profile name
- [ ] Show helpful context
- [ ] Handle save

**Files to Create**:
```
src/cli/cmd/tui/
  component/
    profile-name-dialog.tsx
```

**Estimated Time**: 2 hours

### 4.5 Theme Selector Dialog

**Goal**: Switch between themes.

**Tasks**:
- [ ] Create `ThemeSelectorDialog` component (component/theme-selector-dialog.tsx)
- [ ] Use `DialogSelect` as base
- [ ] List all available themes
- [ ] Show current theme
- [ ] Preview theme colors
- [ ] Handle theme change

**Files to Create**:
```
src/cli/cmd/tui/
  component/
    theme-selector-dialog.tsx
```

**Estimated Time**: 3 hours

## Phase 5: Integration & Polish

### 5.1 App Component & Provider Stack

**Goal**: Wire everything together in the main app component.

**Tasks**:
- [ ] Update `app.tsx` with full provider stack
- [ ] Implement route switching
- [ ] Add global keybind handlers
- [ ] Add error boundary
- [ ] Add header/footer (like OpenCode)

**Files to Update**:
```
src/cli/cmd/tui/
  app.tsx
```

**Pattern Reference**: `/Users/alvinjohansson/code/elva/tui/opencode/packages/opencode/src/cli/cmd/tui/app.tsx`

**Estimated Time**: 4 hours

### 5.2 Command System (Optional but Recommended)

**Goal**: Implement OpenCode-style command palette.

**Tasks**:
- [ ] Create `CommandProvider` (component/command.tsx)
- [ ] Create `CommandDialog` (component/command-dialog.tsx)
- [ ] Register all commands
- [ ] Add Ctrl+P (or configurable) to open

**Commands to Register**:
- Switch profile
- Add profile
- Edit profile
- Refresh accounts
- Open settings
- Switch theme
- Show help
- Exit

**Files to Create**:
```
src/cli/cmd/tui/
  component/
    command.tsx
    command-dialog.tsx
```

**Pattern Reference**: `/Users/alvinjohansson/code/elva/tui/opencode/packages/opencode/src/cli/cmd/tui/component/dialog-command.tsx`

**Estimated Time**: 5 hours

### 5.3 Help System

**Goal**: Provide contextual help to users.

**Tasks**:
- [ ] Create `HelpDialog` component (component/help-dialog.tsx)
- [ ] Show keybinds for current screen
- [ ] Show general help
- [ ] Accessible via "?"

**Files to Create**:
```
src/cli/cmd/tui/
  component/
    help-dialog.tsx
```

**Estimated Time**: 3 hours

### 5.4 Default Keybinds Configuration

**Goal**: Create default keybinds file.

**Tasks**:
- [ ] Create default keybinds JSON
- [ ] Document each keybind
- [ ] Ensure compatibility with OpenCode pattern

**Files to Create**:
```
src/cli/cmd/tui/
  config/
    default-keybinds.json
```

**Estimated Time**: 2 hours

### 5.5 Testing & Bug Fixes

**Goal**: Test all flows and fix issues.

**Tasks**:
- [ ] Test profile management flow
- [ ] Test SSO authentication flow
- [ ] Test account selection flow
- [ ] Test all dialogs
- [ ] Test all keybinds
- [ ] Test theme switching
- [ ] Test edge cases (empty states, errors)
- [ ] Test in different terminal emulators
- [ ] Test color scheme compatibility

**Estimated Time**: 8 hours

## Phase 6: Advanced Features

### 6.1 Browser Integration

**Goal**: Open AWS Console in browser.

**Tasks**:
- [ ] Implement browser opener utility
- [ ] Generate AWS Console URL with role credentials
- [ ] Handle different OSes (macOS, Linux, Windows)
- [ ] Add to account list and role list screens

**Files to Update**:
```
src/util/
  browser.ts
```

**Estimated Time**: 3 hours

### 6.2 Background Account Refresh

**Goal**: Seamlessly update account list in background.

**Tasks**:
- [ ] Implement background refresh logic in AWSProvider
- [ ] Show cached data immediately
- [ ] Fetch fresh data in background
- [ ] Update UI when new data available
- [ ] Show spinner indicator during refresh

**Estimated Time**: 4 hours

### 6.3 Preference Persistence

**Goal**: Remember user choices per account/role.

**Tasks**:
- [ ] Implement preference storage
- [ ] Remember last used role per account
- [ ] Remember custom profile names per account/role
- [ ] Remember region overrides per account
- [ ] Load preferences on startup

**Data Structure**:
```typescript
interface Preferences {
  [ssoProfile: string]: {
    [accountId: string]: {
      defaultRole?: string
      region?: string
      profiles?: {
        [role: string]: string  // role -> profile name
      }
    }
  }
}
```

**Estimated Time**: 4 hours

### 6.4 Migration Tool Integration

**Goal**: Auto-detect and migrate old config.

**Tasks**:
- [ ] Detect old config files on startup
- [ ] Show migration prompt
- [ ] Integrate existing migration logic
- [ ] Create backups
- [ ] Handle migration errors gracefully

**Estimated Time**: 3 hours

## Phase 7: Documentation & Polish

### 7.1 Update Documentation

**Goal**: Update all documentation for new TUI.

**Tasks**:
- [ ] Update main README.md
- [ ] Add TUI screenshots/GIFs
- [ ] Document keybinds
- [ ] Document theming
- [ ] Document configuration
- [ ] Create troubleshooting guide

**Estimated Time**: 4 hours

### 7.2 Performance Optimization

**Goal**: Ensure smooth performance.

**Tasks**:
- [ ] Profile render performance
- [ ] Optimize re-renders
- [ ] Optimize large account lists (virtual scrolling)
- [ ] Optimize theme switching
- [ ] Reduce memory usage

**Estimated Time**: 4 hours

### 7.3 Accessibility Improvements

**Goal**: Make TUI accessible.

**Tasks**:
- [ ] Ensure full keyboard navigation
- [ ] Test high contrast themes
- [ ] Ensure visible focus indicators
- [ ] Test with screen readers (if possible)
- [ ] Add ARIA-like metadata where applicable

**Estimated Time**: 3 hours

## Implementation Order Summary

**Recommended order of execution**:

1. **Phase 1: Foundation** (20 hours)
   - Get core architecture in place
   - Essential for everything else

2. **Phase 2: UI Components** (20 hours)
   - Build reusable components
   - Needed by all screens

3. **Phase 3: Screens** (30 hours)
   - Build each screen one by one
   - Test each before moving to next

4. **Phase 4: Dialogs** (14 hours)
   - Add specialized dialogs
   - Enhance user experience

5. **Phase 5: Integration** (22 hours)
   - Wire everything together
   - Test thoroughly

6. **Phase 6: Advanced** (14 hours)
   - Add polish features
   - Improve UX

7. **Phase 7: Documentation** (11 hours)
   - Document everything
   - Final polish

**Total Estimated Time**: ~131 hours (approximately 3-4 weeks for one developer)

## Development Tips

### Code Style (Following OpenCode & AGENTS.md)

1. **Variables**:
   - Single word names where possible
   - AVOID unnecessary destructuring
   - PREFER const over let

2. **Functions**:
   - Keep in one function unless composable/reusable
   - AVOID else statements unless necessary
   - AVOID try/catch where possible

3. **Types**:
   - AVOID any type
   - Use explicit types where needed

4. **Bun APIs**:
   - Use as many Bun APIs as possible (e.g., Bun.file())

5. **Comments**:
   - NEVER use inline comments unless explicitly requested

### Testing Strategy

1. **Manual Testing**:
   - Test each screen as you build it
   - Use `bun run dev` frequently

2. **Integration Testing**:
   - Test full flows after Phase 5
   - Test all edge cases

3. **Different Terminals**:
   - Test in iTerm2, Terminal.app, Alacritty, etc.
   - Test color rendering

### Git Workflow

1. **Branching**:
   - Create feature branch for each phase
   - Merge to main after testing

2. **Commits**:
   - Commit after each major component
   - Use descriptive commit messages

### Performance Monitoring

1. **FPS Monitoring**:
   - Use OpenTUI's built-in FPS counter
   - Target 60 FPS
   - Profile slow renders

2. **Memory**:
   - Monitor memory usage with large account lists
   - Optimize if needed

## Next Steps

1. Review this plan with stakeholders
2. Set up development environment
3. Start with Phase 1.1 (Foundation)
4. Work through each phase systematically
5. Test thoroughly at each phase
6. Document as you go

## Questions to Resolve

Before starting implementation, clarify:

1. **Theme Preferences**: Which themes are must-have? Can we start with fewer?
2. **Keybind Defaults**: Are the proposed defaults acceptable?
3. **Settings Screen**: What settings are truly needed for MVP?
4. **Command Palette**: Is this a must-have or nice-to-have?
5. **Browser Integration**: Which browsers to support? OS-specific?

## Success Criteria

The TUI is complete when:

- [ ] All screens are implemented and working
- [ ] All keybinds work as specified
- [ ] Theme system works with multiple themes
- [ ] Dialog system works smoothly
- [ ] SSO authentication flow works end-to-end
- [ ] Account selection and role assumption works
- [ ] Credentials are written correctly
- [ ] Performance is smooth (60 FPS target)
- [ ] Works in major terminal emulators
- [ ] Documentation is complete
- [ ] Migration from old version works
- [ ] No critical bugs
