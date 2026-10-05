use crate::{
    Accounts, Back, Command, Console, Credentials, EditSession, NewSession, Next, Palette,
    Preferences, Previous, Refresh, Screen, Search, Select, Sesh, SetCredentials, ToggleDithering,
    ToggleSidebar, platform, sso_start_url, theme,
};
use gpui::{
    AnyElement, AssetSource, Context, ElementId, Focusable, FontWeight, Hsla, Render, SharedString,
    Window, anchored, deferred, div, img, prelude::*, px, relative, uniform_list,
};
use gpui_component::{
    ActiveTheme, Disableable, Icon, IconName, InteractiveElementExt, Selectable, Sizable,
    button::{Button, ButtonVariants},
    checkbox::Checkbox,
    input::Input,
    menu::{PopupMenu, PopupMenuItem},
    select::Select as RoleSelect,
    slider::Slider,
};
use std::borrow::Cow;

const HEADER_HEIGHT: f32 = 38.;

#[derive(Clone)]
struct SidebarResize;

impl Render for SidebarResize {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        gpui::Empty
    }
}

pub(super) struct Assets;

impl AssetSource for Assets {
    fn load(&self, path: &str) -> gpui::Result<Option<Cow<'static, [u8]>>> {
        if path == "icons/refresh.svg" {
            return Ok(Some(Cow::Borrowed(include_bytes!("../assets/refresh.svg"))));
        }
        gpui_component_assets::Assets.load(path)
    }

    fn list(&self, path: &str) -> gpui::Result<Vec<SharedString>> {
        let mut assets = gpui_component_assets::Assets.list(path)?;
        if "icons/refresh.svg".starts_with(path) {
            assets.push("icons/refresh.svg".into());
        }
        Ok(assets)
    }
}

struct Colors {
    background: Hsla,
    sidebar: Hsla,
    border: Hsla,
    text: Hsla,
    muted: Hsla,
    selection: Hsla,
    accent: Hsla,
    success: Hsla,
    warning: Hsla,
    profile: Hsla,
}

fn remaining(value: &str) -> String {
    let Ok(time) = chrono::DateTime::parse_from_rfc3339(value) else {
        return "Unknown expiry".into();
    };
    let seconds = time.signed_duration_since(chrono::Utc::now()).num_seconds();
    if seconds <= 0 {
        return "Expired".into();
    }
    let minutes = (seconds + 59) / 60;
    if minutes >= 60 {
        return format!("{}h {}m remaining", minutes / 60, minutes % 60);
    }
    format!("{minutes}m remaining")
}

fn expiration(value: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|time| {
            time.with_timezone(&chrono::Local)
                .format("%H:%M")
                .to_string()
        })
        .unwrap_or_else(|_| "Unknown".into())
}

fn menu_item(label: &'static str) -> PopupMenuItem {
    PopupMenuItem::element(move |_, _| div().h(px(36.)).flex().items_center().child(label))
}

