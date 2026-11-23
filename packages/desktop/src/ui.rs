use crate::{
    AccountDrag, Command, ContextMenu, Entry, Screen, Sesh, platform, select, shared_group,
};
use rune::{Color, Cx, El, Icon, Key, Phase, ScrollSpec, TextStyle, col, el, icon, row, text};
use rune_kit::{
    Button, ButtonVariant, Combobox, ComboboxOption, ControlSize, Kit, Menu, MenuItem,
    ShortcutRecorder, TextInput,
};
use serde_json::json;
use std::{borrow::Cow, rc::Rc};

const HEADER: f32 = 40.;
const CONTROL_HEIGHT: f32 = 36.;
const CONTROL_HOVER_STRENGTH: f32 = 0.055;
const BODY: TextStyle = TextStyle::new(14., 400.);
const SMALL: TextStyle = TextStyle::new(12., 400.);
const LABEL: TextStyle = TextStyle::new(14., 600.);
const TITLE: TextStyle = TextStyle::new(20., 600.);

struct AccountSection {
    group: Option<String>,
    heading: Option<(usize, bool)>,
    accounts: Vec<(usize, usize)>,
}

static BUILDING: Icon = Icon {
    name: "organization",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="7" y="3" width="11" height="18" rx="2"/><path d="M7 10H4v11h17V10h-3M10 7h5m-5 4h5m-5 4h5m-5 4h5"/></g>"#,
};
static SIDEBAR: Icon = Icon {
    name: "sidebar",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></g>"#,
};
static SEARCH: Icon = Icon {
    name: "search",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></g>"#,
};
static SETTINGS: Icon = Icon {
    name: "settings",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m9 3 1-2h4l1 2 3 2 3 1v4l-2 2 1 3-1 3-3 1-2 3h-4l-2-3-3-1-1-3 1-3-2-2V6l3-1z"/><circle cx="12" cy="11" r="3"/></g>"#,
};
static STAR: Icon = Icon {
    name: "favorite",
    view: 24.,
    body: r#"<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>"#,
};
static FOLDER: Icon = Icon {
    name: "group",
    view: 24.,
    body: r#"<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>"#,
};
static TERMINAL: Icon = Icon {
    name: "credentials",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 8 3 3-3 3m6 0h4"/></g>"#,
};
static REFRESH: Icon = Icon {
    name: "refresh",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 10a8 8 0 1 1 0 5M4 3v7h7"/></g>"#,
};
static PLUS: Icon = Icon {
    name: "add",
    view: 24.,
    body: r#"<path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" stroke-width="1.7"/>"#,
};
static MORE: Icon = Icon {
    name: "more",
    view: 24.,
    body: r#"<g fill="currentColor"><circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/></g>"#,
};
static EXTERNAL: Icon = Icon {
    name: "external",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="M13 3h8v8m0-8L11 13M9 5H3v16h16v-6"/></g>"#,
};
static SIGNED_OUT: Icon = Icon {
    name: "signed-out",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></g>"#,
};

static CHECK: Icon = Icon {
    name: "authenticated",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></g>"#,
};
static REMOVE: Icon = Icon {
    name: "remove",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></g>"#,
};
static CLEAR_ALL: Icon = Icon {
    name: "clear-all",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 5h18M3 10h11M3 15h7m5 0 6 6m0-6-6 6"/></g>"#,
};
static SIGN_IN: Icon = Icon {
    name: "sign-in",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3h7v18h-7M3 12h13m-5-5 5 5-5 5"/></g>"#,
};
static SIGN_OUT: Icon = Icon {
    name: "sign-out",
    view: 24.,
    body: r#"<g fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 3H3v18h7m-1-9h12m-5-5 5 5-5 5"/></g>"#,
};
static CLOSE: Icon = Icon {
    name: "clear-selection",
    view: 24.,
    body: r#"<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.7"/>"#,
};

fn copy_value(key: &str, value: &str, style: TextStyle, c: &crate::theme::Colors) -> El {
    let copied = value.to_owned();
    row()
        .key(key)
        .min_w(0.)
        .center_y()
        .radius(4.)
        .hover(c.text.alpha(0.05))
        .role("button")
        .label(format!("Copy {value}"))
        .help(format!("Click to copy: {value}"))
        .focusable(true)
        .focus_ring(2., 1., c.accent)
        .child(text(value).font(style).color(c.text).truncate())
        .on_press_tx(move |s: &mut Sesh, tx| s.dispatch(Command::CopyText(copied.clone()), tx))
}

fn detail_row(key: &str, title: &str, value: &str, c: &crate::theme::Colors) -> El {
    row()
        .w_full()
        .min_h(28.)
        .gap(12.)
        .center_y()
        .child(label(title, c.muted))
        .child(el().grow(1.))
        .child(copy_value(key, value, BODY, c).shrink())
}

fn inspector_heading(key: &str, title: &str, c: &crate::theme::Colors) -> El {
    row()
        .key("inspector-heading")
        .h(HEADER)
        .w_full()
        .center_y()
        .window_drag()
        .child(copy_value(key, title, TextStyle::new(16., 600.), c).grow(1.))
}

fn credential_toolbar(s: &Sesh, c: &crate::theme::Colors) -> El {
    let count = s.selected_credentials().len();
    row()
        .key("credential-toolbar")
        .grow(1.)
        .min_w(0.)
        .center_y()
        .gap(8.)
        .child(text("Active credentials").font(LABEL).color(c.text))
        .children((count > 0).then(|| {
            row()
                .key("credential-selection")
                .gap(4.)
                .center_y()
                .child(small(format!("{count} selected"), c.text))
                .child(icon_button(
                    "clear-credential-selection",
                    "Clear selection",
                    &CLOSE,
                    Command::ClearSelection,
                    c,
                ))
                .child(
                    icon_button(
                        "clear-selected-credentials",
                        "Remove selected credentials",
                        &REMOVE,
                        Command::RemoveSelectedCredentials,
                        c,
                    )
                    .disabled(s.busy()),
                )
        }))
        .child(el().grow(1.))
        .child(
            small(s.data.credentials.len().to_string(), c.muted).help("Active credential profiles"),
        )
        .child(
            icon_button(
                "clear-all-credentials",
                "Clear all credentials",
                &CLEAR_ALL,
                Command::ClearAllCredentials,
                c,
            )
            .disabled(s.data.credentials.is_empty() || s.busy()),
        )
}

fn switch(key: &str, title: &str, checked: bool, command: Command, c: &crate::theme::Colors) -> El {
    row()
        .key(key)
        .gap(12.)
        .center_y()
        .role("switch")
        .label(title)
        .checked(checked)
        .focusable(true)
        .focus_ring(2., 2., c.accent)
        .on_press_tx(move |s: &mut Sesh, tx| s.dispatch(command.clone(), tx))
        .child(
            el().size(34., 20.)
                .radius(10.)
                .fill(if checked { c.accent } else { c.element })
                .border(1., if checked { c.accent } else { c.border })
                .child(
                    el().key(format!("{key}-knob"))
                        .size(14., 14.)
                        .radius(7.)
                        .fill(if checked { Color::WHITE } else { c.muted })
                        .absolute(if checked { 17. } else { 3. }, 3.)
                        .motion(rune::tok::motion::SNAPPY),
                ),
        )
        .child(label(title, c.text))
}

fn external_link(key: &str, title: &str, url: &'static str, c: &crate::theme::Colors) -> El {
    row()
        .key(key)
        .h(30.)
        .gap(6.)
        .center_y()
        .focusable(true)
        .role("link")
        .label(title)
        .help(url)
        .hover(c.text.alpha(0.05))
        .radius(5.)
        .px(6.)
        .child(label(title, c.info))
        .child(icon(&EXTERNAL, 13.).color(c.info))
        .on_press_tx(move |s: &mut Sesh, tx| s.open_url(url, tx))
}

fn label(value: impl Into<String>, color: Color) -> El {
    text(value).font(BODY).color(color).truncate()
}
fn small(value: impl Into<String>, color: Color) -> El {
    text(value).font(SMALL).color(color).truncate()
}
fn divider(color: Color) -> El {
    el().w_full().h(1.).fill(color)
}

fn button(
    key: impl Into<String>,
    title: impl Into<String>,
    command: Command,
    c: &crate::theme::Colors,
) -> El {
    let title = title.into();
    row()
        .key(key)
        .h(CONTROL_HEIGHT)
        .px(12.)
        .gap(8.)
        .center()
        .radius(6.)
        .fill(c.element)
        .hover(Color::BLACK.alpha(CONTROL_HOVER_STRENGTH))
        .press(Color::BLACK.alpha(0.08))
        .role("button")
        .label(&title)
        .focusable(true)
        .focus_ring(2., 1., c.accent)
        .child(label(title, c.text))
        .on_press_tx(move |s: &mut Sesh, tx| s.dispatch(command.clone(), tx))
}

