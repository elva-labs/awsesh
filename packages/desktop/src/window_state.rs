use std::{cell::RefCell, path::PathBuf};

use gpui::{Bounds, Pixels, Window, point, px, size};
use serde::{Deserialize, Serialize};

/// Window geometry persisted between launches, in logical pixels.
#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WindowState {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub maximized: bool,
}

impl WindowState {
    pub fn bounds(self) -> Bounds<Pixels> {
        Bounds {
            origin: point(px(self.x), px(self.y)),
            size: size(px(self.width), px(self.height)),
        }
    }
}

thread_local! {
    static CURRENT: RefCell<Option<WindowState>> = const { RefCell::new(None) };
}

/// Mirrors the SDK's config directory (`$XDG_CONFIG_HOME/awsesh`, else
/// `~/.config/awsesh`) so window state lives beside `desktop.json`.
fn directory() -> Option<PathBuf> {
    let base = match std::env::var_os("XDG_CONFIG_HOME").filter(|value| !value.is_empty()) {
        Some(value) => PathBuf::from(value),
        None => {
            let home = if cfg!(target_os = "windows") {
                std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))
            } else {
                std::env::var_os("HOME")
            }?;
            PathBuf::from(home).join(".config")
        }
    };
    Some(base.join("awsesh"))
}

fn path() -> Option<PathBuf> {
    directory().map(|directory| directory.join("window.json"))
}

pub fn load() -> Option<WindowState> {
    let text = std::fs::read_to_string(path()?).ok()?;
    serde_json::from_str(&text).ok()
}

fn write(state: WindowState) {
    let Some(file) = path() else {
        return;
    };
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let Ok(contents) = serde_json::to_string_pretty(&state) else {
        return;
    };
    let temporary = file.with_extension("json.tmp");
    if std::fs::write(&temporary, contents).is_ok() {
        let _ = std::fs::rename(&temporary, &file);
    }
}

/// Records the window's geometry. The windowed bounds are kept while maximized
/// so restoring later returns to the previous size.
pub fn note(window: &Window) {
    let maximized = window.is_maximized();
    CURRENT.with(|cell| {
        let mut current = cell.borrow_mut();
        if maximized {
            if let Some(state) = current.as_mut() {
                state.maximized = true;
            }
            return;
        }
        let bounds = window.bounds();
        *current = Some(WindowState {
            x: bounds.origin.x.into(),
            y: bounds.origin.y.into(),
            width: bounds.size.width.into(),
            height: bounds.size.height.into(),
            maximized: false,
        });
    });
}

/// Writes the last known geometry to disk.
pub fn persist() {
    let state = CURRENT.with(|cell| *cell.borrow());
    if let Some(state) = state {
        write(state);
    }
}