impl Sesh {
    fn show_menu(
        &mut self,
        items: Vec<(&'static str, Command, bool)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let view = cx.entity().downgrade();
        let focus = self.focus.clone();
        let menu = PopupMenu::build(window, cx, move |mut menu, _, _| {
            for (label, command, disabled) in items {
                let view = view.clone();
                menu = menu.item(menu_item(label).disabled(disabled).on_click(
                    move |_, window, cx| {
                        let _ =
                            view.update(cx, |this, cx| this.dispatch(command.clone(), window, cx));
                    },
                ));
            }
            menu.action_context(focus)
        });
        let subscription = cx.subscribe_in(
            &menu,
            window,
            |this, _, _: &gpui::DismissEvent, window, cx| {
                if this.popup.take().is_some() {
                    this.focus.focus(window);
                }
                cx.notify();
            },
        );
        menu.read(cx).focus_handle(cx).focus(window);
        self.popup = Some((window.mouse_position(), menu, subscription));
        cx.notify();
    }
    fn toolbar_button(
        &self,
        button: Button,
        icon: impl Into<Icon>,
        label: impl Into<SharedString>,
        cx: &Context<Self>,
    ) -> Button {
        button
            .ghost()
            .size(px(24.))
            .p_0()
            .rounded(px(6.))
            .cursor_pointer()
            .child(
                Icon::new(icon).size(px(16.)).text_color(
                    cx.theme()
                        .muted_foreground
                        .opacity(if self.modal() { 0.5 } else { 1. }),
                ),
            )
            .tooltip(label)
            .disabled(self.modal())
            .tab_stop(!self.modal())
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, _| this.window_should_move = false),
            )
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, _| this.window_should_move = false),
            )
    }

    fn window_toolbar(&self, sidebar: f32, window: &Window, cx: &Context<Self>) -> AnyElement {
        let theme = cx.theme();
        let inset = if window.is_fullscreen() { 0. } else { 82. };
        let clearance = 16. + (self.sidebar_width - (96. + inset)).max(0.) * sidebar;
        let capsule = div()
            .relative()
            .h(px(32.))
            .flex_shrink_0()
            .flex()
            .items_center()
            .px(px(6.))
            .child(
                div()
                    .absolute()
                    .inset_0()
                    .rounded(px(12.))
                    .border_1()
                    .border_color(theme.border.opacity(0.55))
                    .bg(theme.title_bar)
                    .shadow_sm()
                    .opacity(1. - sidebar),
            )
            .child(div().w(px(inset)).flex_shrink_0())
            .child(
                div().flex().items_center().gap(px(2.)).children(
                    [
                        (
                            "toolbar-sidebar",
                            IconName::PanelLeft,
                            "Toggle sidebar",
                            "toggle_sidebar",
                            Command::ToggleSidebar,
                        ),
                        (
                            "toolbar-commands",
                            IconName::Search,
                            "Commands",
                            "commands",
                            Command::Palette,
                        ),
                        (
                            "toolbar-settings",
                            IconName::Settings,
                            "Settings",
                            "settings",
                            Command::Settings,
                        ),
                    ]
                    .into_iter()
                    .map(|(id, icon, label, shortcut, command)| {
                        let label = format!(
                            "{label} · {}",
                            platform::shortcut_label(shortcut, &self.shortcuts)
                        );
                        self.toolbar_button(self.button(id, "", command, cx), icon, label, cx)
                            .occlude()
                    }),
                ),
            );
        div()
            .id("window-toolbar")
            .absolute()
            .top_0()
            .left_0()
            .w_full()
            .h(px(HEADER_HEIGHT))
            .flex_shrink_0()
            .flex()
            .items_center()
            .pt(px(4.))
            .px(px(8.))
            .window_control_area(gpui::WindowControlArea::Drag)
            .on_mouse_down_out(cx.listener(|this, _, _, _| this.window_should_move = false))
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, _| this.window_should_move = true),
            )
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, _| this.window_should_move = false),
            )
            .on_mouse_move(
                cx.listener(|this, event: &gpui::MouseMoveEvent, window, _| {
                    if this.window_should_move
                        && event.pressed_button == Some(gpui::MouseButton::Left)
                    {
                        this.window_should_move = false;
                        platform::start_window_move(window);
                    }
                }),
            )
            .on_double_click(|_, window, _| window.titlebar_double_click())
            .child(capsule)
            .child(div().w(px(clearance)).flex_shrink_0())
            .child(self.workspace_toolbar(cx))
            .into_any_element()
    }

    fn workspace_toolbar(&self, cx: &Context<Self>) -> AnyElement {
        let colors = self.colors(cx);
        let title = match self.screen {
            Screen::Accounts => self.data.session.as_deref().unwrap_or("Welcome to Sesh"),
            Screen::Credentials => "Credentials",
            Screen::Settings => "Settings",
        };
        let mut toolbar = div()
            .id("workspace-toolbar")
            .h(px(24.))
            .min_w_0()
            .flex()
            .items_center()
            .gap(px(8.))
            .occlude()
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    this.window_should_move = false;
                    cx.stop_propagation();
                }),
            )
            .on_mouse_up(
                gpui::MouseButton::Left,
                cx.listener(|this, _, _, cx| {
                    this.window_should_move = false;
                    cx.stop_propagation();
                }),
            )
            .on_click(|_, _, cx| cx.stop_propagation())
            .child(
                div()
                    .h(px(24.))
                    .max_w(px(320.))
                    .min_w_0()
                    .px(px(6.))
                    .rounded(px(6.))
                    .flex()
                    .items_center()
                    .text_size(px(13.))
                    .font_weight(FontWeight::MEDIUM)
                    .child(div().truncate().child(SharedString::from(title.to_owned()))),
            );
        let mut actions = div().flex().items_center().flex_shrink_0().gap(px(2.));
        if self.screen == Screen::Accounts && self.data.session.is_some() {
            let authenticated = self.authenticated();
            toolbar = toolbar.child(
                div()
                    .h(px(24.))
                    .flex_shrink_0()
                    .px(px(6.))
                    .rounded(px(6.))
                    .flex()
                    .items_center()
                    .child(self.status(
                        if authenticated {
                            "Signed in"
                        } else {
                            "Signed out"
                        },
                        if authenticated {
                            colors.success
                        } else {
                            colors.warning
                        },
                        authenticated,
                    )),
            );
            if !authenticated {
                actions = actions.child(
                    self.button("auth-session", "Sign in", Command::Login, cx)
                        .ghost()
                        .h(px(24.))
                        .px(px(6.))
                        .rounded(px(6.)),
                );
            }
            actions = actions.child(
                self.toolbar_button(
                    Button::new("session-options"),
                    IconName::Ellipsis,
                    "Session actions",
                    cx,
                )
                .on_click(cx.listener(move |this, _, window, cx| {
                    let items = [
                        ("Edit session…", Command::EditSession),
                        ("Open SSO portal", Command::Portal),
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
                        ("Delete session…", Command::DeleteSession),
                    ]
                    .into_iter()
                    .map(|(label, command)| (label, command, false))
                    .collect();
                    this.show_menu(items, window, cx);
                })),
            );
        }
        if self.screen != Screen::Settings {
            actions = actions.child(self.toolbar_button(
                self.button("refresh", "", Command::Refresh, cx),
                Icon::default().path("icons/refresh.svg"),
                "Refresh",
                cx,
            ));
        }
        toolbar.child(actions).into_any_element()
    }

    fn background_texture(&self, window: &Window) -> AnyElement {
        let mut texture = div().absolute().inset_0().overflow_hidden().opacity(0.12);
        let viewport = window.viewport_size();
        let mut y = px(0.);
        while y < viewport.height {
            let mut x = px(0.);
            while x < viewport.width {
                texture = texture.child(
                    img(self.texture.clone())
                        .absolute()
                        .left(x)
                        .top(y)
                        .size(px(256.)),
                );
                x += px(256.);
            }
            y += px(256.);
        }
        texture.into_any_element()
    }

    fn status(&self, label: impl Into<SharedString>, color: Hsla, active: bool) -> AnyElement {
        div()
            .flex()
            .items_center()
            .gap(px(6.))
            .text_size(px(12.))
            .text_color(color)
            .child(
                Icon::new(if active {
                    IconName::CircleCheck
                } else {
                    IconName::CircleX
                })
                .size(px(16.))
                .flex_shrink_0(),
            )
            .child(label.into())
            .into_any_element()
    }
    fn colors(&self, cx: &Context<Self>) -> Colors {
        let theme = cx.theme();
        Colors {
            background: Hsla {
                a: 1.,
                ..theme.background
            },
            sidebar: theme.sidebar,
            border: theme.border,
            text: theme.foreground,
            muted: theme.muted_foreground,
            selection: theme.list_active,
            accent: theme.link,
            success: theme.success,
            warning: theme.warning,
            profile: theme.magenta,
        }
    }

    fn button(
        &self,
        id: impl Into<ElementId>,
        label: impl Into<SharedString>,
        command: Command,
        cx: &Context<Self>,
    ) -> Button {
        let label = label.into();
        Button::new(id)
            .when(!label.is_empty(), |button| button.label(label))
            .h(px(36.))
            .px_3()
            .disabled(
                self.modal()
                    && !matches!(
                        command,
                        Command::Confirm
                            | Command::Cancel
                            | Command::OpenLogin
                            | Command::ClearShortcut(_)
                    ),
            )
            .tab_stop(
                !self.modal()
                    || matches!(
                        command,
                        Command::Confirm
                            | Command::Cancel
                            | Command::OpenLogin
                            | Command::ClearShortcut(_)
                    ),
            )
            .on_click(cx.listener(move |this, _, window, cx| {
                cx.stop_propagation();
                this.dispatch(command.clone(), window, cx);
            }))
    }

    pub(super) fn preferences_dirty(&self, cx: &gpui::App) -> bool {
        let Some(account) = &self.account else {
            return false;
        };
        let role = self.role(cx);
        self.preferences_saving(cx)
            || self.region.read(cx).value().trim() != account.region.as_deref().unwrap_or("")
            || self.profile.read(cx).value().trim()
                != role
                    .as_ref()
                    .and_then(|role| account.profiles.get(role))
                    .map(String::as_str)
                    .unwrap_or("")
    }

    fn copy_value(
        &self,
        id: &'static str,
        value: &str,
        command: Command,
        cx: &Context<Self>,
    ) -> Button {
        let name = matches!(command, Command::CopyName);
        Button::new(id)
            .child(
                div()
                    .max_w(px(270.))
                    .truncate()
                    .text_size(px(if name { 20. } else { 11. }))
                    .font_weight(if name {
                        FontWeight::SEMIBOLD
                    } else {
                        FontWeight::NORMAL
                    })
                    .child(SharedString::from(value.to_owned())),
            )
            .ghost()
            .px_1()
            .h(px(if name { 32. } else { 24. }))
            .justify_start()
            .cursor_pointer()
            .tooltip("Click to copy")
            .disabled(self.modal())
            .tab_stop(!self.modal())
            .on_click(
                cx.listener(move |this, _, window, cx| this.dispatch(command.clone(), window, cx)),
            )
    }

    fn sidebar(&self, cx: &Context<Self>) -> AnyElement {
        let colors = self.colors(cx);
        let sessions =
            self.data
                .sessions
                .iter()
                .enumerate()
                .map(|(index, session)| {
                    let selected = self.screen == Screen::Accounts
                        && self.data.session.as_ref() == Some(&session.name);
                    let name = session.name.clone();
                    let session_name = session.name.clone();
                    let authenticated = session.authenticated;
                    let disabled = self.modal();
                    div()
                        .id(("session-container", index))
                        .flex()
                        .items_center()
                        .gap_1()
                        .child(
                            self.button(
                                ("session", index),
                                SharedString::from(session.name.clone()),
                                Command::Session(session.name.clone()),
                                cx,
                            )
                            .icon(IconName::Building2)
                            .child(
                                Icon::new(if authenticated {
                                    IconName::CircleCheck
                                } else {
                                    IconName::CircleX
                                })
                                .size(px(14.))
                                .text_color(if authenticated {
                                    colors.success
                                } else {
                                    colors.warning
                                }),
                            )
                            .tooltip(if authenticated {
                                "Signed in"
                            } else {
                                "Signed out · double-click to sign in"
                            })
                            .ghost()
                            .selected(selected)
                            .text_color(if authenticated {
                                colors.text
                            } else {
                                colors.muted
                            })
                            .cursor_pointer()
                            .w_full()
                            .justify_start()
                            .on_click(cx.listener(
                                move |this, event: &gpui::ClickEvent, window, cx| {
                                    if this.modal() {
                                        return;
                                    }
                                    let signed_in = this.data.sessions.iter().any(|value| {
                                        value.name == session_name && value.authenticated
                                    });
                                    let command = if event.click_count() == 2 && !signed_in {
                                        Command::SessionAction(
                                            session_name.clone(),
                                            Box::new(Command::Login),
                                        )
                                    } else {
                                        Command::Session(session_name.clone())
                                    };
                                    this.dispatch(command, window, cx);
                                },
                            )),
                        )
                        .on_mouse_down(
                            gpui::MouseButton::Right,
                            cx.listener(move |this, _, window, cx| {
                                if disabled {
                                    return;
                                }
                                let items = [
                                    ("Open SSO portal", Command::Portal),
                                    ("Edit session…", Command::EditSession),
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
                                    ("Delete session…", Command::DeleteSession),
                                ]
                                .into_iter()
                                .map(|(label, command)| {
                                    (
                                        label,
                                        Command::SessionAction(name.clone(), Box::new(command)),
                                        false,
                                    )
                                })
                                .collect();
                                this.show_menu(items, window, cx);
                                cx.stop_propagation();
                            }),
                        )
                });
        div()
            .w(px(self.sidebar_width))
            .flex_shrink_0()
            .h_full()
            .flex()
            .flex_col()
            .border_r_1()
            .border_color(colors.border)
            .when(cfg!(target_os = "macos"), |sidebar| {
                sidebar.pt(px(HEADER_HEIGHT))
            })
            .child(
                div()
                    .px_5()
                    .pt_4()
                    .pb_2()
                    .text_size(px(11.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(colors.muted)
                    .child("Organizations"),
            )
            .child(
                div()
                    .id("session-sidebar")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .px_3()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .children(sessions)
                    .child(
                        self.button("add-session", "Add SSO session", Command::NewSession, cx)
                            .icon(IconName::Plus)
                            .ghost()
                            .w_full()
                            .justify_start(),
                    ),
            )
            .child(
                div()
                    .px_3()
                    .py_3()
                    .border_t_1()
                    .border_color(colors.border)
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(
                        self.button(
                            "show-credentials",
                            SharedString::from(format!(
                                "Credentials   {}",
                                self.data.credentials.len()
                            )),
                            Command::Credentials,
                            cx,
                        )
                        .icon(IconName::SquareTerminal)
                        .ghost()
                        .selected(self.screen == Screen::Credentials)
                        .w_full()
                        .justify_start(),
                    )
                    .child(
                        self.button("settings", "Settings", Command::Settings, cx)
                            .icon(IconName::Settings)
                            .ghost()
                            .selected(self.screen == Screen::Settings)
                            .w_full()
                            .justify_start(),
                    ),
            )
            .into_any_element()
    }

    fn row(&self, position: usize, index: usize, cx: &Context<Self>) -> AnyElement {
        let colors = self.colors(cx);
        let (title, detail, status, status_color) = if self.screen == Screen::Accounts {
            let value = &self.data.accounts[index];
            let active = self
                .data
                .credentials
                .iter()
                .filter(|credential| {
                    credential.account_id == value.account_id
                        && Some(&credential.session_name) == self.data.session.as_ref()
                })
                .min_by_key(|credential| !credential.is_default);
            (
                value.name.clone(),
                value
                    .last_profile
                    .as_ref()
                    .map(|profile| format!("{} · {}", value.account_id, profile))
                    .unwrap_or_else(|| value.account_id.clone()),
                active
                    .map(|value| {
                        if value.is_default {
                            "Default".to_owned()
                        } else {
                            "Active".to_owned()
                        }
                    })
                    .unwrap_or_default(),
                active
                    .map(|value| {
                        if value.is_default {
                            colors.success
                        } else {
                            colors.profile
                        }
                    })
                    .unwrap_or(colors.muted),
            )
        } else {
            let value = &self.data.credentials[index];
            (
                value.account_name.clone(),
                format!("{} · {}", value.profile_name, value.role_name),
                if value.is_default {
                    "Default".into()
                } else {
                    remaining(&value.expiration)
                },
                if value.is_default {
                    colors.success
                } else {
                    colors.profile
                },
            )
        };
        let selected = self.selected == Some(position);
        let cached = self.screen == Screen::Accounts && !self.authenticated();
        let disabled = self.modal();
        let account_row = self.screen == Screen::Accounts;
        div()
            .id(("row", position))
            .w_full()
            .h(px(74.))
            .px_3()
            .py_1()
            .child(
                div()
                    .h_full()
                    .w_full()
                    .flex()
                    .items_center()
                    .gap_3()
                    .px_3()
                    .rounded_md()
                    .bg(if selected {
                        colors.selection
                    } else {
                        Hsla::transparent_black()
                    })
                    .id(("row-surface", position))
                    .cursor_pointer()
                    .hover(move |style| {
                        style.bg(if selected {
                            colors.selection
                        } else {
                            colors.sidebar
                        })
                    })
                    .text_color(if cached { colors.muted } else { colors.text })
                    .child(
                        Icon::new(if self.screen == Screen::Accounts {
                            IconName::Building2
                        } else {
                            IconName::SquareTerminal
                        })
                        .size(px(18.))
                        .flex_shrink_0()
                        .text_color(if selected {
                            colors.accent
                        } else {
                            colors.muted
                        }),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap_1()
                            .child(
                                div()
                                    .truncate()
                                    .font_weight(FontWeight::MEDIUM)
                                    .child(title),
                            )
                            .child(
                                div()
                                    .truncate()
                                    .font_family(platform::mono_font())
                                    .text_size(px(11.))
                                    .text_color(colors.muted)
                                    .child(detail),
                            ),
                    )
                    .when(!status.is_empty(), |row| {
                        row.child(self.status(status, status_color, true))
                    }),
            )
            .on_click(
                cx.listener(move |this, event: &gpui::ClickEvent, window, cx| {
                    if this.modal() {
                        return;
                    }
                    if event.click_count() == 2 && this.screen == Screen::Accounts {
                        this.dispatch(
                            Command::ItemAction(position, Box::new(Command::SetCredentials)),
                            window,
                            cx,
                        );
                        return;
                    }
                    this.selected = Some(position);
                    this.focus.focus(window);
                    this.inspect(window, cx);
                    cx.notify();
                }),
            )
            .on_mouse_down(
                gpui::MouseButton::Right,
                cx.listener(move |this, _, window, cx| {
                    if disabled {
                        return;
                    }
                    let commands = if account_row {
                        vec![
                            ("Set credentials", Command::SetCredentials, cached),
                            ("Open AWS Console", Command::Console, false),
                            ("Copy account ID", Command::CopyAccount, false),
                            ("Copy account name", Command::CopyName, false),
                        ]
                    } else {
                        vec![
                            ("Copy CLI profile", Command::CopyProfile, false),
                            ("Copy account ID", Command::CopyAccount, false),
                            ("Copy account name", Command::CopyName, false),
                            ("Remove profile…", Command::RemoveCredential, false),
                        ]
                    };
                    let items = commands
                        .into_iter()
                        .map(|(label, command, unavailable)| {
                            (
                                label,
                                Command::ItemAction(position, Box::new(command)),
                                unavailable,
                            )
                        })
                        .collect();
                    this.show_menu(items, window, cx);
                    cx.stop_propagation();
                }),
            )
            .into_any_element()
    }

    fn list(&self, cx: &mut Context<Self>) -> AnyElement {
        let colors = self.colors(cx);
        let visible = self.visible(cx);
        let count = visible.len();
        let title = if self.screen == Screen::Credentials {
            "Active profiles"
        } else {
            "Accounts"
        };
        let mut list = div()
            .flex_1()
            .min_w_0()
            .h_full()
            .flex()
            .flex_col()
            .child(
                div()
                    .px_5()
                    .pt_4()
                    .pb_3()
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(div().font_weight(FontWeight::SEMIBOLD).child(title))
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(colors.muted)
                            .child(count.to_string()),
                    ),
            )
            .child(
                div().px_4().pb_3().child(
                    Input::new(&self.search)
                        .large()
                        .min_h(px(44.))
                        .prefix(Icon::new(IconName::Search))
                        .disabled(self.modal()),
                ),
            );
        if count > 0 {
            list = list.child(
                uniform_list(
                    "items",
                    count,
                    cx.processor(move |this, range: std::ops::Range<usize>, _, cx| {
                        range
                            .map(|position| this.row(position, visible[position], cx))
                            .collect::<Vec<_>>()
                    }),
                )
                .w_full()
                .flex_1()
                .track_scroll(self.scroll.clone()),
            );
        } else {
            let (heading, description) = if self.busy || !self.initialized {
                ("Loading…", "Reading your workspace and cached accounts.")
            } else if !self.search.read(cx).value().is_empty() {
                (
                    "No matching results",
                    "Try an account name, ID, role or profile.",
                )
            } else if self.screen == Screen::Credentials {
                (
                    "No active credentials",
                    "Set credentials from an account’s inspector to see its profile here.",
                )
            } else if self.data.session.is_none() {
                (
                    "Connect your organization",
                    "Add an SSO session to start browsing AWS accounts.",
                )
            } else if !self.authenticated() {
                (
                    "Sign in to load accounts",
                    "Authorize this organization in your browser. Cached accounts remain available when signed out.",
                )
            } else if self.busy {
                (
                    "Loading accounts…",
                    "Fetching your organization’s available accounts.",
                )
            } else {
                (
                    "No accounts found",
                    "Refresh to check the organization’s account list.",
                )
            };
            let mut empty = div()
                .flex_1()
                .flex()
                .flex_col()
                .justify_center()
                .items_center()
                .p_6()
                .gap_3()
                .child(
                    Icon::new(IconName::Inbox)
                        .size(px(28.))
                        .text_color(colors.muted),
                )
                .child(div().font_weight(FontWeight::SEMIBOLD).child(heading))
                .child(
                    div()
                        .text_size(px(12.))
                        .text_color(colors.muted)
                        .text_center()
                        .child(description),
                );
            if !self.busy
                && self.initialized
                && self.screen == Screen::Accounts
                && self.search.read(cx).value().is_empty()
            {
                empty = empty.child(
                    self.button(
                        "empty-action",
                        if self.data.session.is_some() {
                            "Sign in"
                        } else {
                            "Add SSO session"
                        },
                        if self.data.session.is_some() {
                            Command::Login
                        } else {
                            Command::NewSession
                        },
                        cx,
                    )
                    .primary(),
                );
            }
            list = list.child(empty);
        }
        list.into_any_element()
    }

    fn metadata(&self, label: &str, value: &str, cx: &Context<Self>) -> AnyElement {
        div()
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .font_weight(FontWeight::MEDIUM)
                    .child(SharedString::from(label.to_owned())),
            )
            .child(
                div()
                    .min_h(px(44.))
                    .px_4()
                    .flex()
                    .items_center()
                    .rounded(cx.theme().radius)
                    .border_1()
                    .border_color(cx.theme().input)
                    .bg(cx.theme().background)
                    .when(cx.theme().shadow, |field| field.shadow_xs())
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .text_base()
                            .child(SharedString::from(value.to_owned())),
                    ),
            )
            .into_any_element()
    }

    fn expiry(&self, value: &str, cx: &Context<Self>) -> AnyElement {
        let colors = self.colors(cx);
        div()
            .p_3()
            .rounded_md()
            .bg(colors.sidebar)
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .font_weight(FontWeight::MEDIUM)
                    .child(remaining(value)),
            )
            .child(
                div()
                    .text_size(px(12.))
                    .text_color(colors.muted)
                    .child(format!("Expires at {} local time", expiration(value))),
            )
            .into_any_element()
    }

    fn inspector(&self, cx: &Context<Self>) -> AnyElement {
        let colors = self.colors(cx);
        let mut panel = div()
            .id("inspector")
            .w(px(344.))
            .flex_shrink_0()
            .h_full()
            .overflow_y_scroll()
            .p_5()
            .flex()
            .flex_col()
            .gap_5()
            .border_l_1()
            .border_color(colors.border);
        if self.screen == Screen::Credentials {
            if let Some(value) = self.credential(cx) {
                panel = panel
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_2()
                            .child(
                                self.copy_value(
                                    "credential-name",
                                    &value.account_name,
                                    Command::CopyName,
                                    cx,
                                )
                                .text_size(px(20.))
                                .font_weight(FontWeight::SEMIBOLD),
                            )
                            .child(
                                self.copy_value(
                                    "credential-id",
                                    &value.account_id,
                                    Command::CopyAccount,
                                    cx,
                                )
                                .font_family(platform::mono_font())
                                .text_size(px(11.))
                                .text_color(colors.muted),
                            ),
                    )
                    .child(self.metadata("Role", &value.role_name, cx))
                    .child(self.metadata(
                        "Region",
                        value.region.as_deref().unwrap_or("Not configured"),
                        cx,
                    ))
                    .child(self.metadata("CLI profile", &value.profile_name, cx))
                    .child(self.metadata("Organization", &value.session_name, cx))
                    .child(self.expiry(&value.expiration, cx))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_2()
                            .pt_3()
                            .border_t_1()
                            .border_color(colors.border)
                            .child(
                                self.button(
                                    "copy-profile",
                                    "Copy profile",
                                    Command::CopyProfile,
                                    cx,
                                )
                                .icon(IconName::Copy)
                                .w_full(),
                            )
                            .child(
                                self.button(
                                    "remove-credential",
                                    "Remove profile…",
                                    Command::RemoveCredential,
                                    cx,
                                )
                                .danger()
                                .w_full(),
                            ),
                    );
            } else {
                panel = panel.child(
                    div()
                        .pt_10()
                        .text_color(colors.muted)
                        .text_center()
                        .child("Select a profile to inspect its credentials."),
                );
            }
            return panel.into_any_element();
        }
        let Some(account) = &self.account else {
            return panel
                .child(
                    div()
                        .pt_10()
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap_3()
                        .text_color(colors.muted)
                        .child(Icon::new(IconName::Inspector).size(px(28.)))
                        .child("Select an account"),
                )
                .into_any_element();
        };
        let role = self.role(cx);
        let ready = role.is_some() && self.authenticated();
        let active = self.data.credentials.iter().find(|value| {
            value.account_id == account.account_id
                && Some(&value.session_name) == self.data.session.as_ref()
                && Some(&value.role_name) == role.as_ref()
        });
        panel = panel
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(
                        self.copy_value("account-name", &account.name, Command::CopyName, cx)
                            .text_size(px(20.))
                            .font_weight(FontWeight::SEMIBOLD),
                    )
                    .child(
                        div().flex().items_center().justify_between().gap_2().child(
                            self.copy_value(
                                "account-id",
                                &account.account_id,
                                Command::CopyAccount,
                                cx,
                            )
                            .font_family(platform::mono_font())
                            .text_size(px(11.))
                            .text_color(colors.muted),
                        ),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(div().font_weight(FontWeight::MEDIUM).child("Role"))
                    .child(theme::opaque_select(
                        RoleSelect::new(&self.roles)
                            .placeholder(if self.busy && !account.roles_loaded {
                                "Loading roles…"
                            } else {
                                "Select a role"
                            })
                            .large()
                            .h(px(44.))
                            .w_full()
                            .disabled(self.modal()),
                    ))
                    .when(
                        role.is_some() && role != account.preferred_role,
                        |section| {
                            section.child(
                                self.button(
                                    "prefer-role",
                                    "Make preferred",
                                    Command::PreferRole,
                                    cx,
                                )
                                .ghost(),
                            )
                        },
                    ),
            );
        if !account.roles_loaded || account.roles.is_empty() {
            panel = panel.child(self.button(
                "load-roles",
                if self.authenticated() {
                    "Load roles"
                } else {
                    "Sign in to load roles"
                },
                if self.authenticated() {
                    Command::LoadRoles
                } else {
                    Command::Login
                },
                cx,
            ));
        }
        panel = panel
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(div().font_weight(FontWeight::MEDIUM).child("Region"))
                    .child(
                        Input::new(&self.region)
                            .large()
                            .min_h(px(44.))
                            .disabled(self.modal()),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(div().font_weight(FontWeight::MEDIUM).child("CLI profile"))
                    .child(
                        Input::new(&self.profile)
                            .large()
                            .min_h(px(44.))
                            .disabled(self.modal() || role.is_none()),
                    ),
            );
        if let Some(active) = active {
            panel = panel.child(self.expiry(&active.expiration, cx));
        }
        if self.preferences_dirty(cx) {
            panel = panel.child(div().text_size(px(11.)).text_color(colors.muted).child(
                if self.preferences_saving(cx) {
                    "Saving preferences…"
                } else {
                    "Preferences could not be saved. Check the region and profile."
                },
            ));
        }
        panel = panel.child(
            div()
                .flex()
                .flex_col()
                .gap_2()
                .pt_3()
                .border_t_1()
                .border_color(colors.border)
                .child(
                    self.button(
                        "set-credentials",
                        "Set credentials",
                        Command::SetCredentials,
                        cx,
                    )
                    .primary()
                    .w_full()
                    .disabled(self.modal() || !ready || self.preferences_dirty(cx)),
                )
                .child(
                    self.button("open-console", "Open AWS Console", Command::Console, cx)
                        .icon(IconName::ExternalLink)
                        .w_full()
                        .disabled(self.modal() || role.is_none()),
                ),
        );
        if !self.authenticated() {
            panel = panel.child(
                self.button(
                    "inspector-login",
                    "Sign in to this organization",
                    Command::Login,
                    cx,
                )
                .w_full(),
            );
        }
        panel.into_any_element()
    }

    fn settings(&self, cx: &Context<Self>) -> AnyElement {
        let colors = self.colors(cx);
        let choices = [("system", "System"), ("light", "Light"), ("dark", "Dark")];
        div()
            .id("settings-content")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .p_8()
            .flex()
            .flex_col()
            .gap_6()
            .child(
                div()
                    .max_w(px(650.))
                    .flex_shrink_0()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .child(
                        div()
                            .text_size(px(16.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Appearance"),
                    )
                    .child(
                        div()
                            .text_color(colors.muted)
                            .child("Follow your system, or choose a light or dark workspace."),
                    )
                    .child(div().flex().gap_2().children(choices.into_iter().map(
                        |(value, label)| {
                            self.button(value, label, Command::Appearance(value.into()), cx)
                                .selected(self.appearance.mode == value)
                        },
                    )))
                    .child(div().pt_3().font_weight(FontWeight::MEDIUM).child("Theme"))
                    .child(theme::opaque_select(
                        RoleSelect::new(&self.themes)
                            .large()
                            .h(px(44.))
                            .w(px(320.))
                            .disabled(self.modal()),
                    ))
                    .child(
                        self.button(
                            "open-theme-directory",
                            "Open theme location",
                            Command::OpenThemeDirectory,
                            cx,
                        )
                        .icon(IconName::Folder)
                        .w(px(320.)),
                    )
                    .child(
                        div()
                            .pt_3()
                            .font_weight(FontWeight::MEDIUM)
                            .child("Window background"),
                    )
                    .child(
                        div()
                            .w(px(420.))
                            .flex()
                            .flex_col()
                            .gap_2()
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .child("Translucency")
                                    .child(div().text_color(colors.muted).child(format!(
                                        "{:.0}%",
                                        self.translucency.read(cx).value().end()
                                    ))),
                            )
                            .child(
                                div()
                                    .id("translucency-control")
                                    .px_2()
                                    .py_1()
                                    .rounded_md()
                                    .border_1()
                                    .border_color(Hsla::transparent_black())
                                    .track_focus(&self.translucency_focus)
                                    .tab_stop(!self.modal())
                                    .key_context("Translucency")
                                    .focus(move |style| style.border_color(colors.accent))
                                    .capture_any_mouse_down(cx.listener(
                                        |this, event: &gpui::MouseDownEvent, window, cx| {
                                            if event.button == gpui::MouseButton::Left
                                                && !this.modal()
                                            {
                                                this.translucency_focus.focus(window);
                                                cx.notify();
                                            }
                                        },
                                    ))
                                    .on_key_down(cx.listener(
                                        |this, event: &gpui::KeyDownEvent, window, cx| {
                                            if this.modal() {
                                                return;
                                            }
                                            let value = this.translucency.read(cx).value().end();
                                            let amount = match event.keystroke.key.as_str() {
                                                "left" => value - 1.,
                                                "right" => value + 1.,
                                                "home" => 0.,
                                                "end" => 100.,
                                                _ => return,
                                            };
                                            this.dispatch(
                                                Command::Translucency(amount),
                                                window,
                                                cx,
                                            );
                                            cx.stop_propagation();
                                        },
                                    ))
                                    .child(
                                        div()
                                            .relative()
                                            .child(
                                                div()
                                                    .absolute()
                                                    .left(relative(0.1))
                                                    .top(px(6.))
                                                    .w(px(1.))
                                                    .h(px(12.))
                                                    .bg(colors.muted),
                                            )
                                            .child(
                                                Slider::new(&self.translucency)
                                                    .disabled(self.modal()),
                                            ),
                                    ),
                            ),
                    )
                    .child(
                        Checkbox::new("dither-texture")
                            .label("Dither texture")
                            .checked(self.appearance.dithering)
                            .disabled(
                                self.translucency.read(cx).value().end() == 0. || self.modal(),
                            )
                            .key_context("DitherTexture")
                            .on_action(cx.listener(|this, _: &ToggleDithering, window, cx| {
                                if this.translucency.read(cx).value().end() > 0. && !this.modal() {
                                    this.dispatch(
                                        Command::Dithering(!this.appearance.dithering),
                                        window,
                                        cx,
                                    );
                                }
                            }))
                            .on_click(cx.listener(|this, checked: &bool, window, cx| {
                                this.dispatch(Command::Dithering(*checked), window, cx);
                            })),
                    ),
            )
            .child(
                div()
                    .max_w(px(650.))
                    .flex_shrink_0()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .pt_5()
                    .border_t_1()
                    .border_color(colors.border)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .text_size(px(16.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child("Keyboard shortcuts"),
                            )
                            .child(
                                self.button(
                                    "reset-shortcuts",
                                    "Restore defaults",
                                    Command::ResetShortcuts,
                                    cx,
                                )
                                .disabled(
                                    self.modal()
                                        || (self.shortcuts.is_empty()
                                            && self.appearance.shortcuts.is_empty()),
                                ),
                            ),
                    )
                    .children(platform::shortcuts().into_iter().map(|shortcut| {
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .py_1()
                            .gap_4()
                            .child(div().flex_1().child(shortcut.label))
                            .child(
                                self.button(
                                    shortcut.id,
                                    platform::shortcut_label(shortcut.id, &self.shortcuts),
                                    Command::RecordShortcut(shortcut.id),
                                    cx,
                                )
                                .min_w(px(112.)),
                            )
                    })),
            )
            .child(
                div()
                    .max_w(px(650.))
                    .flex_shrink_0()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .pt_5()
                    .border_t_1()
                    .border_color(colors.border)
                    .child(
                        div()
                            .font_family(platform::mono_font())
                            .text_size(px(11.))
                            .line_height(px(17.))
                            .text_color(colors.accent)
                            .child(include_str!("../assets/wordmark.txt")),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap_1()
                            .text_size(px(12.))
                            .text_color(colors.muted)
                            .child("Open Source AWS Session Manager – presented by")
                            .child(
                                Button::new("elva-link")
                                    .link()
                                    .h(px(24.))
                                    .p_0()
                                    .cursor_pointer()
                                    .child(
                                        div()
                                            .text_size(px(12.))
                                            .text_color(colors.accent)
                                            .text_decoration_1()
                                            .child("Elva"),
                                    )
                                    .disabled(self.modal())
                                    .tab_stop(!self.modal())
                                    .tooltip("https://elva-group.com")
                                    .on_click(|_, _, cx| cx.open_url("https://elva-group.com")),
                            ),
                    )
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(colors.muted)
                            .child(format!(
                                "Sesh {} · Native desktop client for awsesh",
                                env!("CARGO_PKG_VERSION")
                            )),
                    ),
            )
            .into_any_element()
    }

    fn overlays(&self, cx: &Context<Self>) -> Option<AnyElement> {
        let colors = self.colors(cx);
        let mut panel = div()
            .w(px(480.))
            .p_6()
            .flex()
            .flex_col()
            .gap_4()
            .bg(colors.background)
            .border_1()
            .border_color(colors.border)
            .rounded_lg()
            .shadow_lg();
        if let Some(id) = self.recording {
            let label = platform::shortcuts()
                .into_iter()
                .find(|shortcut| shortcut.id == id)
                .map(|shortcut| shortcut.label)
                .unwrap_or("Shortcut");
            panel = panel
                .child(
                    div()
                        .text_size(px(18.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child("Change shortcut"),
                )
                .child(label)
                .child(
                    div()
                        .p_4()
                        .rounded_md()
                        .border_1()
                        .border_color(colors.accent)
                        .text_color(colors.muted)
                        .child("Press a key combination. Escape cancels."),
                )
                .when_some(self.shortcut_error.clone(), |panel, error| {
                    panel.child(div().text_color(cx.theme().danger).child(error))
                })
                .child(
                    div()
                        .flex()
                        .justify_end()
                        .gap_2()
                        .child(self.button(
                            "disable-shortcut",
                            "Disable shortcut",
                            Command::ClearShortcut(id),
                            cx,
                        ))
                        .child(self.button("cancel-shortcut", "Cancel", Command::Cancel, cx)),
                );
        } else if let Some(form) = &self.form {
            let submitting = self
                .active
                .as_ref()
                .is_some_and(|(operation, _)| *operation == form.operation)
                || self
                    .requests
                    .iter()
                    .any(|(operation, _)| *operation == form.operation);
            panel = panel
                .child(
                    div()
                        .text_size(px(18.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(form.title.clone()),
                )
                .child(
                    div()
                        .text_color(colors.muted)
                        .child(form.description.clone()),
                );
            for (key, input) in &form.fields {
                let label = match key.as_str() {
                    "name" => "Session name",
                    "startUrl" => "SSO start URL",
                    "ssoRegion" => "SSO region",
                    "defaultRegion" => "Default region",
                    _ => key,
                };
                panel = panel.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(SharedString::from(label.to_owned()))
                        .child(
                            Input::new(input)
                                .large()
                                .min_h(px(44.))
                                .disabled(submitting),
                        )
                        .when(
                            key == "startUrl" && !input.read(cx).value().trim().is_empty(),
                            |field| {
                                field.child(
                                    div()
                                        .font_family(platform::mono_font())
                                        .text_size(px(11.))
                                        .text_color(colors.muted)
                                        .child(sso_start_url(&input.read(cx).value())),
                                )
                            },
                        ),
                );
            }
            if self.error {
                panel = panel.child(
                    div()
                        .text_color(cx.theme().danger)
                        .child(self.message.clone()),
                );
            }
            let confirm = self
                .button(
                    "confirm-form",
                    if submitting {
                        "Working…"
                    } else if form.destructive {
                        "Remove"
                    } else {
                        "Save session"
                    },
                    Command::Confirm,
                    cx,
                )
                .disabled(submitting);
            panel = panel.child(
                div()
                    .flex()
                    .justify_end()
                    .gap_2()
                    .child(self.button("cancel-form", "Cancel", Command::Cancel, cx))
                    .child(if form.destructive {
                        confirm.danger()
                    } else {
                        confirm.primary()
                    }),
            );
        } else if let Some(login) = &self.login {
            panel = panel
                .child(
                    div()
                        .text_size(px(18.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(if login.code.is_empty() {
                            "Connecting to AWS…"
                        } else {
                            "Authorize in your browser"
                        }),
                )
                .child(
                    div()
                        .text_color(colors.muted)
                        .child(if login.code.is_empty() {
                            "Starting SSO sign-in"
                        } else {
                            "Check that this code matches the code shown in your browser."
                        }),
                )
                .child(
                    div()
                        .py_4()
                        .font_family(platform::mono_font())
                        .text_size(px(28.))
                        .text_center()
                        .child(login.code.clone()),
                )
                .child(
                    div()
                        .text_size(px(12.))
                        .text_color(colors.muted)
                        .child("Waiting for AWS authorization…"),
                )
                .child(
                    div()
                        .flex()
                        .justify_end()
                        .gap_2()
                        .child(self.button("cancel-login", "Cancel", Command::Cancel, cx))
                        .child(
                            self.button("open-login", "Open browser again", Command::OpenLogin, cx)
                                .primary()
                                .disabled(login.url.is_empty()),
                        ),
                );
        } else if self.palette {
            let commands = self.commands(cx);
            let count = commands.len();
            panel = panel
                .w(px(560.))
                .p_3()
                .child(
                    Input::new(&self.command_search)
                        .large()
                        .min_h(px(44.))
                        .prefix(Icon::new(IconName::Search)),
                )
                .child(
                    uniform_list(
                        "command-results",
                        count,
                        cx.processor(move |this, range: std::ops::Range<usize>, _, cx| {
                            let colors = this.colors(cx);
                            range
                                .map(|index| {
                                    let (label, command) = &commands[index];
                                    let command = command.clone();
                                    div()
                                        .id(("command-result", index))
                                        .w_full()
                                        .h(px(44.))
                                        .px_3()
                                        .flex()
                                        .items_center()
                                        .justify_between()
                                        .rounded_md()
                                        .bg(if this.command_selected == index {
                                            colors.selection
                                        } else {
                                            colors.background
                                        })
                                        .cursor_pointer()
                                        .hover(move |style| style.bg(colors.sidebar))
                                        .child(label.clone())
                                        .child(div().text_color(colors.muted).child(
                                            if this.command_selected == index {
                                                "↵"
                                            } else {
                                                ""
                                            },
                                        ))
                                        .on_click(cx.listener(move |this, _, window, cx| {
                                            this.dispatch(command.clone(), window, cx)
                                        }))
                                        .into_any_element()
                                })
                                .collect::<Vec<_>>()
                        }),
                    )
                    .h(px((count.min(8) * 44) as f32))
                    .w_full()
                    .track_scroll(self.command_scroll.clone()),
                )
                .when(count == 0, |panel| {
                    panel.child(
                        div()
                            .p_4()
                            .text_color(colors.muted)
                            .child("No matching commands"),
                    )
                })
                .child(
                    div()
                        .border_t_1()
                        .border_color(colors.border)
                        .pt_3()
                        .px_2()
                        .text_size(px(11.))
                        .text_color(colors.muted)
                        .child("↑ ↓ Navigate     ↵ Run command     Esc Close"),
                );
        } else {
            return None;
        }
        Some(
            div()
                .absolute()
                .inset_0()
                .occlude()
                .bg(gpui::rgba(0x00000044))
                .flex()
                .items_center()
                .justify_center()
                .child(panel)
                .into_any_element(),
        )
    }
}

impl Render for Sesh {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if let Some((_, started)) = self.sidebar_transition {
            if started.elapsed().as_secs_f32() >= 0.2 || platform::reduced_motion() {
                self.sidebar_transition = None;
            } else {
                window.request_animation_frame();
            }
        }
        let sidebar = self.sidebar_progress();
        let colors = self.colors(cx);
        let body = if self.screen == Screen::Settings {
            self.settings(cx)
        } else {
            div()
                .flex_1()
                .min_h_0()
                .flex()
                .child(self.list(cx))
                .child(self.inspector(cx))
                .into_any_element()
        };
        let default = self.data.credentials.iter().find(|value| value.is_default);
        let status = default
            .map(|value| {
                format!(
                    "Default: {} · {} · {}",
                    value.account_name,
                    value.role_name,
                    remaining(&value.expiration)
                )
            })
            .unwrap_or_else(|| "No default credentials".into());
        let mut root = div()
            .relative()
            .size_full()
            .flex()
            .flex_col()
            .text_color(colors.text)
            .font_family(cx.theme().font_family.clone())
            .text_size(px(14.))
            .key_context("Sesh")
            .on_key_up(cx.listener(|this, event: &gpui::KeyUpEvent, _, _| {
                if this.shortcut_release.as_deref() == Some(event.keystroke.key.as_str()) {
                    this.shortcut_release = None;
                }
            }))
            .track_focus(&self.focus)
            .capture_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if !this.palette || !matches!(event.keystroke.key.as_str(), "up" | "down") {
                    return;
                }
                let count = this.commands(cx).len();
                if count > 0 {
                    this.command_selected = if event.keystroke.key == "down" {
                        (this.command_selected + 1) % count
                    } else {
                        (this.command_selected + count - 1) % count
                    };
                    this.command_scroll
                        .scroll_to_item(this.command_selected, gpui::ScrollStrategy::Center);
                }
                cx.stop_propagation();
                cx.notify();
            }))
            .on_action(cx.listener(|this, _: &Next, window, cx| this.move_selection(1, window, cx)))
            .on_action(
                cx.listener(|_, _: &platform::CloseWindow, window, _| window.remove_window()),
            )
            .on_action(
                cx.listener(|this, _: &Previous, window, cx| this.move_selection(-1, window, cx)),
            )
            .on_action(cx.listener(|this, _: &Select, window, cx| {
                this.dispatch(
                    if this.form.is_some() {
                        Command::Confirm
                    } else {
                        Command::Inspect
                    },
                    window,
                    cx,
                )
            }))
            .on_action(cx.listener(|this, _: &SetCredentials, window, cx| {
                this.dispatch(Command::SetCredentials, window, cx)
            }))
            .on_action(
                cx.listener(|this, _: &Back, window, cx| {
                    this.dispatch(Command::Cancel, window, cx)
                }),
            )
            .on_action(cx.listener(|this, _: &Search, window, cx| {
                if !this.modal() {
                    this.search.update(cx, |input, cx| input.focus(window, cx));
                }
            }))
            .on_action(cx.listener(|this, _: &Refresh, window, cx| {
                this.dispatch(Command::Refresh, window, cx)
            }))
            .on_action(cx.listener(|this, _: &Console, window, cx| {
                this.dispatch(Command::Console, window, cx)
            }))
            .on_action(cx.listener(|this, _: &Accounts, window, cx| {
                this.dispatch(Command::Accounts, window, cx)
            }))
            .on_action(cx.listener(|this, _: &Credentials, window, cx| {
                this.dispatch(Command::Credentials, window, cx)
            }))
            .on_action(cx.listener(|this, _: &Preferences, window, cx| {
                this.dispatch(Command::Settings, window, cx)
            }))
            .on_action(cx.listener(|this, _: &NewSession, window, cx| {
                this.dispatch(Command::NewSession, window, cx)
            }))
            .on_action(cx.listener(|this, _: &EditSession, window, cx| {
                this.dispatch(Command::EditSession, window, cx)
            }))
            .on_action(cx.listener(|this, _: &Palette, window, cx| {
                this.dispatch(Command::Palette, window, cx)
            }))
            .on_action(cx.listener(|this, _: &ToggleSidebar, window, cx| {
                this.dispatch(Command::ToggleSidebar, window, cx)
            }))
            .when(
                self.translucency.read(cx).value().end() > 0. && self.appearance.dithering,
                |root| root.child(self.background_texture(window)),
            )
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .child(
                        div()
                            .relative()
                            .w(px(self.sidebar_width * sidebar))
                            .flex_shrink_0()
                            .h_full()
                            .overflow_hidden()
                            .when(sidebar > 0., |container| container.child(self.sidebar(cx)))
                            .when(sidebar == 1. && !self.modal(), |container| {
                                container.child(
                                    div()
                                        .id("sidebar-resize")
                                        .absolute()
                                        .right_0()
                                        .top(px(HEADER_HEIGHT))
                                        .bottom_0()
                                        .w(px(6.))
                                        .cursor_col_resize()
                                        .track_focus(&self.sidebar_resize_focus)
                                        .tab_stop(true)
                                        .focus(|style| style.bg(colors.accent.opacity(0.35)))
                                        .on_mouse_down(
                                            gpui::MouseButton::Left,
                                            cx.listener(|this, _, window, cx| {
                                                this.sidebar_resize_focus.focus(window);
                                                cx.notify();
                                            }),
                                        )
                                        .on_key_down(cx.listener(
                                            |this, event: &gpui::KeyDownEvent, window, cx| {
                                                let width = match event.keystroke.key.as_str() {
                                                    "left" => this.sidebar_width - 8.,
                                                    "right" => this.sidebar_width + 8.,
                                                    "home" => 192.,
                                                    "end" => 400.,
                                                    _ => return,
                                                };
                                                this.dispatch(
                                                    Command::SidebarWidth(width),
                                                    window,
                                                    cx,
                                                );
                                                cx.stop_propagation();
                                            },
                                        ))
                                        .occlude()
                                        .hover(|style| style.bg(colors.accent.opacity(0.35)))
                                        .on_drag(SidebarResize, |value, _, _, cx| {
                                            cx.new(|_| value.clone())
                                        })
                                        .on_drag_move(cx.listener(
                                            |this,
                                             event: &gpui::DragMoveEvent<SidebarResize>,
                                             window,
                                             cx| {
                                                this.dispatch(
                                                    Command::SidebarWidth(f32::from(
                                                        event.event.position.x,
                                                    )),
                                                    window,
                                                    cx,
                                                );
                                            },
                                        )),
                                )
                            }),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .when(cfg!(target_os = "macos"), |main| {
                                main.child(div().h(px(HEADER_HEIGHT)).flex_shrink_0())
                            })
                            .when(!cfg!(target_os = "macos"), |main| {
                                main.child(
                                    div()
                                        .h(px(HEADER_HEIGHT))
                                        .flex_shrink_0()
                                        .px_4()
                                        .flex()
                                        .items_center()
                                        .child(self.workspace_toolbar(cx)),
                                )
                            })
                            .child(body),
                    ),
            )
            .child(
                div()
                    .h(px(32.))
                    .flex_shrink_0()
                    .px_4()
                    .flex()
                    .items_center()
                    .gap_4()
                    .border_t_1()
                    .border_color(colors.border)
                    .text_size(px(11.))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .truncate()
                            .text_color(colors.muted)
                            .child(status),
                    )
                    .child(
                        div()
                            .max_w(px(650.))
                            .truncate()
                            .text_color(if self.error {
                                cx.theme().danger
                            } else {
                                colors.muted
                            })
                            .child(if self.busy && self.message.is_empty() {
                                "Updating…".into()
                            } else {
                                self.message.clone()
                            }),
                    ),
            );
        if cfg!(target_os = "macos") {
            root = root.child(self.window_toolbar(sidebar, window, cx));
        }
        if let Some((position, menu, _)) = &self.popup {
            root = root.child(
                deferred(
                    anchored()
                        .position(*position)
                        .snap_to_window_with_margin(px(8.))
                        .child(
                            div().rounded(cx.theme().radius).shadow_sm().child(
                                div()
                                    .rounded(cx.theme().radius)
                                    .overflow_hidden()
                                    .child(menu.clone()),
                            ),
                        ),
                )
                .with_priority(1),
            );
        }
        if let Some(overlay) = self.overlays(cx) {
            root = root.child(overlay);
        }
        root
    }
}
