# Known Bugs

## ~~Migration script does not run on first run of new version~~

**Status: Fixed**

The migration script does not seem to execute when running a new version for the first time.

**Root cause:** The auto-detection logic in `MigrationHelper` was removed during the SDK refactor (commit 1c40675).

**Fix:**
- Added `MigrationProvider` context to TUI that checks for old config on startup
- Uses KV store to track if migration check has already been done (key: `migration-checked`)
- Shows dialog asking if user wants to migrate - if yes, runs migration in-app and toasts result
- If user declines, sets the KV flag and toasts that migration can be run later via CLI
- Updated `migrate.ts` to skip the `metadata` profile (old metadata section, not a real session)
- Added `refreshSessions()` method to AWS context to reload sessions after migration

## Remove SSO session dialog is broken

The delete or cancel buttons in the remove SSO session dialog do not work.

## Add and edit screens should be dialogs

The add and edit screens should be converted into dialogs instead of separate screens.

## Print output when exiting sesh

When exiting sesh, print the latest set session (not necessarily the default profile, but the most recently set session even if it was set under a named profile).

## Cannot select text to copy

Unable to select text in the TUI to copy it.

## Exiting set credentials page should return to selected account

When exiting a set credentials page, the app should go back to the accounts list with the account you navigated from still selected.

## SSO sessions view should reload after deleting a session

When deleting an SSO session, the SSO sessions view should reload to reflect the deletion. Maybe add a border around the indicator.

## Sometimes loads system theme instead of set theme

The app sometimes loads the system theme instead of the user's configured theme.
