use crate::{Command, Sesh};
use rune::{App, Chord, ChordKey, ChordMod, KeyEvent, MenuItem, Tx};
use std::collections::BTreeMap;

pub struct ShortcutDefinition {
    pub id: &'static str,
    pub label: &'static str,
    pub default: &'static str,
}

pub fn shortcuts() -> Vec<ShortcutDefinition> {
    [
        ("search", "Search the current list", "mod+f"),
        ("commands", "Open command bar", "mod+k"),
        (
            "commands_alternative",
            "Open command bar (alternative)",
            "mod+p",
        ),
        ("new_session", "Add an SSO session", "mod+n"),
        ("edit_session", "Edit the current session", "mod+e"),
        ("set_credentials", "Set credentials explicitly", "mod+enter"),
        ("console", "Open AWS Console", "mod+o"),
        ("pin_account", "Toggle account favorites", "mod+d"),
        ("accounts", "Accounts", "mod+1"),
        ("credentials", "Credentials", "mod+2"),
        ("refresh", "Refresh the current list", "mod+r"),
        ("settings", "Settings", "mod+,"),
        ("toggle_sidebar", "Toggle sidebar", "mod+b"),
    ]
    .into_iter()
    .map(|(id, label, default)| ShortcutDefinition { id, label, default })
    .collect()
}

pub fn normalize_shortcut(value: &str) -> String {
    let mut rest = value;
    let mut modifiers = Vec::new();
    loop {
        let next = [
            ("platform-", "mod"),
            ("cmd-", "super"),
            ("super-", "super"),
            ("ctrl-", "ctrl"),
            ("alt-", "alt"),
            ("shift-", "shift"),
        ]
        .into_iter()
        .find_map(|(prefix, modifier)| rest.strip_prefix(prefix).map(|tail| (modifier, tail)));
        let Some((modifier, tail)) = next else { break };
        modifiers.push(modifier);
        rest = tail;
    }
    if modifiers.is_empty() {
        return value.to_owned();
    }
    modifiers.push(match rest {
        "-" => "minus",
        "+" => "plus",
        _ => rest,
    });
    modifiers.join("+")
}

pub fn shortcut_value(
    definition: &ShortcutDefinition,
    overrides: &BTreeMap<String, String>,
) -> String {
    overrides
        .get(definition.id)
        .cloned()
        .unwrap_or_else(|| definition.default.into())
}

pub fn shortcut_label(id: &str, overrides: &BTreeMap<String, String>) -> String {
    shortcuts()
        .iter()
        .find(|definition| definition.id == id)
        .and_then(|definition| {
            Chord::parse(&normalize_shortcut(&shortcut_value(definition, overrides))).ok()
        })
        .map(|chord| chord.label())
        .unwrap_or_else(|| "Unassigned".into())
}

pub fn validate_shortcuts(
    overrides: &BTreeMap<String, String>,
) -> anyhow::Result<BTreeMap<String, String>> {
    let definitions = shortcuts();
    let mut normalized = BTreeMap::new();
    let reserved = [
        "mod+q",
        "mod+w",
        "mod+m",
        "mod+h",
        "mod+alt+h",
        "mod+a",
        "mod+c",
        "mod+x",
        "mod+v",
        "mod+z",
        "mod+shift+z",
        "ctrl+y",
    ];
    for (id, value) in overrides {
        let definition = definitions
            .iter()
            .find(|definition| definition.id == id)
            .ok_or_else(|| anyhow::anyhow!("Unknown shortcut action: {id}"))?;
        if value.is_empty() {
            normalized.insert(id.clone(), String::new());
            continue;
        }
        anyhow::ensure!(
            value.len() <= 64
                && !value
                    .chars()
                    .any(|character| character.is_whitespace() || character.is_control()),
            "Use a single key combination"
        );
        let chord = Chord::parse(&normalize_shortcut(value))?;
        anyhow::ensure!(
            chord.has(ChordMod::Primary)
                || chord.has(ChordMod::Ctrl)
                || chord.has(ChordMod::Alt)
                || chord.has(ChordMod::Super)
                || matches!(chord.key(), ChordKey::Function(_)),
            "Include Command, Control or Option/Alt, or use a function key"
        );
        anyhow::ensure!(
            !reserved
                .iter()
                .filter_map(|value| Chord::parse(value).ok())
                .any(|fixed| chord.same_keys(&fixed, rune::KeyPlatform::current())),
            "This shortcut is reserved for text editing or window controls"
        );
        if Chord::parse(definition.default)
            .is_ok_and(|default| chord.same_keys(&default, rune::KeyPlatform::current()))
        {
            continue;
        }
        normalized.insert(id.clone(), chord.to_string());
    }
    let mut assigned: Vec<(Chord, &str)> = vec![];
    for definition in &definitions {
        let value = shortcut_value(definition, &normalized);
        if value.is_empty() {
            continue;
        }
        let chord = Chord::parse(&normalize_shortcut(&value))?;
        if let Some((_, other)) = assigned
            .iter()
            .find(|(other, _)| chord.same_keys(other, rune::KeyPlatform::current()))
        {
            anyhow::bail!(
                "{} is assigned to both {other} and {}",
                chord.label(),
                definition.label
            );
        }
        assigned.push((chord, definition.label));
    }
    Ok(normalized)
}