fn icon_button(
    key: &str,
    title: &str,
    glyph: &'static Icon,
    command: Command,
    c: &crate::theme::Colors,
) -> El {
    row()
        .key(key)
        .size(24., 26.)
        .center()
        .radius(5.)
        .hover(Color::BLACK.alpha(CONTROL_HOVER_STRENGTH))
        .press(Color::BLACK.alpha(0.08))
        .focusable(true)
        .role("button")
        .label(title)
        .help(title)
        .focus_ring(2., 1., c.accent)
        .child(icon(glyph, 16.).color(c.muted))
        .on_press_tx(move |s: &mut Sesh, tx| s.dispatch(command.clone(), tx))
}

fn dropdown_trigger(
    title: &str,
    show_chevron: bool,
    muted: bool,
    k: &Kit,
    c: &crate::theme::Colors,
) -> El {
    row()
        .h(CONTROL_HEIGHT)
        .px(12.)
        .gap(8.)
        .center_y()
        .radius(6.)
        .fill(c.element)
        .border(1., c.border)
        .child(label(title, if muted { c.muted } else { c.text }).grow(1.).min_w(0.))
        .children(show_chevron.then(|| icon(k.glyph.chevron_down, 14.).color(c.muted)))
}

fn disabled_button(
    key: &str,
    title: &str,
    command: Command,
    disabled: bool,
    c: &crate::theme::Colors,
) -> El {
    let control = button(key, title, command, c).w_full();
    if disabled {
        control.disabled(true).inert().opacity(0.4)
    } else {
        control
    }
}

fn session_actions(name: &str, authenticated: bool) -> Vec<(String, Command)> {
    [
        (
            if authenticated {
                "Sign out…"
            } else {
                "Sign in"
            },
            if authenticated {
                Command::SignOut
            } else {
                Command::Login
            },
        ),
        ("Edit session…", Command::EditSession),
        ("Open SSO portal", Command::Portal),
        ("Delete session…", Command::DeleteSession),
    ]
    .into_iter()
    .map(|(label, command)| {
        (
            label.into(),
            Command::SessionAction(name.into(), Box::new(command)),
        )
    })
    .collect()
}

fn account_actions(s: &Sesh, id: &str) -> Vec<(String, Command)> {
    let mut items = vec![
        ("Set credentials".into(), Command::SetCredentials),
        ("Open AWS Console".into(), Command::Console),
        ("Copy account ID".into(), Command::CopyAccount),
        ("Copy account name".into(), Command::CopyName),
        ("Toggle favorite".into(), Command::TogglePin),
        ("New group…".into(), Command::NewGroup),
    ];
    items.extend(
        s.groups()
            .iter()
            .cloned()
            .map(|group| (format!("Move to {group}"), Command::SetGroup(Some(group)))),
    );
    items.push(("Remove from group".into(), Command::SetGroup(None)));
    items
        .into_iter()
        .map(|(label, command)| {
            (
                label,
                Command::AccountAction(id.to_owned(), Box::new(command)),
            )
        })
        .collect()
}

fn toolbar(s: &Sesh, cx: &Cx<Sesh>, c: &crate::theme::Colors) -> El {
    let native_inset = if cfg!(target_os = "macos") && cx.titlebar_inset() > 0. {
        82.
    } else {
        0.
    };
    let capsule_width = native_inset + 60.;
    let open = s.appearance.sidebar_visible;
    let clearance = if open {
        (s.appearance.sidebar_width - capsule_width + 4.).max(16.)
    } else {
        16.
    };
    let mut status = row()
        .key("organization-toolbar")
        .center_y()
        .gap(12.)
        .grow(1.)
        .min_w(0.);
    if s.screen == Screen::Accounts {
        status = status.child(
            label(s.data.session.as_deref().unwrap_or("Sesh"), c.text)
                .grow(1.)
                .min_w(0.),
        );
        if s.data.session.is_some() {
            status = status.child(icon_button(
                "toolbar-login",
                if s.authenticated() {
                    "Sign out"
                } else {
                    "Sign in"
                },
                if s.authenticated() {
                    &SIGN_OUT
                } else {
                    &SIGN_IN
                },
                if s.authenticated() {
                    Command::SignOut
                } else {
                    Command::Login
                },
                c,
            ));
            let items = session_actions(s.data.session.as_deref().unwrap_or(""), s.authenticated());
            let point = cx
                .window_layout("session-menu")
                .map(|rect| rune::PointerPress {
                    x: rect[0],
                    y: rect[1] + rect[3] + 4.,
                })
                .unwrap_or(rune::PointerPress { x: 400., y: HEADER });
            status = status.child(
                row()
                    .key("session-menu")
                    .size(20., 26.)
                    .center()
                    .radius(5.)
                    .role("button")
                    .label("Organization actions")
                    .focusable(true)
                    .help("Organization actions")
                    .hover(c.text.alpha(0.07))
                    .child(icon(&MORE, 16.).color(c.muted))
                    .on_press(move |s: &mut Sesh| {
                        s.context_menu = Some(ContextMenu {
                            point,
                            items: items.clone(),
                        });
                    }),
            );
        }
    } else if s.screen == Screen::Settings {
        status = status.child(label("Settings", c.text));
    } else {
        status = credential_toolbar(s, c);
    }
    if s.screen == Screen::Accounts {
        status = status.child(icon_button(
            "toolbar-refresh",
            "Refresh",
            &REFRESH,
            Command::Refresh,
            c,
        ));
    }
    row()
        .key("window-toolbar")
        .motion(rune::tok::motion::SNAPPY)
        .pin(
            Some(0.),
            Some(0.),
            Some(if s.screen == Screen::Settings {
                0.
            } else {
                345.
            }),
            None,
        )
        .h(HEADER)
        .px(8.)
        .pt(4.)
        .center_y()
        .window_drag()
        .pr(if s.screen == Screen::Settings {
            cx.chrome_insets().trailing + 8.
        } else {
            8.
        })
        .child(
            row()
                .key("titlebar-island")
                .w(capsule_width)
                .h(32.)
                .center_y()
                .px(6.)
                .gap(2.)
                .child(
                    el().key("island-background")
                        .pin(Some(0.), Some(0.), Some(0.), Some(0.))
                        .radius(12.)
                        .fill(c.element)
                        .border(1., c.border.alpha(0.55))
                        .shadow(2., 7., Color::BLACK.alpha(0.24))
                        .opacity(if open { 0. } else { 1. })
                        .motion(rune::tok::motion::SNAPPY)
                        .inert(),
                )
                .child(el().key("native-control-clearance").w(native_inset).h(26.))
                .child(
                    icon_button(
                        "toolbar-sidebar",
                        "Toggle sidebar",
                        &SIDEBAR,
                        Command::ToggleSidebar,
                        c,
                    )
                    .expanded(open),
                )
                .child(
                    icon_button("toolbar-commands", "Commands", &SEARCH, Command::Palette, c).help(
                        format!(
                            "Commands · {}",
                            platform::shortcut_label("commands", &s.appearance.shortcuts)
                        ),
                    ),
                ),
        )
        .child(
            el().key("toolbar-clearance")
                .w(clearance)
                .motion(rune::tok::motion::SNAPPY),
        )
        .child(status)
}

fn sidebar_item(key: impl Into<String>, title: &str, selected: bool, c: &crate::theme::Colors) -> El {
    row()
        .key(key)
        .w_full()
        .h(36.)
        .px(10.)
        .gap(8.)
        .center_y()
        .radius(6.)
        .fill(if selected { c.element } else { Color::TRANSPARENT })
        .hover(c.text.alpha(0.05))
        .focusable(true)
        .role("button")
        .label(title)
        .focus_selected(selected)
}

fn sidebar(s: &Sesh, c: &crate::theme::Colors) -> El {
    let width = s.appearance.sidebar_width;
    let mut organizations = col().w_full().gap(4.).px(10.).pt(12.).child(
        text("Organizations")
            .font(TextStyle::new(12., 600.))
            .color(c.muted)
            .px(7.)
            .py(4.),
    );
    for session in &s.data.sessions {
        let name = session.name.clone();
        let items = session_actions(&name, session.authenticated);
        let selected = s.data.session.as_ref() == Some(&name) && s.screen == Screen::Accounts;
        organizations = organizations.child(
            sidebar_item(format!("session-{name}"), &name, selected, c)
                .child(icon(&BUILDING, 17.).color(c.muted))
                .child(
                    label(
                        &name,
                        if session.authenticated {
                            c.text
                        } else {
                            c.muted
                        },
                    )
                    .grow(1.)
                    .min_w(0.),
                )
                .child(
                    icon(
                        if session.authenticated {
                            &CHECK
                        } else {
                            &SIGNED_OUT
                        },
                        13.,
                    )
                    .color(if session.authenticated {
                        c.success
                    } else {
                        c.warning
                    }),
                )
                .on_press_tx(move |s: &mut Sesh, tx| s.dispatch(Command::Session(name.clone()), tx))
                .on_secondary_press(move |s: &mut Sesh, point, _| {
                    s.context_menu = Some(ContextMenu {
                        point,
                        items: items.clone(),
                    })
                }),
        );
    }
    organizations = organizations.child(
        sidebar_item("new-session", "Add SSO session", false, c)
            .child(icon(&PLUS, 17.).color(c.muted))
            .child(label("Add SSO session", c.text))
            .on_press_tx(|s: &mut Sesh, tx| s.dispatch(Command::NewSession, tx)),
    );
    let count = s.data.credentials.len();
    let credentials = sidebar_item(
        "credentials-navigation",
        &format!("Credentials ({count})"),
        s.screen == Screen::Credentials,
        c,
    )
    .child(icon(&TERMINAL, 17.).color(c.muted))
    .child(label("Credentials", c.text).grow(1.).min_w(0.))
    .child(small(count.to_string(), c.muted))
    .on_press_tx(|s: &mut Sesh, tx| s.dispatch(Command::Credentials, tx));
    let settings = sidebar_item("settings-navigation", "Settings", s.screen == Screen::Settings, c)
        .child(icon(&SETTINGS, 17.).color(c.muted))
        .child(label("Settings", c.text))
        .on_press_tx(|s: &mut Sesh, tx| s.dispatch(Command::Settings, tx));
    col()
        .key("sidebar")
        .w(width)
        .h_full()
        .pt(HEADER)
        .fill(c.panel.alpha(0.25))
        .child(
            col()
                .grow(1.)
                .min_h(0.)
                .scroll(ScrollSpec {
                    stick_bottom: false,
                })
                .child(organizations),
        )
        .child(
            col().w_full().gap(4.).px(10.).py(8.)
                .child(credentials)
                .child(settings),
        )
}

