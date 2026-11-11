# Vendored pin-utils

This directory contains the unchanged library source, package manifest, README,
and licenses from the crates.io release of `pin-utils` 0.1.1.

The crate is vendored because upstream is unmaintained (RUSTSEC-2026-0441).
`async-std` 1.13.2 still requires it through the desktop application's GPUI
dependency chain. The desktop Cargo manifest patches that dependency to this
local copy, which is maintained with this repository. No runtime behavior is
changed.

Remove this copy and the Cargo patch when the dependency chain no longer needs
`pin-utils`. Review any future changes to its unsafe pinning macros carefully.
