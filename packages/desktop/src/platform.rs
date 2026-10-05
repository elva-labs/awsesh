use crate::{
    Accounts, Console, Credentials, EditSession, NewSession, Palette, Preferences, Quit, Refresh,
    Search, SetCredentials, ToggleSidebar,
};
use gpui::{
    Action, App, KeyBinding, Keystroke, Menu, MenuItem, SystemMenuType, TitlebarOptions, Window,
    WindowBackgroundAppearance, actions, point, px, rgb,
};
use gpui_component::{Theme, ThemeMode};
use std::{collections::BTreeMap, rc::Rc};

actions!(platform, [Hide, HideOthers, ShowAll, CloseWindow]);

pub fn titlebar_options() -> TitlebarOptions {
    TitlebarOptions {
        title: Some("Sesh".into()),
        appears_transparent: cfg!(target_os = "macos"),
        traffic_light_position: cfg!(target_os = "macos").then(|| point(px(18.), px(14.))),
    }
}

pub fn apply_window_background(translucent: bool, window: &Window) {
    window.set_background_appearance(if translucent {
        WindowBackgroundAppearance::Blurred
    } else {
        WindowBackgroundAppearance::Opaque
    });
    #[cfg(target_os = "macos")]
    if translucent {
        use objc2_app_kit::{
            NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectView,
        };
        let Some(content) = native_window(window).and_then(|window| window.contentView()) else {
            return;
        };
        for child in content.subviews() {
            if child.class().name().to_bytes() != b"BlurredView" {
                continue;
            }
            if let Some(effect) = child.downcast_ref::<NSVisualEffectView>() {
                effect.setMaterial(NSVisualEffectMaterial::UnderWindowBackground);
                effect.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn native_window(window: &Window) -> Option<objc2::rc::Retained<objc2_app_kit::NSWindow>> {
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSView;
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    let handle = HasWindowHandle::window_handle(window).ok()?;
    let RawWindowHandle::AppKit(handle) = handle.as_raw() else {
        return None;
    };
    let object = unsafe { handle.ns_view.cast::<AnyObject>().as_ref() };
    object.downcast_ref::<NSView>()?.window()
}

pub fn start_window_move(window: &Window) {
    #[cfg(target_os = "macos")]
    {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSApplication;

        let Some(thread) = MainThreadMarker::new() else {
            return;
        };
        if let Some(native) = native_window(window)
            && let Some(event) = NSApplication::sharedApplication(thread).currentEvent()
        {
            native.performWindowDragWithEvent(&event);
        }
    }
    #[cfg(not(target_os = "macos"))]
    window.start_window_move();
}

pub fn configure_window(_window: &Window) {
    #[cfg(target_os = "macos")]
    {
        use objc2::{
            runtime::{AnyClass, AnyObject, ClassBuilder, Sel},
            sel,
        };
        use objc2_app_kit::NSView;
        use objc2_foundation::NSRect;

        unsafe extern "C-unwind" fn titlebar_content(view: *mut NSView, _: Sel) -> NSRect {
            unsafe { (*view).bounds() }
        }

        let Some(content) = native_window(_window).and_then(|window| window.contentView()) else {
            return;
        };
        for view in content.subviews() {
            if view.class().name().to_bytes() != b"GPUIView" {
                continue;
            }
            let class = AnyClass::get(c"SeshContentView").or_else(|| {
                let mut class = ClassBuilder::new(c"SeshContentView", view.class())?;
                let implementation: unsafe extern "C-unwind" fn(*mut NSView, Sel) -> NSRect =
                    titlebar_content;
                unsafe {
                    class.add_method(sel!(_opaqueRectForWindowMoveWhenInTitlebar), implementation);
                }
                Some(class.register())
            });
            if let Some(class) = class {
                unsafe { AnyObject::set_class(&view, class) };
            }
        }
    }
}

pub fn reduced_motion() -> bool {
    #[cfg(target_os = "macos")]
    return objc2_app_kit::NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion();
    #[cfg(not(target_os = "macos"))]
    false
}

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
    let dark = theme.is_dark();
    theme.background = rgb(if dark { 0x1c1e22 } else { 0xffffff }).into();
    theme.sidebar = rgb(if dark { 0x24262b } else { 0xf3f4f6 }).into();
    theme.border = rgb(if dark { 0x34373d } else { 0xe3e5e9 }).into();
    theme.foreground = rgb(if dark { 0xe9ebef } else { 0x20242c }).into();
    theme.muted_foreground = rgb(if dark { 0xa1a6b0 } else { 0x6d7480 }).into();
    theme.list_active = rgb(if dark { 0x253e5d } else { 0xe8f0fc }).into();
    theme.link = rgb(if dark { 0x83b9ff } else { 0x245ea8 }).into();
    theme.success = rgb(if dark { 0x68c99e } else { 0x23825c }).into();
    theme.warning = rgb(if dark { 0xe6b566 } else { 0xa66a16 }).into();
    theme.magenta = rgb(if dark { 0xbda0ed } else { 0x8252b3 }).into();
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

pub struct Shortcut {
    pub id: &'static str,
    pub label: &'static str,
    pub default: String,
    action: Box<dyn Action>,
}

impl Shortcut {
    pub fn value<'a>(&'a self, overrides: &'a BTreeMap<String, String>) -> &'a str {
        overrides
            .get(self.id)
            .map(String::as_str)
            .unwrap_or(&self.default)
    }
}

pub fn shortcuts() -> Vec<Shortcut> {
    fn entry(
        id: &'static str,
        label: &'static str,
        default: String,
        action: impl Action,
    ) -> Shortcut {
        Shortcut {
            id,
            label,
            default,
            action: Box::new(action),
        }
    }
    vec![
        entry("search", "Search the current list", shortcut("f"), Search),
        entry("commands", "Open command bar", shortcut("k"), Palette),
        entry(
            "commands_alternative",
            "Open command bar (alternative)",
            shortcut("p"),
            Palette,
        ),
        entry(
            "new_session",
            "Add an SSO session",
            shortcut("n"),
            NewSession,
        ),
        entry(
            "edit_session",
            "Edit the current session",
            shortcut("e"),
            EditSession,
        ),
        entry(
            "set_credentials",
            "Set credentials explicitly",
            shortcut("enter"),
            SetCredentials,
        ),
        entry("console", "Open AWS Console", shortcut("o"), Console),
        entry("accounts", "Accounts", shortcut("1"), Accounts),
        entry("credentials", "Credentials", shortcut("2"), Credentials),
        entry(
            "refresh",
            "Refresh the current list",
            shortcut("r"),
            Refresh,
        ),
        entry("settings", "Settings", shortcut(","), Preferences),
        entry(
            "toggle_sidebar",
            "Toggle sidebar",
            shortcut("b"),
            ToggleSidebar,
        ),
    ]
}

pub fn shortcut_label(id: &str, overrides: &BTreeMap<String, String>) -> String {
    shortcuts()
        .into_iter()
        .find(|shortcut| shortcut.id == id)
        .filter(|shortcut| !shortcut.value(overrides).is_empty())
        .and_then(|shortcut| Keystroke::parse(shortcut.value(overrides)).ok())
        .map(|stroke| gpui_component::kbd::Kbd::format(&stroke))
        .unwrap_or_else(|| "Unassigned".into())
}

pub fn validate_shortcuts(
    overrides: &BTreeMap<String, String>,
    fixed: &[KeyBinding],
) -> anyhow::Result<BTreeMap<String, String>> {
    let definitions = shortcuts();
    let mut normalized = BTreeMap::new();
    for (id, value) in overrides {
        let definition = definitions
            .iter()
            .find(|shortcut| shortcut.id == id)
            .ok_or_else(|| anyhow::anyhow!("Unknown shortcut action: {id}"))?;
        if value.is_empty() {
            normalized.insert(id.clone(), String::new());
            continue;
        }
        if value.len() > 64 || value.chars().any(char::is_whitespace) {
            anyhow::bail!("Use a single key combination");
        }
        let stroke = Keystroke::parse(value)?;
        let function = stroke
            .key
            .strip_prefix('f')
            .and_then(|key| key.parse::<u8>().ok())
            .is_some_and(|key| (1..=24).contains(&key));
        if !((stroke.key.chars().count() == 1 && !stroke.key.chars().any(char::is_control))
            || function
            || matches!(
                stroke.key.as_str(),
                "enter"
                    | "space"
                    | "tab"
                    | "escape"
                    | "backspace"
                    | "delete"
                    | "left"
                    | "right"
                    | "up"
                    | "down"
                    | "home"
                    | "end"
                    | "pageup"
                    | "pagedown"
            ))
        {
            anyhow::bail!("Unsupported shortcut key");
        }
        if !(stroke.modifiers.control
            || stroke.modifiers.platform
            || stroke.modifiers.alt
            || function)
        {
            anyhow::bail!("Include Command, Control or Option/Alt, or use a function key");
        }
        if stroke == Keystroke::parse(&definition.default)? {
            continue;
        }
        if fixed.iter().any(|binding| {
            binding.keystrokes().len() == 1 && binding.keystrokes()[0].inner() == &stroke
        }) {
            anyhow::bail!("This shortcut is reserved for text editing or window controls");
        }
        normalized.insert(id.clone(), stroke.unparse());
    }
    let mut assigned = BTreeMap::new();
    for definition in definitions {
        let value = definition.value(&normalized);
        if value.is_empty() {
            continue;
        }
        let stroke = Keystroke::parse(value)?;
        if let Some(label) = assigned.insert(stroke.unparse(), definition.label) {
            anyhow::bail!(
                "{} is assigned to both {label} and {}",
                gpui_component::kbd::Kbd::format(&stroke),
                definition.label
            );
        }
    }
    Ok(normalized)
}

pub fn shortcut_bindings(overrides: &BTreeMap<String, String>) -> anyhow::Result<Vec<KeyBinding>> {
    let context = Rc::new(gpui::KeyBindingContextPredicate::parse("Sesh")?);
    let mut bindings = Vec::new();
    for definition in shortcuts() {
        let value = definition.value(overrides).to_owned();
        if value.is_empty() {
            continue;
        }
        bindings.push(KeyBinding::load(
            &value,
            definition.action,
            Some(context.clone()),
            false,
            None,
            &gpui::DummyKeyboardMapper,
        )?);
    }
    Ok(bindings)
}

pub fn apply_shortcuts(
    overrides: &BTreeMap<String, String>,
    fixed: &[KeyBinding],
    cx: &mut App,
) -> anyhow::Result<()> {
    let bindings = shortcut_bindings(overrides)?;
    cx.clear_key_bindings();
    cx.bind_keys(fixed.iter().cloned());
    cx.bind_keys(bindings);
    configure_menus(cx);
    Ok(())
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
    }
}

fn configure_menus(cx: &mut App) {
    if cfg!(target_os = "macos") {
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
                    MenuItem::action("Toggle Sidebar", ToggleSidebar),
                    MenuItem::separator(),
                    MenuItem::action("Find…", Search),
                    MenuItem::action("Refresh", Refresh),
                    MenuItem::action("Commands…", Palette),
                ],
            },
        ]);
    }
}
