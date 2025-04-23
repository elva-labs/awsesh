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

## 📋 Prerequisites

- Go 1.x (Only required if building from source)

## 📦 Installation

There are several ways to install Sesh:

### Installation Script (Recommended - Linux/macOS)

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
sesh [--version|-v] [-b|--browser] [-r|--region REGION] [SSONAME ACCOUNTNAME [ROLENAME]]
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

### Important Notes

#### Credentials File Modification

> **❗ Important Notice ❗**
>
> This application **will edit** your `~/.aws/credentials` file to set the session keys. If you have a complex or custom setup in this file, please **back it up** before using `sesh`.

#### Large Number of SSO Accounts

There is a known issue where fetching roles for AWS SSO setups with a very large number of accounts (>30) can trigger AWS API rate limiting (429 errors). To mitigate this, `sesh` only automatically fetches roles on startup if there are fewer than 30 accounts. For larger setups, roles are lazy-loaded when you select an account in the TUI.

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
