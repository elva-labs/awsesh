# Feature Parity Analysis: Original awsesh vs New TypeScript Rewrite

## ✅ Implemented Features (Have Parity)

### Core Functionality
- ✅ Interactive TUI with keyboard navigation
- ✅ SSO profile management
- ✅ AWS account listing
- ✅ IAM role selection
- ✅ Credentials writing to `~/.aws/credentials`
- ✅ Token caching with expiration
- ✅ Account caching
- ✅ Last selected profile/account/role memory
- ✅ XDG Base Directory specification compliance
- ✅ SSO device flow authentication

### CLI Commands
- ✅ `awsesh` - Interactive TUI (default command)
- ✅ `awsesh auth [profile]` - Authenticate with SSO
- ✅ `awsesh auth --list` - List profiles
- ✅ `awsesh auth --delete <name>` - Delete profile
- ✅ `awsesh whoami` - Show current identity

### Technical Features
- ✅ Async data loading
- ✅ Loading states and spinners
- ✅ Error handling and display
- ✅ Proper file locking for concurrent access
- ✅ JSON-based configuration storage
- ✅ Logging system

## ❌ Missing Features (Need Implementation)

### 1. **Fuzzy Search/Filter** (HIGH PRIORITY)
**Original:** Built-in list filtering in all views
```go
// Users can type to filter accounts/roles in real-time
m.accountList.FilterState() != list.Filtering
```

**Status:** ❌ Not implemented
**Impact:** Major usability feature for large account lists
**Implementation:** Need to add filter input to all selector components

---

### 2. **Browser Integration** (HIGH PRIORITY)
**Original:** Open AWS console directly from TUI
- `sesh -b` - CLI flag to open browser
- `o` key in TUI - Opens console at SSO/Account/Role level

**Status:** ❌ Not implemented
**Impact:** Popular feature for quick console access
**Implementation:** 
- Add `--browser/-b` flag to auth command
- Add `o` keybinding to all TUI screens
- Use `aws.GetDashboardURL()` and `aws.GetAccountURL()`

---

### 3. **Custom Profile Names in TUI** (HIGH PRIORITY)
**Original:** Press `p` in role selector to set custom profile name
```go
case "p":
    // Show input for custom profile name
    m.state = stateEnterProfileName
```

**Status:** ❌ Not implemented (only works via CLI flag)
**Impact:** Users can't set custom profiles from TUI
**Implementation:** Add profile name input screen before credentials

---

### 4. **Region Management** (MEDIUM PRIORITY)
**Original:** 
- CLI: `sesh -r eu-west-1`
- TUI: Press `r` on account to set custom region
```go
case "r":
    // Set region for selected account
    m.state = stateSetRegion
```

**Status:** ❌ Not implemented
**Impact:** Users can't override default regions
**Implementation:** 
- Add `--region/-r` flag
- Add `r` keybinding in account selector
- Store per-account region preferences

---

### 5. **Direct CLI Session Setup** (HIGH PRIORITY)
**Original:** CLI arguments for direct access
```bash
sesh MyOrg MyAccount AdminRole
sesh MyOrg MyAccount  # Uses last selected role
```

**Status:** ❌ Not implemented
**Impact:** Power users can't bypass TUI for quick switching
**Implementation:** Parse positional arguments in main CLI

---

### 6. **Shell Integration (--eval flag)** (HIGH PRIORITY)
**Original:** Export environment variables
```bash
sesh() { eval "$(command sesh --eval "$@")"; }
sesh MyOrg MyAccount AdminRole  # Sets AWS_* env vars
```

**Status:** ❌ Not implemented
**Impact:** Can't set environment variables in current shell
**Implementation:**
- Add `--eval/-e` flag
- Output shell commands to stdout
- Set AWS_PROFILE, AWS_REGION, AWS_ACCESS_KEY_ID, etc.

---

### 7. **SSO Profile CRUD in TUI** (MEDIUM PRIORITY)
**Original:** Full profile management from TUI
- `n` - Create new SSO profile
- `e` - Edit existing profile
- `d` - Delete profile (with confirmation)

**Status:** ❌ Not implemented
**Impact:** Users must use CLI for profile management
**Implementation:** Add profile management screens

