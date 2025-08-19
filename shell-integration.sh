#!/bin/bash
# Shell integration helper for awsesh
# This file provides shell functions to enable comprehensive AWS environment variable setting

# Recommended: Simple function that always uses --eval mode (best for Starship integration)
sesh() {
    eval "$(command sesh --eval "$@")"
}

# Alternative: Conditional function for users who want both eval and file-only modes
# Uncomment the function above and comment out this one if you prefer the simple approach
# sesh() {
#     if [[ "$*" == *"--eval"* ]] || [[ "$*" == *"-e"* ]]; then
#         eval "$(command sesh "$@")"
#     else
#         command sesh "$@"
#     fi
# }

# Fish shell function (copy to ~/.config/fish/functions/sesh.fish if using fish)
# Simple version:
# function sesh
#     eval (command sesh --eval $argv)
# end
#
# Conditional version:
# function sesh
#     if string match -q "*--eval*" $argv; or string match -q "*-e*" $argv
#         eval (command sesh $argv)
#     else
#         command sesh $argv
#     end
# end

echo "Shell integration loaded! The --eval mode sets comprehensive AWS environment variables:"
echo "  AWS_PROFILE, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_SESSION_EXPIRATION"
echo ""
echo "You can now use:"
echo "  sesh                     # Interactive mode with full environment setup"
echo "  sesh MyOrg MyAccount     # Direct mode with full environment setup"
echo ""
echo "Current AWS session:"
echo "  AWS_PROFILE: ${AWS_PROFILE:-<not set>}"
echo "  AWS_REGION: ${AWS_REGION:-<not set>}"