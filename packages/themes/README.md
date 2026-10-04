# Shared awsesh themes

`@awsesh/themes` contains the bundled catalog, custom-file discovery and validated
color resolution. It is independent of the AWS SDK and both rendering libraries.
The TUI creates OpenTUI colors; the desktop helper sends resolved hex palettes to GPUI.

## Install a custom theme

Place a JSON file in `~/.config/awsesh/themes/`, or
`$XDG_CONFIG_HOME/awsesh/themes/` when XDG_CONFIG_HOME is set. Its filename, without
`.json`, is its theme name. Start from a bundled file in `packages/themes/themes/`
and edit its colors. Files matching a bundled name override that definition;
`system` is reserved for each interface's native appearance.

The desktop reloads the catalog when Settings opens. Restart the TUI to discover
new files. Select a theme in desktop Settings/the command bar, or the TUI's theme
picker. Installing a theme makes it available to both, but selections are independent:

- TUI: `config.json`, using the existing `theme` and `theme_mode` fields.
- Desktop: `desktop.json`, using `theme` and `mode`.

## Format

Each definition has a `theme` object and optional `defs` object. Semantic color values
can be hexadecimal colors (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`), ANSI indices
from 0–255, `transparent`/`none`, references to definitions or other theme tokens,
or `{ "light": ..., "dark": ... }` variants. References resolve within that file.

Use a bundled file as the complete token template. `selectedListItemText` and
`backgroundMenu` are optional, defaulting to `background` and `backgroundElement`.
`subtleOpacity` is optional, defaults to 0.6, and must be between 0 and 1. Both
variants must resolve successfully; unknown references, cycles, missing required
tokens and invalid values reject the file. A rejected custom file produces a warning
without preventing other themes from loading.

`system` means terminal colors in the TUI and the native palette on desktop. The
appearance mode chooses light/dark or follows the respective interface's detection;
a shared named theme can still use a different mode in each interface.