fn section_key(group: &Option<String>) -> String {
    match group {
        None => "favorites".into(),
        Some(group) if group.is_empty() => "other".into(),
        Some(group) => format!("group:{group}"),
    }
}

fn section_target(key: &str) -> Option<String> {
    if key == "favorites" {
        None
    } else {
        Some(key.strip_prefix("group:").unwrap_or("").to_owned())
    }
}

fn account_row(s: &Sesh, position: usize, index: usize, c: &crate::theme::Colors) -> El {
    let account = &s.data.accounts[index];
    let selected = s.selected == Some(position) || s.marked.contains(&account.account_id);
    let account_id = account.account_id.clone();
    let title = account.name.clone();
    let key = Sesh::account_row_key(&account.account_id);
    let selection_id = account_id.clone();
    let action_id = account_id.clone();
    let menu_id = account_id.clone();
    let dragging = s
        .dragging
        .as_ref()
        .is_some_and(|drag| drag.active && drag.ids.contains(&account_id));
    row()
        .key(key)
        .h(74.)
        .w_full()
        .px(12.)
        .gap(12.)
        .center_y()
        .radius(6.)
        .fill(if selected {
            c.selection
        } else {
            Color::TRANSPARENT
        })
        .hover(c.text.alpha(0.035))
        .role("row")
        .label(&title)
        .focus_selected(selected)
        .focusable(true)
        .focus_ring(2., -2., c.accent)
        .opacity(if dragging { 0.3 } else { 1. })
        .child(icon(&BUILDING, 22.).color(if selected {
            c.accent
        } else if s.authenticated() {
            c.success
        } else {
            c.muted
        }))
        .child(
            col()
                .grow(1.)
                .min_w(0.)
                .gap(7.)
                .child(label(
                    &title,
                    if selected {
                        c.selected_text
                    } else if s.authenticated() {
                        c.text
                    } else {
                        c.muted
                    },
                ))
                .child(
                    text(
                        account
                            .last_profile
                            .as_ref()
                            .map(|profile| format!("{} · {profile}", account.account_id))
                            .unwrap_or_else(|| account.account_id.clone()),
                    )
                    .font(SMALL.mono())
                    .color(c.muted)
                    .truncate(),
                ),
        )
        .children(
            s.data
                .credentials
                .iter()
                .filter(|credential| {
                    credential.account_id == account.account_id
                        && Some(&credential.session_name) == s.data.session.as_ref()
                })
                .min_by_key(|credential| !credential.is_default)
                .map(|credential| {
                    small(
                        remaining(&credential.expiration),
                        if credential.is_default {
                            c.success
                        } else {
                            c.secondary
                        },
                    )
                }),
        )
        .child(
            icon_button(
                &format!("favorite-{position}"),
                "Toggle favorite",
                &STAR,
                Command::AccountAction(account_id.clone(), Box::new(Command::TogglePin)),
                c,
            )
            .opacity(if account.pinned { 1. } else { 0.35 }),
        )
        .on_press_tx(move |s: &mut Sesh, tx| {
            if let Some(position) = s.account_position(&selection_id) {
                s.select_account(position, tx);
            }
        })
        .on_double_press_tx(move |s: &mut Sesh, tx| {
            s.dispatch(
                Command::AccountAction(action_id.clone(), Box::new(Command::SetCredentials)),
                tx,
            )
        })
        .on_secondary_press(move |s: &mut Sesh, point, _| {
            if s.account_position(&menu_id).is_some() {
                s.context_menu = Some(ContextMenu {
                    point,
                    items: account_actions(s, &menu_id),
                });
            }
        })
        .on_drag(move |s: &mut Sesh, drag, tx| match drag.phase {
            Phase::Down => {
                s.suppress_account_press = false;
                if s.account_position(&account_id).is_none() {
                    return;
                }
                let point = drag.window_point();
                let rect = [point[0] - drag.x, point[1] - drag.y, drag.w, drag.h];
                let mut sections: Vec<_> = s
                    .entries()
                    .iter()
                    .cloned()
                    .filter_map(|entry| match entry {
                        Entry::Heading { group, .. } => Some(section_key(&group)),
                        _ => None,
                    })
                    .collect();
                if sections.is_empty() {
                    sections.push("other".into());
                }
                s.section_bounds.retain(|key, _| sections.contains(key));
                let ids = if s.marked.contains(&account_id) {
                    s.targets()
                        .into_iter()
                        .map(|a| a.account_id.clone())
                        .collect()
                } else {
                    vec![account_id.clone()]
                };
                s.dragging = Some(AccountDrag {
                    ids,
                    label: title.clone(),
                    rect,
                    origin: [rect[0], rect[1]],
                    pointer: drag.window_point(),
                    target: None,
                    active: false,
                    marked: if s.marked.contains(&account_id) {
                        s.marked.clone()
                    } else {
                        Default::default()
                    },
                    selected: if s.marked.contains(&account_id) {
                        s.selected.and_then(|position| {
                            s.visible()
                                .get(position)
                                .map(|index| s.data.accounts[*index].account_id.clone())
                        })
                    } else {
                        Some(account_id.clone())
                    },
                });
            }
            Phase::Move => {
                let point = drag.window_point();
                let target = s
                    .section_bounds
                    .iter()
                    .find(|(_, r)| {
                        point[0] >= r[0]
                            && point[0] <= r[0] + r[2]
                            && point[1] >= r[1]
                            && point[1] <= r[1] + r[3]
                    })
                    .map(|(key, _)| section_target(key))
                    .filter(|target| {
                        s.dragging.as_ref().is_some_and(|drag| {
                            s.data
                                .accounts
                                .iter()
                                .filter(|account| drag.ids.contains(&account.account_id))
                                .any(|account| match target {
                                    None => !account.pinned,
                                    Some(group) => {
                                        account.pinned
                                            || account.group.as_deref().unwrap_or("") != group
                                    }
                                })
                        })
                    });
                if let Some(current) = &mut s.dragging {
                    current.active |= drag.dx.hypot(drag.dy) > 4.;
                    current.rect[0] = current.origin[0] + drag.dx;
                    current.rect[1] = current.origin[1] + drag.dy;
                    current.pointer = point;
                    current.target = target;
                }
            }
            Phase::Up => {
                if let Some(current) = s.dragging.take()
                    && current.active
                {
                    s.suppress_account_press = true;
                    s.marked = current.marked;
                    s.selected = current
                        .selected
                        .as_deref()
                        .and_then(|id| s.account_position(id));
                    s.inspect();
                    if !drag.cancelled()
                        && let Some(target) = current.target
                    {
                        apply_drop(s, &current.ids, target);
                    }
                    tx.focus("account-list", false);
                }
            }
        })
}

fn apply_drop(s: &mut Sesh, ids: &[String], target: Option<String>) {
    let accounts: Vec<_> = s
        .data
        .accounts
        .iter()
        .filter(|a| ids.contains(&a.account_id))
        .cloned()
        .collect();
    for account in accounts {
        let name = s.data.session.clone();
        match &target {
            None => {
                if !account.pinned {
                    s.request(
                        "pinAccount",
                        json!({"name": name, "accountId": account.account_id, "pinned": true}),
                    );
                }
            }
            Some(group) => {
                if account.pinned {
                    s.request(
                        "pinAccount",
                        json!({"name": name, "accountId": account.account_id, "pinned": false}),
                    );
                }
                let group = (!group.is_empty()).then(|| group.clone());
                if account.group != group {
                    s.request("setAccountGroup", json!({"name": name, "accountId": account.account_id, "group": group.unwrap_or_default()}));
                }
            }
        }
    }
}

