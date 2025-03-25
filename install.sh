#!/bin/bash

# Exit on error
set -e

echo "Installing awsesh..."

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m | tr '[:upper:]' '[:lower:]')

# Map architecture names
case $ARCH in
    x86_64)
        ARCH="amd64"
        ;;
    aarch64|arm64)
        ARCH="arm64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

# Get the latest release version
LATEST_VERSION=$(curl -s https://api.github.com/repos/elva-labs/awsesh/releases/latest | grep -o '"tag_name": ".*"' | cut -d'"' -f4)

if [ -z "$LATEST_VERSION" ]; then
    echo "Failed to fetch latest version"
    exit 1
fi

# Construct the binary name
BINARY_NAME="awsesh-${OS}-${ARCH}"
if [ "$OS" = "darwin" ]; then
    BINARY_NAME="awsesh-darwin-${ARCH}"
elif [ "$OS" = "linux" ]; then
    BINARY_NAME="awsesh-linux-${ARCH}"
else
    echo "Unsupported operating system: $OS"
    exit 1
fi

# Download URL
DOWNLOAD_URL="https://github.com/elva-labs/awsesh/releases/download/${LATEST_VERSION}/${BINARY_NAME}"

# Create temporary directory
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# Download the binary
echo "Downloading awsesh ${LATEST_VERSION}..."
if ! curl -L "$DOWNLOAD_URL" -o awsesh; then
    echo "Failed to download binary"
    exit 1
fi

# Make the binary executable
chmod +x awsesh

# Install to /usr/local/bin (or ~/.local/bin if no sudo access)
if [ -w /usr/local/bin ]; then
    echo "Installing to /usr/local/bin..."
    sudo cp awsesh /usr/local/bin/
    sudo chmod +x /usr/local/bin/awsesh
else
    echo "Installing to ~/.local/bin..."
    mkdir -p ~/.local/bin
    cp awsesh ~/.local/bin/
    chmod +x ~/.local/bin/awsesh
    echo "Please add ~/.local/bin to your PATH if not already done"
    echo "Add this line to your ~/.bashrc, ~/.zshrc, or ~/.profile:"
    echo 'export PATH="$HOME/.local/bin:$PATH"'
fi

# Clean up
cd - > /dev/null
rm -rf "$TMP_DIR"

echo "Installation complete! You can now use 'awsesh' from the command line." 
