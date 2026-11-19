use serde::{Deserialize, Serialize};
use std::{cell::RefCell, path::PathBuf};

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WindowState {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub maximized: bool,
}

thread_local! {
    static CURRENT: RefCell<Option<WindowState>> = const { RefCell::new(None) };
}

fn path() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                .or_else(|| std::env::var_os("HOME"))
                .map(|home| PathBuf::from(home).join(".config"))
        })?;
    Some(base.join("awsesh/window.json"))
}

pub fn load() -> Option<WindowState> {
    let state: WindowState = serde_json::from_str(&std::fs::read_to_string(path()?).ok()?).ok()?;
    [state.x, state.y, state.width, state.height]
        .iter()
        .all(|value| value.is_finite())
        .then_some(state)
}

pub fn restore_visible(window: &rune::WindowHandle) {
    let Some(placement) = window.placement() else {
        return;
    };
    let Some(((x, y), (width, height))) = placement.display else {
        return;
    };
    let (left, top) = placement.position;
    let intersects = i64::from(left) < i64::from(x) + i64::from(width)
        && i64::from(top) < i64::from(y) + i64::from(height)
        && i64::from(left) + i64::from(placement.content_size.0) > i64::from(x)
        && i64::from(top) + i64::from(placement.content_size.1) > i64::from(y);
    if !intersects {
        window.center();
    }
}

pub fn save(window: &rune::WindowHandle) {
    let Some(placement) = window.placement() else {
        return;
    };
    if placement.full_screen || placement.minimized {
        return;
    }
    let next = if placement.maximized {
        CURRENT.with(|current| {
            current.borrow().or_else(load).map(|state| WindowState {
                maximized: true,
                ..state
            })
        })
    } else {
        Some(WindowState {
            x: placement.position.0 as f32,
            y: placement.position.1 as f32,
            width: (f64::from(placement.content_size.0) / placement.scale) as f32,
            height: (f64::from(placement.content_size.1) / placement.scale) as f32,
            maximized: false,
        })
    };
    let Some(state) = next else { return };
    if CURRENT.with(|current| *current.borrow() == Some(state)) {
        return;
    }
    let Some(file) = path() else { return };
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let Ok(contents) = serde_json::to_string_pretty(&state) else {
        return;
    };
    let temporary = file.with_extension("json.tmp");
    if std::fs::write(&temporary, contents).is_ok() && std::fs::rename(temporary, file).is_ok() {
        CURRENT.with(|current| *current.borrow_mut() = Some(state));
    }
}