fn account_list(s: &Sesh, c: &crate::theme::Colors) -> El {
    let entries = s.entries();
    let mut content = col().key("account-rows").w_full().gap(6.);
    let mut sections: Vec<AccountSection> = vec![];
    let mut position = 0;
    for entry in entries.iter().cloned() {
        match entry {
            Entry::Heading {
                group,
                count,
                collapsed,
            } => sections.push(AccountSection {
                group,
                heading: Some((count, collapsed)),
                accounts: vec![],
            }),
            Entry::Account(index) => {
                if sections.is_empty() {
                    sections.push(AccountSection {
                        group: Some(String::new()),
                        heading: None,
                        accounts: vec![],
                    });
                }
                if let Some(section) = sections.last_mut() {
                    section.accounts.push((position, index));
                }
                position += 1;
            }
        }
    }
    for AccountSection {
        group,
        heading,
        accounts,
    } in sections
    {
        let section = section_key(&group);
        let target = s
            .dragging
            .as_ref()
            .is_some_and(|drag| drag.active && drag.target.as_ref() == Some(&group));
        let mut block = col()
            .key(format!("section-{section}"))
            .w_full()
            .radius(7.)
            .gap(6.)
            .border(1., if target { c.accent } else { Color::TRANSPARENT });
        if let Some((count, collapsed)) = heading {
            let title = match group.as_deref() {
                None => "Favorites",
                Some("") => "Other accounts",
                Some(group) => group,
            };
            let mut header = row()
                .key(format!("heading-{section}"))
                .h(32.)
                .px(10.)
                .gap(8.)
                .center_y()
                .child(small(if collapsed { "›" } else { "⌄" }, c.muted))
                .child(text(title).font(TextStyle::new(12., 600.)).color(c.muted))
                .child(small(count.to_string(), c.muted));
            if let Some(group) = &group {
                let toggle = group.clone();
                header = header
                    .role("button")
                    .label(title)
                    .expanded(!collapsed)
                    .focusable(true)
                    .on_press_tx(move |s: &mut Sesh, tx| {
                        s.dispatch(Command::ToggleGroup(toggle.clone()), tx)
                    });
                if !group.is_empty() {
                    let group = group.clone();
                    header = header.on_secondary_press(move |s: &mut Sesh, point, _| {
                        s.context_menu = Some(ContextMenu {
                            point,
                            items: vec![
                                ("Rename group…".into(), Command::RenameGroup(group.clone())),
                                ("Remove group…".into(), Command::RemoveGroup(group.clone())),
                            ],
                        });
                    });
                }
            }
            block = block.child(header);
        }
        let accounts = Rc::new(accounts);
        let keys = accounts.clone();
        let colors = *c;
        let rows = col()
            .key(format!("rows-{section}"))
            .w_full()
            .gap(6.)
            .growth(rune::GrowthSpec {
                spring: rune::Spring::NONE,
                ..Default::default()
            })
            .virtual_rows(
                accounts.len(),
                80.,
                move |s: &Sesh, index| {
                    Cow::Owned(Sesh::account_row_key(
                        &s.data.accounts[keys[index].1].account_id,
                    ))
                },
                move |s: &Sesh, index| {
                    let (position, account) = accounts[index];
                    account_row(s, position, account, &colors)
                },
            );
        block = block.child(rows);
        block = block.on_drawn_layout(move |s: &mut Sesh, rect| {
            s.section_bounds.insert(section.clone(), rect);
        });
        content = content.child(block);
    }
    if position == 0 {
        content = content.child(
            col()
                .h(180.)
                .center()
                .gap(10.)
                .child(label(
                    if s.busy() {
                        "Loading accounts…"
                    } else if s.search.text.is_empty() {
                        "No accounts"
                    } else {
                        "No matching accounts"
                    },
                    c.muted,
                ))
                .children((s.data.session.is_none()).then(|| {
                    button(
                        "empty-add-session",
                        "Add SSO session",
                        Command::NewSession,
                        c,
                    )
                })),
        );
    }
    col()
        .key("account-scroll")
        .grow(1.)
        .min_h(0.)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(content)
}

fn credentials_list(s: &Sesh, c: &crate::theme::Colors) -> El {
    let mut rows = col().w_full().gap(6.);
    for (position, index) in s.visible().iter().copied().enumerate() {
        let credential = &s.data.credentials[index];
        let items = [
            ("Copy profile", Command::CopyProfile),
            ("Copy account ID", Command::CopyAccount),
            ("Copy account name", Command::CopyName),
            ("Remove profile…", Command::RemoveCredential),
        ]
        .into_iter()
        .map(|(label, command)| {
            (
                label.into(),
                Command::ItemAction(position, Box::new(command)),
            )
        })
        .collect::<Vec<_>>();
        rows = rows.child(
            row()
                .key(format!("account-{position}"))
                .w_full()
                .h(74.)
                .px(12.)
                .gap(12.)
                .center_y()
                .radius(6.)
                .fill(
                    if s.marked_credentials
                        .contains(&Sesh::credential_key(credential))
                        || s.selected == Some(position)
                    {
                        c.selection
                    } else {
                        Color::TRANSPARENT
                    },
                )
                .hover(c.text.alpha(0.035))
                .role("row")
                .label(&credential.profile_name)
                .focus_selected(
                    s.marked_credentials
                        .contains(&Sesh::credential_key(credential))
                        || s.selected == Some(position),
                )
                .focusable(true)
                .child(icon(&TERMINAL, 20.).color(c.muted))
                .child(
                    col()
                        .grow(1.)
                        .min_w(0.)
                        .gap(6.)
                        .child(label(&credential.profile_name, c.text))
                        .child(small(
                            format!("{} · {}", credential.account_name, credential.role_name),
                            c.muted,
                        )),
                )
                .child(small(
                    if credential.is_default {
                        "Default".into()
                    } else {
                        remaining(&credential.expiration)
                    },
                    if credential.is_default {
                        c.success
                    } else {
                        c.secondary
                    },
                ))
                .on_press_tx(move |s: &mut Sesh, tx| s.select_account(position, tx))
                .on_secondary_press(move |s: &mut Sesh, point, _| {
                    s.context_menu = Some(ContextMenu {
                        point,
                        items: items.clone(),
                    })
                }),
        );
    }
    if s.data.credentials.is_empty() {
        rows = rows.child(
            col()
                .h(200.)
                .center()
                .child(label("No active credentials", c.muted)),
        );
    }
    col()
        .key("account-scroll")
        .grow(1.)
        .min_h(0.)
        .scroll(ScrollSpec {
            stick_bottom: false,
        })
        .child(rows)
}

fn workspace(s: &Sesh, k: &Kit, c: &crate::theme::Colors) -> El {
    let title = row()
        .h(30.)
        .center_y()
        .gap(8.)
        .child(
            text(if s.screen == Screen::Credentials {
                "Active credentials"
            } else {
                "Accounts"
            })
            .font(LABEL)
            .color(c.text),
        )
        .child(el().grow(1.))
        .child(small(s.visible().len().to_string(), c.muted));
    let search = TextInput::new(&s.search)
        .width(None)
        .text_style(BODY)
        .placeholder(if s.screen == Screen::Credentials {
            "Search profiles, accounts or roles"
        } else {
            "Search accounts, IDs or roles"
        })
        .label(if s.screen == Screen::Credentials {
            "Search credential profiles"
        } else {
            "Search accounts"
        })
        .leading_icon(&SEARCH)
        .height(CONTROL_HEIGHT)
        .on_edit(|s: &mut Sesh| &mut s.search)
        .on_change(|s: &mut Sesh, tx| {
            s.flush_preferences();
            s.selected = None;
            s.marked.clear();
            s.marked_credentials.clear();
            s.account = None;
            tx.scroll_to_instant("account-scroll", 0., 0.);
        })
        .on_submit(|s: &mut Sesh, tx| {
            s.selected = Some(0);
            s.inspect();
            tx.focus("account-list", false);
        })
        .on_key(|s: &mut Sesh, event, tx| {
            if event.key == Key::Down {
                s.selected = Some(0);
                s.inspect();
                tx.focus("account-list", false);
                true
            } else {
                false
            }
        })
        .build(k)
        .key("account-search");
    col()
        .key("account-list")
        .grow(1.)
        .min_w(0.)
        .min_h(0.)
        .pt(HEADER + 10.)
        .px(12.)
        .gap(12.)
        .focusable(true)
        .role("list")
        .label(if s.screen == Screen::Credentials {
            "Active credentials"
        } else {
            "Accounts"
        })
        .children((s.screen == Screen::Accounts).then_some(title))
        .child(search)
        .child(if s.screen == Screen::Credentials {
            credentials_list(s, c)
        } else {
            account_list(s, c)
        })
}