---

### 8. **Role Memory** (MEDIUM PRIORITY)
**Original:** Remember last selected role per account
```go
m.configMgr.SaveLastSelectedRole(ssoName, accountName, roleName)
```

**Status:** ⚠️ Partially implemented (saves but doesn't pre-select)
**Impact:** Users re-select roles every time
**Implementation:** Pre-select last used role in role selector

---

### 9. **Lazy Role Loading** (LOW PRIORITY)
**Original:** Only fetch roles when account is selected (for >100 accounts)
```go
if len(accounts) > 100 {
    // Don't pre-fetch all roles
}
```

**Status:** ❌ Not implemented (always fetches on selection)
**Impact:** API rate limiting for large orgs
**Implementation:** Add threshold check and lazy loading

---

### 10. **Profile Name Memory** (LOW PRIORITY)
**Original:** Remember custom profile names per account+role
```go
m.configMgr.GetProfileNameForAccountRole(ssoName, accountName, roleName)
```

**Status:** ❌ Not implemented
**Impact:** Can't remember custom profile choices
**Implementation:** Store and retrieve profile name preferences

---

### 11. **Delete Confirmation Dialog** (LOW PRIORITY)
**Original:** Confirm before deleting profiles
```go
case stateDeleteConfirm:
    // Show "Are you sure?" prompt
```

**Status:** ❌ Not implemented (deletes immediately)
**Impact:** Accidental deletions possible
**Implementation:** Add confirmation screen

---

### 12. **Whoami CLI Enhancement** (LOW PRIORITY)
**Original:** `sesh -w` or `sesh --whoami`
```bash
sesh -w  # Shows current AWS identity
```

**Status:** ✅ Implemented but different (`awsesh whoami`)
**Impact:** Minor - different syntax
**Implementation:** N/A - already works

---

## 📊 Feature Priority Summary

### Must-Have (Release Blockers)
1. ❌ Fuzzy search/filter in lists
2. ❌ Direct CLI session setup (positional args)
3. ❌ Shell integration (--eval flag)
4. ❌ Browser integration (-b flag and 'o' key)
5. ❌ Custom profile names in TUI ('p' key)

### Should-Have (v1.0)
6. ❌ Region management (-r flag and 'r' key)
7. ❌ SSO profile CRUD in TUI
8. ⚠️ Role memory (pre-selection)

### Nice-to-Have (v1.1+)
9. ❌ Lazy role loading (>100 accounts)
10. ❌ Profile name memory
11. ❌ Delete confirmation dialog

---

## 🎯 Implementation Checklist

### Phase 3: Critical Features (Week 1)
- [ ] Add fuzzy filter to all list components
- [ ] Implement direct CLI session setup
- [ ] Add --eval flag and shell output
- [ ] Add browser integration (--browser flag)
- [ ] Add 'o' keybinding for browser opening

### Phase 4: Important Features (Week 2)
- [ ] Add custom profile name input screen in TUI
- [ ] Add 'p' keybinding in role selector
- [ ] Implement region management
- [ ] Add 'r' keybinding in account selector
- [ ] Add profile CRUD screens (new/edit/delete)

### Phase 5: Polish (Week 3)
- [ ] Pre-select last used roles
- [ ] Add delete confirmation dialog
- [ ] Implement profile name memory
- [ ] Add lazy role loading threshold
- [ ] Performance optimizations

---

## 📝 Notes

### Architecture Differences
The new TypeScript version has better separation of concerns:
- **Storage:** JSON with proper locking (vs INI files)
- **Logging:** Structured logging with levels
- **Context:** AsyncLocalStorage pattern
- **UI:** SolidJS reactivity (vs Bubble Tea tea.Model)

### Breaking Changes from Original
1. Command syntax: `awsesh whoami` vs `sesh --whoami`
2. Profile storage: JSON vs INI format
3. Token storage: Separate from config (better security)

### Backwards Compatibility
To maintain compatibility with existing users:
- [ ] Consider migrating old INI configs to JSON
- [ ] Keep same credential file format
- [ ] Maintain XDG paths
- [ ] Support same environment variables
