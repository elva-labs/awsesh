# Configuration

awsesh supports user configuration through a JSON config file located at `~/.config/awsesh/config.json`.

## Config File Location

The config file follows XDG base directory specification:
- **Linux/macOS**: `~/.config/awsesh/config.json`
- **With XDG_CONFIG_HOME set**: `$XDG_CONFIG_HOME/awsesh/config.json`

## Config Format

```json
{
  "theme": "catppuccin",
  "defaultRegion": "eu-west-1",
  "keybinds": {
    "leader": ["ctrl+space"],
    "quit": ["ctrl+q", "<leader>q"],
    "filter": ["<leader>f"]
  }
}
```

## Available Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `theme` | string | `"default"` | Color theme name |
| `autoAssumeRole` | boolean | `true` | Automatically assume roles |
| `cacheAccountDuration` | number | `15` | Account cache duration in minutes |
| `defaultRegion` | string | `"us-east-1"` | Default AWS region |
| `keybinds` | object | See below | Custom keybind overrides |

## Keybinds

Keybinds use a simple format:
- Modifiers: `ctrl`, `shift`, `meta` (cmd on macOS)
- Leader key: `<leader>` prefix for leader-key sequences
- Combined with `+`: e.g., `ctrl+x`, `<leader>q`

### Default Keybinds

| Action | Default | Description |
|--------|---------|-------------|
| `leader` | `ctrl+x` | Leader key for sequences |
| `quit` | `ctrl+c`, `<leader>q` | Exit application |
| `back` | `escape` | Go back / cancel |
| `help` | `?` | Show help |
| `filter` | `<leader>/` | Open filter |
| `refresh` | `<leader>r` | Refresh data |
| `settings` | `<leader>,` | Open settings |
| `browser_open` | `<leader>o` | Open in browser |
| `profile_set` | `<leader>p` | Set profile |
| `region_set` | `<leader>r` | Set region |
| `role_list` | `<leader>l` | List roles |
| `profile_add` | `<leader>a` | Add profile |
| `profile_edit` | `<leader>e` | Edit profile |
| `profile_delete` | `<leader>d` | Delete profile |
| `nav_up` | `up`, `k` | Navigate up |
| `nav_down` | `down`, `j` | Navigate down |
| `nav_left` | `left`, `h` | Navigate left |
| `nav_right` | `right`, `l` | Navigate right |
| `nav_page_up` | `pageup`, `ctrl+u` | Page up |
| `nav_page_down` | `pagedown`, `ctrl+d` | Page down |
| `select` | `enter` | Select item |
| `command_list` | `ctrl+p` | Open command palette |

### Rebinding the Leader Key

The leader key can be changed like any other keybind:

```json
{
  "keybinds": {
    "leader": ["ctrl+space"]
  }
}
```

All keybinds using `<leader>` will automatically use the new leader key.

### Partial Overrides

You only need to specify keybinds you want to change. Unspecified keybinds keep their defaults:

```json
{
  "keybinds": {
    "quit": ["ctrl+q"],
    "filter": ["<leader>f", "/"]
  }
}
```

This changes only `quit` and `filter`, keeping all other keybinds at their defaults.
