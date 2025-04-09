#!/usr/bin/env bash

# Exit on error
set -e

echo "Uninstalling sesh..."

# Define potential installation paths
INSTALL_PATH_SYSTEM="/usr/local/bin/sesh"
INSTALL_PATH_USER="$HOME/.local/bin/sesh"

# Flag to track if uninstallation occurred
uninstalled=false

# Check and remove from system path
if [ -f "$INSTALL_PATH_SYSTEM" ]; then
    echo "Found sesh in /usr/local/bin. Removing..."
    if sudo rm "$INSTALL_PATH_SYSTEM"; then
        echo "Successfully removed $INSTALL_PATH_SYSTEM"
        uninstalled=true
    else
        echo "Failed to remove $INSTALL_PATH_SYSTEM. Please try running the script with sudo or remove it manually."
    fi
fi

# Check and remove from user path
if [ -f "$INSTALL_PATH_USER" ]; then
    echo "Found sesh in ~/.local/bin. Removing..."
    if rm "$INSTALL_PATH_USER"; then
        echo "Successfully removed $INSTALL_PATH_USER"
        # Remind user about PATH if they installed it here
        if ! $uninstalled ; then # Only show if not removed from system path already
             echo "Remember to remove ~/.local/bin from your PATH in your shell configuration file (.bashrc, .zshrc, etc.) if you added it during installation."
        fi
        uninstalled=true
    else
        echo "Failed to remove $INSTALL_PATH_USER. Please check permissions or remove it manually."
    fi
fi

if [ "$uninstalled" = false ]; then
    echo "sesh binary not found in standard installation locations (/usr/local/bin or ~/.local/bin)."
    echo "If you installed it elsewhere, please remove it manually."
fi

echo "Uninstallation process finished." 
