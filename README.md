# (AW)Sesh

Sesh is a simple to use AWS session manager with charm!
Sesh is made to easily manage your AWS SSO sessions and accounts.
Filter your accounts by name, and quickly switch between them.

## Created with

- [Go](https://golang.org/)
- A few [charm\_](https://charm.sh/) tools
  - [Bubble Tea](https://github.com/charmbracelet/bubbletea)
  - [Bubbles](https://github.com/charmbracelet/bubbles)
  - [Lib Gloss](https://github.com/charmbracelet/lipgloss)
  - [VHS](https://github.com/charmbracelet/vhs)
- [AWS SDK for Go](https://github.com/aws/aws-sdk-go-v2)

## Installation

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
```sh
go build -o build/awsesh
```

3. Move the binary to your PATH:
```sh
# For system-wide installation (requires sudo)
sudo cp build/awsesh /usr/local/bin/

# For user-local installation
mkdir -p ~/.local/bin
cp build/awsesh ~/.local/bin/
```

4. Make the binary executable:
```sh
chmod +x /usr/local/bin/awsesh  # or ~/.local/bin/awsesh for user-local installation
```

## Usage

After installation, you can run awsesh from the command line:

```sh
awsesh
```
