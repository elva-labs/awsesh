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

### Option 2: Manual Installation

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
set GOARCH=amd64
go build -o build/sesh.exe
```

3. Move the binary to your PATH:

For Unix-like systems:

```sh
# For system-wide installation (requires sudo)
sudo cp build/sesh /usr/local/bin/

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

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
