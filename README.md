# (AW)Sesh 🔐

Sesh is a simple to use AWS session manager with charm! ✨💕

Sesh is made to easily manage your AWS SSO sessions and accounts.
Filter your accounts by name, and quickly switch between them.

## ✨ Features

- 🚀 Quick AWS SSO session management
- 🔄 Fast account switching
- 🔍 Fuzzy search filtering for accounts
- 🌐 Open the AWS console in your browser
- 💅 Charming interactive terminal user interface
- 🪶 Lightweight and easy to install

## Usage

> ## ❗ Important Notice ❗
>
> This application will edit your .aws/credentials file to set the keys.
> If you have a complex setup there already I would recommend backing it up ahead of trying this!

Just type sesh!

```sh
sesh
```

Basic demo

![sesh demo](tapes/demo.gif)

You can edit, remove and manage SSO. As well as set region per account and open in browser.

![sesh editing and removing](tapes/editing-removing.gif)

## What can it do?

Run the tui by typing: `sesh` or use the cli if you already know what you need.

```sh
sesh [--version|-v] [-b|--browser] [-r|--region REGION] [SSONAME ACCOUNTNAME [ROLENAME]]
```

Let's say you want to open a browser directly with the Admin role you would type:

```sh
sesh MyOrg MyAccount AdminRole -b
```

If you want to set the region for that session directly, you can use the `-r` flag:

```sh
sesh MyOrg MyAccount AdminRole -r eu-west-1
```

If you have used the `tui` (not the cli) to select a role for a specific account, sesh will remember which role you used last time and use that even if you use the cli.

```sh
// this will now open the AdminRole
sesh MyOrg MyAccount -b
```

## SSO's with a large number of accounts

There is an issue of running into 429s (too many requests) when trying to fetch roles on a large number of accounts.
To sidestep that issue we only automatically fetch the roles if there are less than 30 accounts.
If there are more they will be lazy loaded when trying to access the role selection.
Hopefully I'll find a better solution in the future.

## 📋 Prerequisites

- Go 1.x (if building from source)

## 🛠️ Created with

- [Go](https://golang.org/) 🐹
- A few [charm\_](https://charm.sh/) tools ✨
  - [Bubble Tea](https://github.com/charmbracelet/bubbletea)
  - [Bubbles](https://github.com/charmbracelet/bubbles)
  - [Lib Gloss](https://github.com/charmbracelet/lipgloss)
  - [VHS](https://github.com/charmbracelet/vhs)
- [AWS SDK for Go](https://github.com/aws/aws-sdk-go-v2) ☁️

## 📦 Installation

### Option 1: Installation Script

Download and run the installation script:

```sh
curl -sSL https://raw.githubusercontent.com/elva-labs/awsesh/main/install.sh | bash
```

### Option 2: Download Pre-built Executables

#### For Linux/macOS:

1. Download the latest release executable directly:

```bash
# Download the latest release for your platform from:
# https://github.com/elva-labs/awsesh/releases/latest
# Choose either sesh-linux-amd64 (for x86_64) or sesh-linux-arm64 (for ARM64)
# Example for x86_64/amd64 architecture:
curl -L https://github.com/elva-labs/awsesh/releases/latest/download/sesh-linux-amd64 -o sesh

# Make it executable
chmod +x sesh

# Move to a directory in your PATH
# For system-wide installation (requires sudo):
mv sesh /usr/local/bin/

# Or for user-local installation:
mkdir -p ~/.local/bin
mv sesh ~/.local/bin/

# Add to PATH if needed (add this to your .bashrc or .zshrc)
export PATH="$HOME/.local/bin:$PATH"
```

#### For Windows:

For Windows installation:

1. Download the Windows executable directly from:
   [https://github.com/elva-labs/awsesh/releases/latest/download/sesh-windows-amd64.exe](https://github.com/elva-labs/awsesh/releases/latest/download/sesh-windows-amd64.exe)
2. Create a folder: `%LOCALAPPDATA%\Programs\sesh\`
3. Move the downloaded file there and rename to `sesh.exe`
4. Add to PATH by running this in PowerShell:
   ```powershell
   [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ";$env:LOCALAPPDATA\Programs\sesh", 'User')
   ```

### Option 3: Build from Source

1. Clone the repository:

```sh
git clone https://github.com/elva-labs/awsesh.git
cd awsesh
```

2. Build the application:

For Unix-like systems (Linux/MacOS):

```sh
go build -o build/sesh
```

For Windows:

```powershell
# Set Windows build environment
set GOOS=windows
set GOARCH=amd64 # or arm if you have an arm architecture
go build -o build/sesh.exe
```

3. Move the binary to your PATH:

For Unix-like systems:

```sh
# For system-wide installation (requires sudo)
cp build/sesh /usr/local/bin/

# For user-local installation
mkdir -p ~/.local/bin
cp build/sesh ~/.local/bin/
```

For Windows:

```powershell
# Create Programs directory if it doesn't exist
mkdir -Force "$env:LOCALAPPDATA\Programs\sesh"

# Copy the binary
Copy-Item "build\sesh.exe" "$env:LOCALAPPDATA\Programs\sesh"

# Add to PATH (PowerShell) - copy and run this single line
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ";$env:LOCALAPPDATA\Programs\sesh", 'User')
```

4. Make the binary executable (Unix-like systems only):

```sh
chmod +x /usr/local/bin/sesh  # or ~/.local/bin/sesh for user-local installation
```

## 🚀 Usage

After installation, you can run sesh from the command line:

```sh
sesh
```

## 🧹 Uninstall

### Uninstall Script (Linux/macOS)

To uninstall `sesh`, you can run the uninstall script directly:

```sh
curl -sSL https://raw.githubusercontent.com/elva-labs/awsesh/main/uninstall.sh | bash
```

*   You might be prompted for your password if `sesh` was installed in `/usr/local/bin`.
*   The script will attempt to remove `sesh` from `/usr/local/bin` and `~/.local/bin`.
*   If `sesh` was installed to `~/.local/bin` and removed, the script will remind you to remove the directory from your `PATH` in your shell configuration file (`.bashrc`, `.zshrc`, etc.) if you added it manually.

### Manual Uninstall

**Linux/macOS:**

1.  **Locate the binary:** Check the common installation locations:
  *   `/usr/local/bin/sesh`
  *   `~/.local/bin/sesh`
2.  **Remove the binary:**
  *   If it's in `/usr/local/bin/`: `rm /usr/local/bin/sesh`
  *   If it's in `~/.local/bin/`: `rm ~/.local/bin/sesh`
3.  **Remove from PATH (if applicable):** If you added `~/.local/bin` to your `PATH` manually, remove that line from your shell configuration file (e.g., `~/.bashrc`, `~/.zshrc`).

**Windows:**

1.  **Remove the executable:** Delete the `sesh.exe` file, typically located at `%LOCALAPPDATA%\Programs\sesh\sesh.exe`.
2.  **Remove from PATH:**
  *   Open System Properties (search for "Environment Variables").
  *   Click "Environment Variables...".
  *   Under "User variables", select "Path" and click "Edit".
  *   Find the entry pointing to `%LOCALAPPDATA%\Programs\sesh` and click "Delete".
  *   Click "OK" on all open windows.
  *   You may need to restart your terminal or log out and back in for the PATH change to take effect.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
