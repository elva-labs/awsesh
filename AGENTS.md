# Agent Guidelines for awsesh

## Build/Test Commands
- **Build**: `go build -o awsesh` - Builds the binary to `awsesh`
- **Test**: `go test ./...` - Runs all tests (currently no test files exist)
- **Module**: `go mod tidy` - Clean up dependencies
- **Lint**: No specific linter configured (use `go vet` for basic checks)

## Code Style & Conventions
- **Go version**: 1.23.0+ (uses Go 1.24.1 toolchain)
- **Package structure**: Single module `awsesh` with subpackages `aws/`, `config/`, `utils/`
- **Imports**: Group stdlib, external deps, then local packages (see main.go:3-26)
- **Naming**: Use descriptive names, camelCase for unexported, PascalCase for exported
- **Error handling**: Wrap errors with context using `fmt.Errorf("message: %w", err)`
- **Constants**: Group related constants together, use descriptive names (main.go:17-44)

## UI Framework (Bubble Tea)
- Uses Bubble Tea v2 (beta) for TUI with Model-Update-View pattern
- State management through `model` struct with explicit state constants
- Message-driven architecture with typed messages (e.g., `fetchAccountsSuccessMsg`)
- Use Bubbles library components: `list`, `textinput`, `spinner`
- Apply dynamic theming via `getDynamicStyles()` function

## Project Structure
- `main.go`: Main application entry point and TUI logic
- `aws/`: AWS SDK interactions (SSO, STS, account management)  
- `config/`: Configuration file management and caching
- `utils/`: Shared utilities (browser opening, etc.)
- `.cursor/rules/`: Contains project-specific Cursor IDE rules

## Key Patterns
- Use context.Background() for AWS operations
- Cache accounts/tokens to improve performance
- Support both cached and fresh data flows
- Sequential role loading for performance with large account lists
- Comprehensive error handling with user-friendly messages