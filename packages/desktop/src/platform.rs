use crate::{
    Accounts, Console, Credentials, EditSession, NewSession, Palette, Preferences, Quit, Refresh,
    Search, SetCredentials, ToggleSidebar,
};
use gpui::{
    App, KeyBinding, Menu, MenuItem, SystemMenuType, TitlebarOptions, Window,
    WindowBackgroundAppearance, actions, point, px, rgb,
};
use gpui_component::{Theme, ThemeMode};

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

pub fn wallpaper(_window: &Window) -> Option<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let screen = native_window(_window)?.screen()?;
        let url =
            objc2_app_kit::NSWorkspace::sharedWorkspace().desktopImageURLForScreen(&screen)?;
        return url
            .path()
            .map(|path| std::path::PathBuf::from(path.to_string()));
    }
    #[cfg(not(target_os = "macos"))]
    None
}

pub fn wallpaper_image(path: &std::path::Path) -> anyhow::Result<image::DynamicImage> {
    let result = image::ImageReader::open(path)?
        .with_guessed_format()?
        .decode();
    #[cfg(target_os = "macos")]
    if result.is_err() {
        use objc2::AnyThread;
        let filename = objc2_foundation::NSString::from_str(&path.to_string_lossy());
        let image = objc2_app_kit::NSImage::initWithContentsOfFile(
            objc2_app_kit::NSImage::alloc(),
            &filename,
        )
        .ok_or_else(|| anyhow::anyhow!("Cannot decode the desktop wallpaper"))?;
        let data = image
            .TIFFRepresentation()
            .ok_or_else(|| anyhow::anyhow!("Cannot rasterize the desktop wallpaper"))?;
        return Ok(image::load_from_memory_with_format(
            &data.to_vec(),
            image::ImageFormat::Tiff,
        )?);
    }
    Ok(result?)
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
            KeyBinding::new("alt-cmd-s", ToggleSidebar, Some("Sesh")),
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