pub fn shortcut_action(
    event: &KeyEvent,
    tx: &Tx,
    overrides: &BTreeMap<String, String>,
) -> Option<&'static str> {
    shortcuts()
        .into_iter()
        .find(|definition| {
            Chord::parse(&normalize_shortcut(&shortcut_value(definition, overrides)))
                .is_ok_and(|chord| chord.matches_tx(event, tx))
        })
        .map(|definition| definition.id)
}

pub fn command(id: &str) -> Option<Command> {
    Some(match id {
        "commands" | "commands_alternative" => Command::Palette,
        "new_session" => Command::NewSession,
        "edit_session" => Command::EditSession,
        "set_credentials" => Command::SetCredentials,
        "console" => Command::Console,
        "pin_account" => Command::TogglePin,
        "accounts" => Command::Accounts,
        "credentials" => Command::Credentials,
        "refresh" => Command::Refresh,
        "settings" => Command::Settings,
        "toggle_sidebar" => Command::ToggleSidebar,
        _ => return None,
    })
}

pub fn menu_items(overrides: &BTreeMap<String, String>) -> Vec<MenuItem<Sesh>> {
    let mut items = vec![];
    for (title, menu, id, action) in [
        ("Settings…", "", "settings", Command::Settings),
        (
            "New SSO Session…",
            "File",
            "new_session",
            Command::NewSession,
        ),
        (
            "Edit SSO Session…",
            "File",
            "edit_session",
            Command::EditSession,
        ),
        (
            "Set Credentials",
            "File",
            "set_credentials",
            Command::SetCredentials,
        ),
        ("Open AWS Console", "File", "console", Command::Console),
        ("Accounts", "View", "accounts", Command::Accounts),
        (
            "Active Credentials",
            "View",
            "credentials",
            Command::Credentials,
        ),
        (
            "Toggle Sidebar",
            "View",
            "toggle_sidebar",
            Command::ToggleSidebar,
        ),
        ("Refresh", "View", "refresh", Command::Refresh),
        ("Commands…", "View", "commands", Command::Palette),
    ] {
        let handler: fn(&mut Sesh, &mut Tx) = match action {
            Command::Settings => |s, tx| s.dispatch(Command::Settings, tx),
            Command::NewSession => |s, tx| s.dispatch(Command::NewSession, tx),
            Command::EditSession => |s, tx| s.dispatch(Command::EditSession, tx),
            Command::SetCredentials => |s, tx| s.dispatch(Command::SetCredentials, tx),
            Command::Console => |s, tx| s.dispatch(Command::Console, tx),
            Command::Accounts => |s, tx| s.dispatch(Command::Accounts, tx),
            Command::Credentials => |s, tx| s.dispatch(Command::Credentials, tx),
            Command::ToggleSidebar => |s, tx| s.dispatch(Command::ToggleSidebar, tx),
            Command::Refresh => |s, tx| s.dispatch(Command::Refresh, tx),
            _ => |s, tx| s.dispatch(Command::Palette, tx),
        };
        let mut item = MenuItem::new(title, handler).keys_first();
        if !menu.is_empty() {
            item = item.menu(menu);
        }
        if let Some(definition) = shortcuts().iter().find(|definition| definition.id == id)
            && let Ok(shortcut) =
                normalize_shortcut(&shortcut_value(definition, overrides)).parse::<rune::Shortcut>()
        {
            item = item.key_equivalent(shortcut);
        }
        items.push(item);
    }
    let mut find = MenuItem::new("Find…", |_: &mut Sesh, tx| {
        tx.focus("account-search", true)
    })
    .menu("View")
    .keys_first();
    if let Some(definition) = shortcuts()
        .iter()
        .find(|definition| definition.id == "search")
        && let Ok(shortcut) =
            normalize_shortcut(&shortcut_value(definition, overrides)).parse::<rune::Shortcut>()
    {
        find = find.key_equivalent(shortcut);
    }
    items.push(find);
    items
}

pub fn menus(mut app: App<Sesh>) -> App<Sesh> {
    if !cfg!(target_os = "macos") {
        return app;
    }
    for item in menu_items(&BTreeMap::new()) {
        app = app.menu_item(item);
    }
    app
}