fn group_picker(s: &Sesh, k: &Kit, layers: &mut Vec<El>, c: &crate::theme::Colors) -> El {
    let targets = s.targets();
    let current = shared_group(&targets).flatten();
    let mut options = select::options(s.groups());
    options.push(ComboboxOption::new("__create_group", "New group…"));
    if targets.iter().any(|account| account.group.is_some()) {
        options.push(ComboboxOption::new("__remove_group", "Remove from group"));
    }
    let trigger = row()
        .h(CONTROL_HEIGHT)
        .gap(7.)
        .center_y()
        .radius(5.)
        .px(4.)
        .hover(c.text.alpha(0.05))
        .child(icon(&FOLDER, 15.).color(c.muted))
        .child(label(current.as_deref().unwrap_or("Add to group"), c.muted));
    Combobox::new("group-picker", &s.groups, &options, |s: &mut Sesh| {
        &mut s.groups
    })
    .label("Account group")
    .trigger(trigger)
    .current(current.as_deref())
    .on_choose(|s: &mut Sesh, value, tx| {
        let command = match value {
            "__create_group" => Command::NewGroup,
            "__remove_group" => Command::SetGroup(None),
            group => Command::SetGroup(Some(group.into())),
        };
        s.dispatch(command, tx);
    })
    .build(k, layers)
}

fn inspector(
    s: &Sesh,
    cx: &Cx<Sesh>,
    k: &Kit,
    layers: &mut Vec<El>,
    c: &crate::theme::Colors,
) -> El {
    let trailing = cx.chrome_insets().trailing;
    let mut panel = col()
        .key("inspector")
        .w(344.)
        .min_w(280.)
        .h_full()
        .px(18.)
        .gap(18.);
    if s.screen == Screen::Credentials && s.selected_credentials().len() > 1 {
        panel = panel
            .child(
                row().h(HEADER).center_y().child(
                    text(format!(
                        "{} profiles selected",
                        s.selected_credentials().len()
                    ))
                    .font(LABEL)
                    .color(c.text),
                ),
            )
            .child(
                text("Remove the selected profiles using the toolbar above the list.")
                    .font(BODY)
                    .color(c.muted)
                    .wrap(),
            );
    } else if s.screen == Screen::Credentials {
        if let Some(credential) = s.credential() {
            let expiration = chrono::DateTime::parse_from_rfc3339(&credential.expiration)
                .map(|expiration| {
                    expiration
                        .with_timezone(&chrono::Local)
                        .format("%Y-%m-%d %H:%M:%S")
                        .to_string()
                })
                .unwrap_or_else(|_| credential.expiration.clone());
            panel = panel
                .child(
                    inspector_heading("copy-credential-profile", &credential.profile_name, c)
                        .pr(trailing),
                )
                .child(detail_row(
                    "copy-credential-name",
                    "Account",
                    &credential.account_name,
                    c,
                ))
                .child(detail_row(
                    "copy-credential-account",
                    "Account ID",
                    &credential.account_id,
                    c,
                ))
                .child(detail_row(
                    "copy-credential-role",
                    "Role",
                    &credential.role_name,
                    c,
                ))
                .child(detail_row(
                    "copy-credential-session",
                    "Organization",
                    &credential.session_name,
                    c,
                ))
                .child(detail_row(
                    "copy-credential-region",
                    "Region",
                    credential.region.as_deref().unwrap_or("Default"),
                    c,
                ))
                .child(detail_row(
                    "copy-credential-expiration",
                    "Expires",
                    &expiration,
                    c,
                ))
                .child(
                    button(
                        "remove-credential",
                        "Clear credential",
                        Command::RemoveCredential,
                        c,
                    )
                    .w_full()
                    .fill(c.danger.alpha(0.18))
                    .border(1., c.danger.alpha(0.45))
                    .child(icon(&REMOVE, 15.).color(c.danger)),
                );
        } else {
            panel = panel.child(
                row()
                    .h(HEADER)
                    .center_y()
                    .child(label("Select a credential profile", c.muted)),
            );
        }
    } else if s.targets().len() > 1 {
        panel = panel
            .key("bulk-inspector")
            .child(
                row().h(HEADER).center_y().child(
                    text(format!("{} accounts selected", s.targets().len()))
                        .font(LABEL)
                        .color(c.text),
                ),
            )
            .child(group_picker(s, k, layers, c))
            .child(button("bulk-pin", "Add to favorites", Command::Pin(true), c).w_full())
            .child(
                button(
                    "bulk-unpin",
                    "Remove from favorites",
                    Command::Pin(false),
                    c,
                )
                .w_full(),
            )
            .child(button("bulk-copy-ids", "Copy account IDs", Command::CopyAccount, c).w_full())
            .child(
                button(
                    "bulk-copy-names",
                    "Copy account names",
                    Command::CopyName,
                    c,
                )
                .w_full(),
            )
            .child(button("bulk-clear", "Clear selection", Command::ClearSelection, c).w_full());
    } else if let Some(account) = &s.account {
        panel = panel
            .child(inspector_heading("copy-account-name", &account.name, c).pr(trailing))
            .child(
                row()
                    .center_y()
                    .gap(8.)
                    .child(
                        copy_value("copy-account-id", &account.account_id, SMALL.mono(), c)
                            .grow(1.),
                    )
                    .child(group_picker(s, k, layers, c))
                    .child(icon_button(
                        "inspector-favorite",
                        "Toggle favorite",
                        &STAR,
                        Command::TogglePin,
                        c,
                    )),
            );
        let authenticated = s.authenticated();
        let choose_role = authenticated && account.roles_loaded;
        let loading_roles =
            authenticated && !account.roles_loaded && s.roles_loading(&account.account_id);
        let role_selected = account.roles_loaded && s.role.is_some();
        let role_label = if !authenticated {
            "Sign in to load roles"
        } else if loading_roles {
            "Loading roles…"
        } else if !account.roles_loaded {
            "Retry loading roles"
        } else {
            s.role.as_deref().unwrap_or("Select a role")
        };
        let mut trigger = dropdown_trigger(role_label, choose_role, loading_roles, k, c).w_full();
        if loading_roles {
            trigger = trigger.role("status").label(role_label);
        } else if choose_role {
            trigger = trigger
                .role("combobox")
                .label("Role")
                .a11y_value(role_label)
                .focusable(true)
                .focus_ring(2., 1., c.accent)
                .hover(Color::BLACK.alpha(CONTROL_HOVER_STRENGTH));
        } else {
            let command = if authenticated {
                Command::LoadRoles
            } else {
                Command::Login
            };
            trigger = trigger
                .role("button")
                .label(role_label)
                .focusable(true)
                .focus_ring(2., 1., c.accent)
                .hover(Color::BLACK.alpha(CONTROL_HOVER_STRENGTH))
                .on_press_tx(move |s: &mut Sesh, tx| s.dispatch(command.clone(), tx));
        }
        let roles = select::options(&account.roles);
        let role = Combobox::new("role", &s.roles, &roles, |s: &mut Sesh| &mut s.roles)
            .label("Role")
            .placeholder("Select a role")
            .current(s.role.as_deref())
            .width(308.)
            .trigger(trigger)
            .disabled(!choose_role)
            .on_choose(|s: &mut Sesh, role, tx| s.dispatch(Command::SelectRole(role.into()), tx))
            .build(k, layers);
        let preferred = account.preferred_role == s.role && s.role.is_some();
        panel = panel.child(
            col().gap(10.).child(label("Role", c.text)).child(
                row()
                    .gap(8.)
                    .center_y()
                    .child(role.grow(1.).min_w(0.))
                    .child(
                        icon_button(
                            "prefer-role",
                            if preferred {
                                "Default role"
                            } else {
                                "Use this role by default"
                            },
                            &STAR,
                            Command::PreferRole,
                            c,
                        )
                        .disabled(!role_selected || preferred || s.busy())
                        .opacity(if preferred { 1. } else { 0.75 }),
                    ),
            ),
        );
        let region = TextInput::new(&s.region)
            .width(None)
            .text_style(BODY)
            .placeholder("eu-north-1")
            .label("Region")
            .height(CONTROL_HEIGHT)
            .on_edit(|s: &mut Sesh| &mut s.region)
            .on_change(|s: &mut Sesh, tx| s.schedule_preference("setRegion", tx))
            .on_submit(|s: &mut Sesh, _| s.flush_preferences())
            .build(k)
            .key("region");
        let profile = TextInput::new(&s.profile)
            .width(None)
            .text_style(BODY)
            .placeholder("default")
            .label("CLI profile")
            .height(CONTROL_HEIGHT)
            .disabled(!role_selected)
            .on_edit(|s: &mut Sesh| &mut s.profile)
            .on_change(|s: &mut Sesh, tx| s.schedule_preference("setProfile", tx))
            .on_submit(|s: &mut Sesh, _| s.flush_preferences())
            .build(k)
            .key("profile");
        let dark = s.appearance.dark(cx.system_dark());
        // Light surfaces can already be white, so leave room for a visible hover highlight.
        let (console_fill, console_hover) = if dark {
            (c.element, Color::WHITE.alpha(0.02))
        } else {
            (c.element.mix(c.text, 0.15), Color::WHITE.alpha(0.7))
        };
        panel = panel
            .child(col().gap(10.).child(label("Region", c.text)).child(region))
            .child(
                col()
                    .gap(10.)
                    .child(label("CLI profile", c.text))
                    .child(profile),
            )
            .child(
                row()
                    .gap(8.)
                    .child(
                        disabled_button(
                            "set-credentials",
                            "Set credentials",
                            Command::SetCredentials,
                            !authenticated || !role_selected || s.busy() || s.preferences_dirty(),
                            c,
                        )
                        .fill(c.selection)
                        .border(1., c.accent.alpha(0.2))
                        .grow(1.)
                        .min_w(0.),
                    )
                    .child(
                        button("open-console", "Console", Command::Console, c)
                            .fill(console_fill)
                            .hover(console_hover)
                            .disabled(!role_selected || s.busy())
                            .child(icon(&EXTERNAL, 14.).color(c.muted)),
                    ),
            )
            .children((!authenticated).then(|| {
                button(
                    "sign-in-organization",
                    "Sign in to this organization",
                    Command::Login,
                    c,
                )
                .w_full()
            }));
    } else {
        panel = panel.child(
            row()
                .h(HEADER)
                .center_y()
                .child(label("Select an account", c.muted)),
        );
    }
    row()
        .key("inspector-pane")
        .instant_changes()
        .h_full()
        .child(el().w(1.).h_full().pt(HEADER).fill(c.border))
        .child(
            col()
                .h_full()
                .min_h(0.)
                .scroll(ScrollSpec {
                    stick_bottom: false,
                })
                .child(panel.h(740.)),
        )
}

