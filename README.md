# (AW)Sesh 🔐

Sesh is a simple to use AWS session manager with charm! ✨💕

Sesh is made to easily manage your AWS SSO sessions and accounts.
Filter your accounts by name, and quickly switch between them.

![sesh demo](tapes/demo2.gif)
_Basic demo_

![sesh editing and removing](tapes/editing-removing.gif)
_Editing, removing, managing SSO, setting region per account, and opening in browser._

## ✨ Features

- 🚀 Quick AWS SSO session management
- 🔄 Fast account switching
- 🔍 Fuzzy search filtering for accounts
- 🌐 Open the AWS console in your browser
- 💅 Charming interactive terminal user interface
- 🪶 Lightweight and easy to install
- 🏷️ Profile support
- ⭐ Compatible with shell prompt tools like Starship
- 📁 XDG Base Directory specification compliance

## 📋 Prerequisites

- Go 1.x (Only required if building from source)

## 📦 Installation

There are several ways to install Sesh:

### Homebrew (Recommended - Linux/macOS)

If you have [Homebrew](https://brew.sh/) installed, you can install `sesh` with:

```sh
brew tap elva-labs/elva
brew install awsesh
```

### Installation Script

Download and run the installation script:

```sh
curl -sSL https://raw.githubusercontent.com/elva-labs/awsesh/main/install.sh | bash
```

_This script will attempt to install `sesh` to `/usr/local/bin` or `~/.local/bin` and will prompt for `sudo` if necessary._

### Pre-built Binaries

Download the latest release executables directly from the [Releases page](https://github.com/elva-labs/awsesh/releases/latest).

**Linux/macOS:**

1. Download the appropriate binary (`sesh-linux-amd64`, `sesh-linux-arm64`, `sesh-darwin-amd64`, `sesh-darwin-arm64`). Example for Linux x86_64:

   ```bash
   curl -L https://github.com/elva-labs/awsesh/releases/latest/download/sesh-linux-amd64 -o sesh
   ```

2. Make it executable:

   ```bash
   chmod +x sesh
   ```

3. Move it to a directory in your PATH:

   ```bash
   # For system-wide installation (may require sudo depending on permissions):
   mv sesh /usr/local/bin/

   # Or for user-local installation:
   mkdir -p ~/.local/bin
   mv sesh ~/.local/bin/
   ```

4. If using `~/.local/bin`, ensure it's in your PATH:

   ```bash
   # Add this to your ~/.bashrc, ~/.zshrc, or equivalent if needed
   export PATH="$HOME/.local/bin:$PATH"
   ```

**Windows:**

1. Download the Windows executable (`sesh-windows-amd64.exe`).
2. Create a folder (e.g., `%LOCALAPPDATA%\Programs\sesh\`).
3. Move the downloaded file there and rename it to `sesh.exe`.
4. Add the folder to your PATH via System Properties or PowerShell:

   ```powershell
   # Ensure the target directory exists
   New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\Programs\sesh"
   # Add to user PATH (requires restart of terminal/session)
   $CurrentUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
   $NewPath = $CurrentUserPath + ";$env:LOCALAPPDATA\Programs\sesh"
   [Environment]::SetEnvironmentVariable('Path', $NewPath, 'User')
   ```

### Build from Source

1. Clone the repository:

   ```sh
   git clone https://github.com/elva-labs/awsesh.git
   cd awsesh
   ```

2. Build the application:

   **Linux/macOS:**

   ```sh
   go build -o build/sesh
   ```

   **Windows:**

   ```powershell
   # Set environment variables for cross-compilation if needed
   # $env:GOOS = "windows"
   # $env:GOARCH = "amd64"
   go build -o build/sesh.exe
   ```

3. Install the binary (move it to your PATH):

   **Linux/macOS:**

   ```sh
   # For system-wide installation (may require sudo depending on permissions):
   cp build/sesh /usr/local/bin/

   # For user-local installation:
   mkdir -p ~/.local/bin
   cp build/sesh ~/.local/bin/

   # Ensure it's executable
   chmod +x /usr/local/bin/sesh  # Or ~/.local/bin/sesh
   ```

   **Windows:**

   ```powershell
   # Ensure the target directory exists
   New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\Programs\sesh"
   # Copy the binary
   Copy-Item "build\sesh.exe" "$env:LOCALAPPDATA\Programs\sesh\sesh.exe"
   # Add to user PATH (see Pre-built Binaries section for command)
   ```

## 🚀 Usage

### Interactive TUI

Simply run `sesh` to launch the interactive terminal interface:

```sh
sesh
```

### Command Line Interface (CLI)

You can also use `sesh` directly from the command line:

```sh
sesh [-v|--version] [-b|--browser] [-w|--whoami] [-r|--region REGION] [-e|--eval] [-p|--profile PROFILE] [SSONAME ACCOUNTNAME [ROLENAME]]
```

**Examples:**

- Open the AWS console in a browser for a specific role:

  ```sh
  sesh MyOrg MyAccount AdminRole -b
  ```

- Set the region for the session:

  ```sh
  sesh MyOrg MyAccount AdminRole -r eu-west-1
  ```

- If you've previously selected a role for an account in the TUI, `sesh` remembers it for CLI usage:

  ```sh
  # Assumes AdminRole was previously selected for MyOrg/MyAccount in the TUI
  sesh MyOrg MyAccount -b
  ```

- Use a custom profile name for your credentials:

  ```sh
  sesh MyOrg MyAccount AdminRole --profile production
  ```

- Use custom profile with last used role (no need to specify role):

  ```sh
  sesh MyOrg MyAccount --profile production
  ```

- Combine custom profile with shell integration:

  ```sh
  sesh MyOrg MyAccount AdminRole --profile dev
  ```

### Shell Integration

Use the `--eval` flag to set AWS environment variables in your shell for seamless integration with tools like [Starship](https://starship.rs/).

#### Setup

Add this function to your shell configuration (`~/.bashrc`, `~/.zshrc`, etc.):

**Bash/Zsh:**

```bash
sesh() {
    eval "$(command sesh --eval "$@")"
}
```

**Fish:**

```fish
function sesh
    eval (command sesh --eval $argv)
end
```

#### Usage

```sh
# CLI mode
sesh MyOrg MyAccount AdminRole

# TUI mode
sesh
```

This sets all AWS environment variables for compatibility with AWS tools and shell prompts:

```bash
export AWS_PROFILE='myorg-adminrole'
export AWS_REGION='us-east-1'
export AWS_ACCESS_KEY_ID='AKIA...'
export AWS_SECRET_ACCESS_KEY='...'
export AWS_SESSION_TOKEN='...'
export AWS_SESSION_EXPIRATION='2024-08-19T10:30:00Z'
```

### Custom Profile Names

By default, `sesh` writes credentials to the `default` profile in your AWS credentials file. You can specify a custom profile name using the `--profile` flag.

**CLI Usage:**

```bash
# Use a custom profile name
sesh MyOrg MyAccount AdminRole --profile production
```

**TUI Usage:**
In the interactive mode, when selecting a role, press `p` to enter a custom profile name before setting credentials. The input will be pre-filled with the previously used profile name for that specific account and role combination.

#### Profile Name Memory

`sesh` remembers the custom profile names you use for specific account+role combinations:

- **First time**: `sesh MyOrg MyAccount AdminRole --profile production`
- **Next time**: `sesh MyOrg MyAccount --profile production` (automatically uses AdminRole)
- **TUI**: Press `p` on "MyAccount/AdminRole" → input pre-filled with "production"

This makes it easy to consistently use the same profile names for your different environments without having to remember or retype them.

#### Profile Naming Convention

- **Default behavior**: Uses the `default` profile
- **With `--profile` flag**: Uses your specified profile name
- **Shell integration**: Automatically sets `AWS_PROFILE` environment variable

### Important Notes

#### Credentials File Modification

> **❗ Important Notice ❗**
>
> This application **will edit** your AWS credentials file to set the session keys. By default, this is `~/.aws/credentials`, but `sesh` respects the `AWS_SHARED_CREDENTIALS_FILE` environment variable if set. If you have a complex or custom setup in this file, please **back it up** before using `sesh`.

#### XDG Base Directory Compliance

`sesh` supports XDG Base Directory specification and respects the following environment variables:

- `AWS_CONFIG_FILE` - Path to AWS config file (default: `~/.aws/config`)
- `AWS_SHARED_CREDENTIALS_FILE` - Path to AWS credentials file (default: `~/.aws/credentials`)

**Example XDG setup:**

```bash
export AWS_CONFIG_FILE="$XDG_CONFIG_HOME/aws/config"
export AWS_SHARED_CREDENTIALS_FILE="$XDG_DATA_HOME/aws/credentials"
```

When these environment variables are set, `sesh` will:

- Read existing SSO profiles from the custom config location
- Write credentials to the custom credentials location
- Store its own configuration files (`awsesh`, `awsesh-tokens`, etc.) in the same directory as your AWS config file

**Example with XDG compliance:**

```bash
# Set XDG-compliant paths
export AWS_CONFIG_FILE="$XDG_CONFIG_HOME/aws/config"
export AWS_SHARED_CREDENTIALS_FILE="$XDG_DATA_HOME/aws/credentials"

# Use sesh with shell integration
sesh MyOrg MyAccount AdminRole

# Credentials file and environment variables are set
echo $AWS_PROFILE  # Output: myorg-adminrole
aws sts get-caller-identity  # Works with custom location
```

> **💡 Note for XDG users:** If you have `AWS_CONFIG_FILE` set but your SSO profiles don't appear, make sure your existing SSO profiles are in the file specified by that environment variable, not in `~/.aws/config`.

#### Large Number of SSO Accounts

There is a known issue where fetching roles for AWS SSO setups with a very large number of accounts (>100) can trigger AWS API rate limiting (429 errors). To mitigate this, `sesh` only automatically fetches roles on startup if there are fewer than 100 accounts. For larger setups, roles are lazy-loaded when you select an account in the TUI.

## 🧹 Uninstall

### Using the Uninstall Script (Linux/macOS)

If you installed `sesh` using the installation script, you can run the corresponding uninstall script:

```sh
curl -sSL https://raw.githubusercontent.com/elva-labs/awsesh/main/uninstall.sh | bash
```

- You might be prompted for your password if `sesh` was installed in `/usr/local/bin`.
- The script will attempt to remove `sesh` from `/usr/local/bin` and `~/.local/bin`.
- If `sesh` was installed to `~/.local/bin` and removed, the script will remind you to remove the directory from your `PATH` in your shell configuration file (`.bashrc`, `.zshrc`, etc.) if you added it manually.

### Manual Uninstall

**Linux/macOS:**

1. **Locate the binary:** Check common locations: `/usr/local/bin/sesh`, `~/.local/bin/sesh`.
2. **Remove the binary:**
   - `rm /usr/local/bin/sesh` (may require `sudo` depending on how it was installed)
   - `rm ~/.local/bin/sesh`
3. **Remove from PATH (if applicable):** If you manually added `~/.local/bin` to your `PATH`, remove that line from your shell configuration file (e.g., `~/.bashrc`, `~/.zshrc`).

**Windows:**

1. **Remove the executable:** Delete `sesh.exe` (typically in `%LOCALAPPDATA%\Programs\sesh\`).
2. **Remove from PATH:** Edit your User Environment Variables (search for "Environment Variables"), select "Path", find the entry for the `sesh` directory, and delete it. Click OK. You may need to restart your terminal or session.

## 🛠️ Built With

- [Go](https://golang.org/) 🐹
- [Charm](https://charm.sh/) Tools ✨
  - [Bubble Tea](https://github.com/charmbracelet/bubbletea)
  - [Bubbles](https://github.com/charmbracelet/bubbles)
  - [Lip Gloss](https://github.com/charmbracelet/lipgloss)
  - [VHS](https://github.com/charmbracelet/vhs) (for demo recording)
- [AWS SDK for Go V2](https://github.com/aws/aws-sdk-go-v2) ☁️

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