pub fn reveal_directory(path: &str) -> anyhow::Result<()> {
    let mut command = if cfg!(target_os = "macos") {
        std::process::Command::new("open")
    } else if cfg!(target_os = "windows") {
        std::process::Command::new("explorer.exe")
    } else {
        std::process::Command::new("xdg-open")
    };
    command.arg(path).spawn()?;
    Ok(())
}

pub fn apply_window_appearance(
    window: &rune::WindowHandle,
    mode: &str,
    dark: bool,
    translucent: bool,
) {
    #[cfg(target_os = "macos")]
    {
        use objc2::runtime::AnyObject;
        use objc2_app_kit::{
            NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua,
            NSAppearanceNameDarkAqua, NSView,
        };
        use raw_window_handle::RawWindowHandle;
        thread_local! {
            static APPEARANCE: std::cell::RefCell<Option<(usize, String)>> = const { std::cell::RefCell::new(None) };
        }
        let _ = window.with_raw_handle(|raw| {
            let RawWindowHandle::AppKit(handle) = raw.as_raw() else {
                return;
            };
            let identity = handle.ns_view.as_ptr().addr();
            if APPEARANCE.with(|current| {
                current
                    .borrow()
                    .as_ref()
                    .is_some_and(|(id, applied)| *id == identity && applied == mode)
            }) {
                return;
            }
            // AppKit's borrowed NSView is valid for this callback on Rune's UI thread.
            let object = unsafe { handle.ns_view.cast::<AnyObject>().as_ref() };
            let Some(native) = object.downcast_ref::<NSView>().and_then(NSView::window) else {
                return;
            };
            let appearance = match mode {
                "dark" => NSAppearance::appearanceNamed(unsafe { NSAppearanceNameDarkAqua }),
                "light" => NSAppearance::appearanceNamed(unsafe { NSAppearanceNameAqua }),
                _ => None,
            };
            native.setAppearance(appearance.as_deref());
            APPEARANCE.with(|current| *current.borrow_mut() = Some((identity, mode.to_owned())));
        });
    }
    #[cfg(windows)]
    {
        use raw_window_handle::RawWindowHandle;
        use windows_sys::Win32::Graphics::Dwm::{
            DwmExtendFrameIntoClientArea, DwmSetWindowAttribute,
        };
        use windows_sys::Win32::UI::Controls::MARGINS;
        thread_local! {
            static APPLIED: std::cell::Cell<Option<(isize, bool, bool)>> = const { std::cell::Cell::new(None) };
        }
        let _ = window.with_raw_handle(|raw| {
            let RawWindowHandle::Win32(handle) = raw.as_raw() else {
                return;
            };
            let configuration = (handle.hwnd.get(), dark, translucent);
            if APPLIED.with(|current| current.get() == Some(configuration)) {
                return;
            }
            let hwnd = handle.hwnd.get() as windows_sys::Win32::Foundation::HWND;
            let theme = i32::from(dark);
            let backdrop: i32 = if translucent { 3 } else { 1 };
            let margin = if translucent { -1 } else { 0 };
            let margins = MARGINS {
                cxLeftWidth: margin,
                cxRightWidth: margin,
                cyTopHeight: margin,
                cyBottomHeight: margin,
            };
            // The HWND is borrowed from the live Rune window on its UI thread.
            unsafe {
                DwmSetWindowAttribute(hwnd, 20, std::ptr::from_ref(&theme).cast(), 4);
                DwmSetWindowAttribute(hwnd, 38, std::ptr::from_ref(&backdrop).cast(), 4);
                DwmExtendFrameIntoClientArea(hwnd, &margins);
            }
            APPLIED.with(|current| current.set(Some(configuration)));
        });
    }
    #[cfg(not(windows))]
    let _ = (window, mode, dark, translucent);
}

pub fn configure_window(window: &rune::WindowHandle) {
    #[cfg(windows)]
    {
        use raw_window_handle::RawWindowHandle;
        use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            IMAGE_ICON, LR_DEFAULTSIZE, LR_SHARED, LoadImageW, SendMessageW, WM_SETICON,
        };
        let _ = window.with_raw_handle(|raw| {
            let RawWindowHandle::Win32(handle) = raw.as_raw() else {
                return;
            };
            let hwnd = handle.hwnd.get() as windows_sys::Win32::Foundation::HWND;
            // Resource 1 is embedded by build.rs; LR_SHARED leaves its lifetime with Windows.
            unsafe {
                let module = GetModuleHandleW(std::ptr::null());
                let icon = LoadImageW(
                    module,
                    std::ptr::without_provenance(1),
                    IMAGE_ICON,
                    0,
                    0,
                    LR_DEFAULTSIZE | LR_SHARED,
                );
                if !icon.is_null() {
                    SendMessageW(hwnd, WM_SETICON, 1, icon as isize);
                    SendMessageW(hwnd, WM_SETICON, 0, icon as isize);
                }
            }
        });
    }
    #[cfg(not(windows))]
    let _ = window;
}