fn settings(s: &Sesh, k: &Kit, layers: &mut Vec<El>, c: &crate::theme::Colors) -> El {
    let mut appearance = col()
        .w_full()
        .gap(18.)
        .child(text("Appearance").font(TITLE).color(c.text))
        .child(label("Color mode", c.text));
    let mut modes = row().gap(8.);
    for mode in ["system", "light", "dark"] {
        modes = modes.child(
            button(
                format!("appearance-{mode}"),
                match mode {
                    "system" => "System",
                    "light" => "Light",
                    _ => "Dark",
                },
                Command::Appearance(mode.into()),
                c,
            )
            .fill(if s.appearance.mode == mode {
                c.selection
            } else {
                c.element
            }),
        );
    }
    appearance = appearance
        .child(modes)
        .child(label("Theme", c.text))
        .child(
            Combobox::new(
                "theme-picker",
                &s.themes,
                &select::options(&s.appearance.themes),
                |s: &mut Sesh| &mut s.themes,
            )
            .label("Theme")
            .current(Some(&s.appearance.theme))
            .trigger(
                dropdown_trigger(&s.appearance.theme, true, false, k, c)
                    .key("theme-dropdown")
                    .w(280.)
                    .role("combobox")
                    .label("Theme")
                    .a11y_value(&s.appearance.theme)
                    .focusable(true)
                    .focus_ring(2., 1., c.accent)
                    .hover(Color::BLACK.alpha(CONTROL_HOVER_STRENGTH)),
            )
            .on_choose(|s: &mut Sesh, theme, tx| s.dispatch(Command::Theme(theme.into()), tx))
            .build(k, layers),
        )
        .child(
            row().child(
                button(
                    "theme-directory",
                    "Theme directory",
                    Command::OpenThemeDirectory,
                    c,
                )
                .child(icon(&EXTERNAL, 14.).color(c.muted)),
            ),
        )
        .child(label(
            format!("Translucency  {:.0}%", s.appearance.translucency),
            c.text,
        ))
        .child(translucency_slider(s, c))
        .child(switch(
            "dithering-switch",
            "Dither translucent backgrounds",
            s.appearance.dithering,
            Command::Dithering(!s.appearance.dithering),
            c,
        ))
        .child(switch(
            "sidebar-switch",
            "Show organization sidebar",
            s.appearance.sidebar_visible,
            Command::ToggleSidebar,
            c,
        ));
    let mut content = col()
        .w_full()
        .max_w(840.)
        .padding(28.)
        .gap(24.)
        .child(appearance)
        .child(divider(c.border))
        .child(
            row()
                .center_y()
                .gap(12.)
                .child(
                    text("Keyboard shortcuts")
                        .font(TITLE)
                        .color(c.text)
                        .grow(1.),
                )
                .child(button("reset-shortcuts", "Reset", Command::ResetShortcuts, c).h(28.)),
        );
    for definition in platform::shortcuts() {
        let Some(recorder) = s.recorders.get(definition.id) else {
            continue;
        };
        let id = definition.id;
        let control =
            ShortcutRecorder::new(format!("shortcut-{id}"), recorder, move |s: &mut Sesh| {
                s.recorders.entry(id).or_default()
            })
            .label(definition.label)
            .width(220.)
            .on_change(move |s: &mut Sesh, shortcut, tx| {
                let mut shortcuts = s.appearance.shortcuts.clone();
                shortcuts.insert(
                    id.into(),
                    shortcut.map(ToString::to_string).unwrap_or_default(),
                );
                let shortcuts = platform::validate_shortcuts(&shortcuts).map_err(|error| {
                    s.error = true;
                    s.message = error.to_string();
                    rune::ShortcutError::Conflict
                })?;
                s.appearance.shortcuts = shortcuts;
                s.save_appearance("shortcuts", json!(s.appearance.shortcuts), tx);
                s.update_menus();
                Ok(())
            })
            .build(k);
        content = content.child(
            row()
                .w_full()
                .center_y()
                .gap(12.)
                .child(label(definition.label, c.text).grow(1.).min_w(0.))
                .child(control)
                .child(
                    button(
                        format!("clear-shortcut-{id}"),
                        "Clear",
                        Command::ClearShortcut(id),
                        c,
                    )
                    .h(28.),
                ),
        );
    }
    if cfg!(windows) {
        content = content.child(divider(c.border)).child(text("Integration").font(TITLE).color(c.text))
            .child(switch("wsl-switch", "Use WSL workspace", s.wsl_enabled, Command::UseWslWorkspace(!s.wsl_enabled), c)
                .disabled(!s.wsl_available || s.busy()))
            .child(text("Shares sessions, caches, preferences and AWS credentials with the CLI in your default WSL distribution.").font(SMALL).color(c.muted).wrap());
    }
    content = content
        .child(divider(c.border))
        .child(
            col()
                .key("about-wordmark")
                .gap(6.)
                .child(
                    text(include_str!("../assets/wordmark.txt").trim_end())
                        .font(SMALL.mono())
                        .color(c.text)
                        .label("awsesh"),
                )
                .child(small("AWS Session Manager by Elva", c.muted)),
        )
        .child(label(
            format!(
                "Version {}",
                option_env!("AWSESH_RELEASE_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
            ),
            c.muted,
        ))
        .child(
            row()
                .gap(16.)
                .child(external_link(
                    "repository-link",
                    "Sesh repository",
                    "https://github.com/elva-labs/awsesh",
                    c,
                ))
                .child(external_link(
                    "elva-link",
                    "Elva",
                    "https://elva-group.com",
                    c,
                )),
        );
    col()
        .key("settings")
        .grow(1.)
        .min_w(0.)
        .min_h(0.)
        .pt(HEADER)
        .child(
            col()
                .grow(1.)
                .min_h(0.)
                .scroll(ScrollSpec {
                    stick_bottom: false,
                })
                .child(content),
        )
}

fn translucency_slider(s: &Sesh, c: &crate::theme::Colors) -> El {
    let value = s.appearance.translucency;
    row()
        .key("translucency")
        .w(320.)
        .h(24.)
        .center_y()
        .role("slider")
        .label("Translucency")
        .focusable(true)
        .a11y_value(format!("{value:.0} percent"))
        .range_value(f64::from(value), 0., 100.)
        .range_step(1.)
        .child(
            el().w_full()
                .h(4.)
                .radius(2.)
                .fill(c.border)
                .child(el().w_frac(value / 100.).h(4.).radius(2.).fill(c.accent)),
        )
        .child(
            el().size(12., 12.)
                .radius(6.)
                .fill(c.text)
                .absolute(value * 3.08, 6.),
        )
        .on_drag(|s: &mut Sesh, drag, tx| {
            if drag.phase == Phase::Down {
                drag.data = s.appearance.translucency;
            }
            let value = if drag.cancelled() {
                drag.data
            } else {
                (drag.x / drag.w * 100.).clamp(0., 100.)
            };
            s.dispatch(Command::Translucency(value), tx);
        })
        .on_step(|s: &mut Sesh, amount, tx| {
            tx.instant();
            s.dispatch(
                Command::Translucency(s.appearance.translucency + amount as f32),
                tx,
            );
        })
        .on_step_limit(|s: &mut Sesh, end, tx| {
            tx.instant();
            s.dispatch(Command::Translucency(if end { 100. } else { 0. }), tx)
        })
}

fn form(s: &Sesh, k: &Kit, c: &crate::theme::Colors) -> Option<El> {
    let form = s.form.as_ref()?;
    let mut sheet = col()
        .key("form-dialog")
        .w(460.)
        .max_h(580.)
        .padding(24.)
        .gap(16.)
        .radius(12.)
        .fill(c.menu)
        .border(1., c.border)
        .shadow(12., 40., Color::BLACK.alpha(0.3))
        .role("dialog")
        .label(&form.title)
        .modal(false, |s: &mut Sesh| s.form = None)
        .child(text(&form.title).font(TITLE).color(c.text))
        .child(text(&form.description).font(BODY).color(c.muted).wrap());
    for (index, (name, edit)) in form.fields.iter().enumerate() {
        let form_id = form.id;
        let title = match name.as_str() {
            "name" => "Organization name",
            "startUrl" => "SSO start URL",
            "ssoRegion" => "SSO region",
            "defaultRegion" => "Default AWS region",
            "group" => "Group name",
            "renamed" => "New group name",
            _ => name,
        };
        let mut field = col().gap(7.).child(label(title, c.text)).child(
            TextInput::new(edit)
                .width(None)
                .text_style(BODY)
                .height(CONTROL_HEIGHT)
                .label(title)
                .placeholder(if name == "startUrl" {
                    "Organization short name or full URL"
                } else {
                    ""
                })
                .disabled(form.submission.is_some())
                .on_edit(move |s: &mut Sesh| {
                    if let Some(form) = &mut s.form
                        && form.id == form_id
                        && let Some((_, edit)) = form.fields.get_mut(index)
                    {
                        edit
                    } else {
                        &mut s.inactive_edit
                    }
                })
                .on_submit(|s: &mut Sesh, tx| s.dispatch(Command::Confirm, tx))
                .build(k)
                .key(format!("form-{}-field-{index}", form.id)),
        );
        if name == "startUrl" {
            let resolved = crate::sso_start_url(&edit.text);
            if resolved != edit.text.trim() {
                field = field.child(
                    text(format!("Resolves to: {resolved}"))
                        .key("sso-url-preview")
                        .font(SMALL)
                        .color(c.muted)
                        .wrap(),
                );
            }
        }
        sheet = sheet.child(field);
    }
    if s.error {
        sheet = sheet.child(
            text(&s.message)
                .font(SMALL)
                .color(c.danger)
                .wrap()
                .role("alert"),
        );
    }
    sheet = sheet.child(
        row()
            .gap(10.)
            .child(el().grow(1.))
            .child(button("form-cancel", "Cancel", Command::Cancel, c))
            .child(
                disabled_button(
                    "form-confirm",
                    if form.submission.is_some() {
                        "Saving…"
                    } else if form.destructive {
                        "Confirm"
                    } else {
                        "Save"
                    },
                    Command::Confirm,
                    form.submission.is_some(),
                    c,
                )
                .w(100.)
                .fill(if form.destructive {
                    c.danger.alpha(0.2)
                } else {
                    c.selection
                })
                .default_button(),
            ),
    );
    Some(
        el().key("form-scrim")
            .pin(Some(0.), Some(0.), Some(0.), Some(0.))
            .fill(Color::BLACK.alpha(0.3))
            .center()
            .child(sheet),
    )
}

fn login(s: &Sesh, k: &Kit, c: &crate::theme::Colors) -> Option<El> {
    let login = s.login.as_ref()?;
    Some(
        el().key("login-scrim")
            .pin(Some(0.), Some(0.), Some(0.), Some(0.))
            .fill(Color::BLACK.alpha(0.3))
            .center()
            .child(
                col()
                    .key("login-dialog")
                    .w(440.)
                    .padding(24.)
                    .gap(18.)
                    .radius(12.)
                    .fill(c.menu)
                    .border(1., c.border)
                    .role("dialog")
                    .label("Sign in")
                    .modal(false, |s: &mut Sesh| {
                        if let Some(login) = s.login.take() {
                            s.request("cancelLogin", json!({"name": login.name}));
                        }
                    })
                    .child(
                        row()
                            .gap(8.)
                            .center_y()
                            .child(
                                text(format!("Sign in to {}", login.name))
                                    .key("login-title")
                                    .font(TITLE)
                                    .color(c.text)
                                    .wrap()
                                    .grow(1.)
                                    .min_w(0.),
                            )
                            .child(icon_button(
                                "cancel-login",
                                "Cancel sign-in",
                                &CLOSE,
                                Command::Cancel,
                                c,
                            )),
                    )
                    .child(
                        text(if login.code.is_empty() {
                            "Requesting a sign-in code…"
                        } else {
                            "Continue in your browser. To use a different browser or profile, copy the link. If prompted, enter this code:"
                        })
                        .font(BODY)
                        .color(c.muted)
                        .wrap(),
                    )
                    .child(
                        row().w_full().center().child(
                            text(&login.code)
                                .key("login-code")
                                .font(TextStyle::new(24., 600.).mono())
                                .color(c.text)
                                .selectable(true),
                        ),
                    )
                    .child(
                        row()
                            .gap(10.)
                            .child(el().grow(1.))
                            .child(
                                Button::new(if login.link_copied {
                                    "Link copied"
                                } else {
                                    "Copy link"
                                })
                                    .control_size(ControlSize::ExtraLarge)
                                    .variant(ButtonVariant::Outline)
                                    .disabled(login.url.is_empty())
                                    .on_press_tx(|s: &mut Sesh, tx| s.dispatch(Command::CopyLoginLink, tx))
                                    .build(k)
                                    .key("copy-login-link"),
                            )
                            .child(
                                Button::new("Open browser")
                                    .control_size(ControlSize::ExtraLarge)
                                    .help("Open in the system default browser")
                                    .variant(ButtonVariant::Contrast)
                                    .disabled(login.url.is_empty())
                                    .on_press_tx(|s: &mut Sesh, tx| s.dispatch(Command::OpenLogin, tx))
                                    .build(k)
                                    .key("open-login"),
                            ),
                    ),
            ),
    )
}

fn palette(s: &Sesh, k: &Kit, c: &crate::theme::Colors) -> Option<El> {
    if !s.palette {
        return None;
    }
    let commands = s.commands();
    let mut results = col().key("command-rows").w_full().padding(6.).gap(2.);
    for (index, (title, command)) in commands.into_iter().enumerate() {
        results = results.child(
            row()
                .key(format!("command-{index}"))
                .w_full()
                .h(40.)
                .px(10.)
                .center_y()
                .radius(5.)
                .fill(if s.command_selected == index {
                    c.selection
                } else {
                    Color::TRANSPARENT
                })
                .hover(c.text.alpha(0.05))
                .role("button")
                .label(&title)
                .focusable(true)
                .child(
                    text(title)
                        .font(TextStyle::new(14., 500.))
                        .color(c.text)
                        .truncate(),
                )
                .on_press_tx(move |s: &mut Sesh, tx| s.dispatch(command.clone(), tx)),
        );
    }
    let search = TextInput::new(&s.command_search)
        .width(None)
        .text_style(BODY)
        .placeholder("Search commands and organizations…")
        .label("Commands")
        .height(CONTROL_HEIGHT)
        .leading_icon(&SEARCH)
        .on_edit(|s: &mut Sesh| &mut s.command_search)
        .on_change(|s: &mut Sesh, tx| {
            s.command_selected = 0;
            tx.scroll_to_instant("command-scroll", 0., 0.);
        })
        .on_key(|s: &mut Sesh, event, tx| {
            match event.key {
                Key::Down => {
                    s.command_selected =
                        (s.command_selected + 1).min(s.commands().len().saturating_sub(1))
                }
                Key::Up => s.command_selected = s.command_selected.saturating_sub(1),
                Key::Enter => {
                    if let Some((_, command)) = s.commands().get(s.command_selected).cloned() {
                        s.dispatch(command, tx);
                    }
                }
                Key::Escape => s.dispatch(Command::Cancel, tx),
                _ => return false,
            }
            tx.scroll_into_view(format!("command-{}", s.command_selected));
            true
        })
        .build(k)
        .key("command-search");
    Some(
        col()
            .key("command-scrim")
            .pin(Some(0.), Some(0.), Some(0.), Some(0.))
            .fill(Color::BLACK.alpha(0.25))
            .pt(60.)
            .items_center()
            .child(
                col()
                    .key("command-dialog")
                    .w(560.)
                    .h(380.)
                    .radius(12.)
                    .fill(c.menu)
                    .border(1., c.border)
                    .shadow(12., 40., Color::BLACK.alpha(0.3))
                    .role("dialog")
                    .label("Command bar")
                    .modal(true, |s: &mut Sesh| {
                        s.palette = false;
                        s.command_search.focused = false;
                    })
                    .child(search)
                    .child(
                        col()
                            .key("command-scroll")
                            .grow(1.)
                            .min_h(0.)
                            .scroll(ScrollSpec {
                                stick_bottom: false,
                            })
                            .child(results),
                    ),
            ),
    )
}

fn context_menu(s: &Sesh, k: &Kit, layers: &mut Vec<El>) {
    let Some(context) = &s.context_menu else {
        return;
    };
    let mut menu = Menu::new("context-menu")
        .trigger(el().size(0., 0.))
        .at(context.point.x, context.point.y)
        .open(true)
        .on_close(|s: &mut Sesh| s.context_menu = None);
    for (title, command) in &context.items {
        let command = command.clone();
        menu = menu.item(
            MenuItem::new(title)
                .on_select_tx(move |s: &mut Sesh, tx| s.dispatch(command.clone(), tx)),
        );
    }
    let _ = menu.build(k, layers);
}

pub fn view(s: &Sesh, cx: &mut Cx<Sesh>) -> El {
    let system_dark = cx.system_dark();
    let dark = s.appearance.dark(system_dark);
    let c = s.appearance.colors(system_dark);
    let k = s.appearance.kit(system_dark);
    if let Some(window) = &s.window {
        platform::apply_window_appearance(
            window,
            &s.appearance.mode,
            dark,
            s.appearance.translucency > 0.,
        );
    }
    cx.help_look(rune::HelpLook::system(dark).on_focus(true));
    cx.caption_color(c.text);
    cx.foreground(c.text);
    let mut layers = vec![];
    let open = s.appearance.sidebar_visible;
    let mut background = el()
        .key("window-background")
        .pin(Some(0.), Some(0.), Some(0.), Some(0.))
        .inert();
    if s.appearance.translucency > 0. {
        background = background.child(
            el().key("native-backdrop")
                .pin(Some(0.), Some(0.), Some(0.), Some(0.))
                .system_material(rune::SystemMaterial::Popover)
                .fill(c.background),
        );
    }
    background = background.child(
        el().key("background-tint")
            .pin(Some(0.), Some(0.), Some(0.), Some(0.))
            .fill(c.background.alpha(1. - s.appearance.translucency / 100.)),
    );
    let mut body = row()
        .key("workspace")
        .motion(rune::tok::motion::SNAPPY)
        .grow(1.)
        .min_h(0.)
        .child(
            col()
                .key("sidebar-viewport")
                .w(if open { s.appearance.sidebar_width } else { 0. })
                .h_full()
                .min_w(0.)
                .clip_rounded(0.)
                .motion(rune::tok::motion::SNAPPY)
                .child(sidebar(s, &c)),
        )
        .children(open.then(|| {
            el().key("sidebar-resize")
                .w(1.)
                .h_full()
                .fill(c.border)
                .child(
                    el().w(7.)
                        .h_full()
                        .absolute(-3., HEADER)
                        .cursor(rune::Cursor::ResizeColumn)
                        .focusable(true)
                        .role("separator")
                        .label("Sidebar width")
                        .on_drag(|s: &mut Sesh, drag, tx| {
                            if drag.phase == Phase::Down {
                                drag.data = s.appearance.sidebar_width;
                            }
                            s.dispatch(
                                Command::SidebarWidth(if drag.cancelled() {
                                    drag.data
                                } else {
                                    drag.data + drag.dx
                                }),
                                tx,
                            );
                        })
                        .on_key(|s: &mut Sesh, event, tx| {
                            let width = match event.key {
                                Key::Left => s.appearance.sidebar_width - 8.,
                                Key::Right => s.appearance.sidebar_width + 8.,
                                _ => return false,
                            };
                            tx.instant();
                            s.dispatch(Command::SidebarWidth(width), tx);
                            true
                        }),
                )
        }));
    if s.screen == Screen::Settings {
        body = body.child(settings(s, &k, &mut layers, &c));
    } else {
        body = body
            .child(workspace(s, &k, &c))
            .child(inspector(s, cx, &k, &mut layers, &c));
    }
    let default = s
        .data
        .credentials
        .iter()
        .find(|credential| credential.is_default)
        .map(|credential| {
            format!(
                "Default: {} · {}",
                credential.account_name, credential.role_name
            )
        })
        .unwrap_or_else(|| "No default credentials".into());
    let status = row()
        .key("status-bar")
        .w_full()
        .h(31.)
        .px(14.)
        .center_y()
        .gap(12.)
        .child(small(default, c.muted))
        .child(el().grow(1.))
        .child(
            small(&s.message, if s.error { c.danger } else { c.muted }).role(if s.error {
                "alert"
            } else {
                "status"
            }),
        );
    let mut root = col().key("root").w_full().h_full().child(background);
    if s.appearance.dithering {
        let [width, height] = cx.layout_size("root").unwrap_or([1200., 780.]);
        let mut texture = el()
            .key("dither-texture")
            .pin(Some(0.), Some(0.), Some(0.), Some(0.))
            .clip_rounded(0.)
            .opacity(0.12)
            .inert();
        let mut y = 0.;
        while y < height {
            let mut x = 0.;
            while x < width {
                texture = texture.child(
                    el().size(256., 256.)
                        .absolute(x, y)
                        .pixels(s.texture.get_or_init(dither_texture)),
                );
                x += 256.;
            }
            y += 256.;
        }
        root = root.child(texture);
    }
    root = root
        .child(body)
        .child(divider(c.border))
        .child(status)
        .child(toolbar(s, cx, &c));
    context_menu(s, &k, &mut layers);
    layers.extend(form(s, &k, &c));
    layers.extend(login(s, &k, &c));
    layers.extend(palette(s, &k, &c));
    if let Some(drag) = &s.dragging
        && drag.active
    {
        layers.push(
            row()
                .key("account-drag")
                .absolute(drag.rect[0], drag.rect[1])
                .size(drag.rect[2], drag.rect[3])
                .radius(6.)
                .px(12.)
                .gap(12.)
                .center_y()
                .fill(c.selection)
                .border(1., c.accent.alpha(0.4))
                .shadow(5., 20., Color::BLACK.alpha(0.3))
                .inert()
                .child(icon(&BUILDING, 22.).color(c.accent))
                .child(label(
                    if drag.ids.len() > 1 {
                        format!("{} accounts", drag.ids.len())
                    } else {
                        drag.label.clone()
                    },
                    c.text,
                )),
        );
    }
    rune_kit::root(root, layers)
}

pub fn preview(s: &mut Sesh) {
    s.preview = true;
    s.initialized = true;
    s.appearance.mode = "dark".into();
    s.appearance.translucency = 0.;
    s.data = serde_json::from_value(json!({
        "sessions": (["Polaris", "Elva", "Donedev", "Rentr", "Stampen"].map(|name| json!({
            "name": name, "startUrl": "https://security.awsapps.com/start", "ssoRegion": "eu-north-1",
            "defaultRegion": "eu-north-1", "authenticated": false
        }))),
        "session": "Donedev", "accounts": ([
            ("Galleri", "258109618380"), ("Lagom-Eurovision", "471112757205"), ("Lagom-Popcorn", "821157343717"),
            ("Management", "365474014391"), ("Minecraft", "664342887370"), ("Misc", "185226997040"),
            ("Ork", "438186829307"), ("Portfolio", "696616821118")
        ].map(|(name, id)| json!({"name": name, "accountId": id, "lastProfile": format!("security-{}", name.to_lowercase()),
            "roles": [], "rolesLoaded": false, "profiles": {}, "pinned": false}))),
        "credentials": [], "collapsedGroups": []
    })).unwrap_or_default();
    s.selected = Some(3);
    s.account = s.data.accounts.get(3).cloned();
    s.sync_recorders();
    s.rebuild_index();
}

pub fn preview_authenticated(s: &mut Sesh) {
    preview(s);
    for session in &mut s.data.sessions {
        if Some(&session.name) == s.data.session.as_ref() {
            session.authenticated = true;
        }
    }
    if let Some(account) = s.data.accounts.get_mut(3) {
        account.roles = vec![
            "AdministratorAccess".into(),
            "ReadOnlyAccess".into(),
            "SecurityAudit".into(),
        ];
        account.roles_loaded = true;
        account.preferred_role = Some("AdministratorAccess".into());
        account.region = Some("eu-north-1".into());
        account
            .profiles
            .insert("AdministratorAccess".into(), "security-management".into());
    }
    if let Some(account) = s.data.accounts.get(3).cloned() {
        s.sync_inspector(account, true);
    }
    s.data.credentials = vec![crate::sdk::Credential {
        profile_name: "security-management".into(),
        account_id: "365474014391".into(),
        account_name: "Management".into(),
        role_name: "AdministratorAccess".into(),
        session_name: "Donedev".into(),
        expiration: (chrono::Utc::now() + chrono::Duration::hours(1)).to_rfc3339(),
        is_default: false,
        region: Some("eu-north-1".into()),
    }];
    s.rebuild_index();
}

fn remaining(expiration: &str) -> String {
    let Ok(expiration) = chrono::DateTime::parse_from_rfc3339(expiration) else {
        return String::new();
    };
    let seconds = (expiration.with_timezone(&chrono::Utc) - chrono::Utc::now()).num_seconds();
    if seconds <= 0 {
        "Expired".into()
    } else if seconds >= 3600 {
        format!("{}h {}m", seconds / 3600, seconds % 3600 / 60)
    } else {
        format!("{}m", seconds / 60)
    }
}

pub fn dither_texture() -> rune::Pixels {
    let pixels = rune::Pixels::new();
    let matrix = [
        [0u8, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
    ];
    let mut rgba = Vec::with_capacity(256 * 256 * 4);
    for y in 0..256 {
        for x in 0..256 {
            let value = matrix[(y / 2) % 4][(x / 2) % 4];
            let channel = if value < 8 { 255 } else { 0 };
            let alpha = if value < 8 {
                255 - value * 34
            } else {
                (value - 8) * 34 + 17
            };
            rgba.extend_from_slice(&[channel, channel, channel, alpha]);
        }
    }
    pixels.set(256, 256, rgba);
    pixels
}
