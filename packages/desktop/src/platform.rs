use crate::{
    Accounts, Console, Credentials, EditSession, NewSession, Palette, Preferences, Quit, Refresh,
    Search, SetCredentials,
};
use gpui::{App, KeyBinding, Menu, MenuItem, SystemMenuType, Window, actions, px, rgb};
use gpui_component::{Theme, ThemeMode};

actions!(platform, [Hide, HideOthers, ShowAll, CloseWindow]);

pub fn apply_appearance(appearance: &str, window: Option<&mut Window>, cx: &mut App) {
    match appearance {
        "light" => Theme::change(ThemeMode::Light, window, cx),
        "dark" => Theme::change(ThemeMode::Dark, window, cx),
        _ => Theme::sync_system_appearance(window, cx),
    }
    let theme = Theme::global_mut(cx);
    theme.font_family = if cfg!(target_os = "macos") {
        ".SystemUIFont"
    } else if cfg!(target_os = "windows") {
        "Segoe UI"
    } else {
        "DejaVu Sans"
    }
    .into();
    theme.font_size = px(14.);
    theme.primary = rgb(if theme.is_dark() { 0x316daf } else { 0x245ea8 }).into();
    theme.primary_foreground = rgb(0xffffff).into();
}

pub fn shortcut(key: &str) -> String {
    format!(
        "{}-{key}",
        if cfg!(target_os = "macos") {
            "cmd"
        } else {
            "ctrl"
        }
    )
}

pub fn shortcut_label(key: &str) -> String {
    let key = if !cfg!(target_os = "macos") && key == "↵" {
        "Enter"
    } else {
        key
    };
    format!(
        "{}{key}",
        if cfg!(target_os = "macos") {
            "⌘"
        } else {
            "Ctrl+"
        }
    )
}

pub fn mono_font() -> &'static str {
    if cfg!(target_os = "macos") {
        return "Menlo";
    }
    if cfg!(target_os = "windows") {
        return "Consolas";
    }
    "monospace"
}

pub fn configure(cx: &mut App) {
    cx.on_action(|_: &Quit, cx| cx.quit());
    cx.bind_keys([
        KeyBinding::new(&shortcut("f"), Search, Some("Sesh")),
        KeyBinding::new(&shortcut("r"), Refresh, Some("Sesh")),
        KeyBinding::new(&shortcut("p"), Palette, Some("Sesh")),
        KeyBinding::new(&shortcut("k"), Palette, Some("Sesh")),
        KeyBinding::new(&shortcut("n"), NewSession, Some("Sesh")),
        KeyBinding::new(&shortcut("e"), EditSession, Some("Sesh")),
        KeyBinding::new(&shortcut("b"), Console, Some("Sesh")),
        KeyBinding::new(&shortcut("1"), Accounts, Some("Sesh")),
        KeyBinding::new(&shortcut("2"), Credentials, Some("Sesh")),
        KeyBinding::new(&shortcut(","), Preferences, Some("Sesh")),
        KeyBinding::new(&shortcut("enter"), SetCredentials, Some("Sesh")),
    ]);
    cx.bind_keys([KeyBinding::new(&shortcut("q"), Quit, None)]);
    cx.bind_keys([KeyBinding::new(&shortcut("w"), CloseWindow, Some("Sesh"))]);
    if cfg!(target_os = "macos") {
        cx.on_action(|_: &Hide, cx| cx.hide());
        cx.on_action(|_: &HideOthers, cx| cx.hide_other_apps());
        cx.on_action(|_: &ShowAll, cx| cx.unhide_other_apps());
        cx.bind_keys([
            KeyBinding::new("cmd-h", Hide, None),
            KeyBinding::new("alt-cmd-h", HideOthers, None),
        ]);
        cx.set_menus(vec![
            Menu {
                name: "Sesh".into(),
                items: vec![
                    MenuItem::action("Settings…", Preferences),
                    MenuItem::separator(),
                    MenuItem::os_submenu("Services", SystemMenuType::Services),
                    MenuItem::separator(),
                    MenuItem::action("Hide Sesh", Hide),
                    MenuItem::action("Hide Others", HideOthers),
                    MenuItem::action("Show All", ShowAll),
                    MenuItem::separator(),
                    MenuItem::action("Quit Sesh", Quit),
                ],
            },
            Menu {
                name: "File".into(),
                items: vec![
                    MenuItem::action("New SSO Session…", NewSession),
                    MenuItem::action("Edit SSO Session…", EditSession),
                    MenuItem::separator(),
                    MenuItem::action("Set Credentials", SetCredentials),
                    MenuItem::action("Open AWS Console", Console),
                    MenuItem::separator(),
                    MenuItem::action("Close Window", CloseWindow),
                ],
            },
            Menu {
                name: "Edit".into(),
                items: vec![
                    MenuItem::action("Undo", gpui_component::input::Undo),
                    MenuItem::action("Redo", gpui_component::input::Redo),
                    MenuItem::separator(),
                    MenuItem::action("Cut", gpui_component::input::Cut),
                    MenuItem::action("Copy", gpui_component::input::Copy),
                    MenuItem::action("Paste", gpui_component::input::Paste),
                    MenuItem::action("Select All", gpui_component::input::SelectAll),
                ],
            },
            Menu {
                name: "View".into(),
                items: vec![
                    MenuItem::action("Accounts", Accounts),
                    MenuItem::action("Active Credentials", Credentials),
                    MenuItem::separator(),
                    MenuItem::action("Find…", Search),
                    MenuItem::action("Refresh", Refresh),
                    MenuItem::action("Commands…", Palette),
                ],
            },
        ]);
    }
}
