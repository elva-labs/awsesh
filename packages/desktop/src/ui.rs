use crate::{
    Accounts, Back, Command, Console, Credentials, EditSession, NewSession, Next, Palette,
    Preferences, Previous, Refresh, Screen, Search, Select, Sesh, SetCredentials, platform,
};
use gpui::{
    AnyElement, Context, ElementId, FontWeight, Hsla, Render, SharedString, Window, div,
    prelude::*, px, rgb, uniform_list,
};
use gpui_component::{
    ActiveTheme, Disableable, Icon, IconName, Selectable,
    button::{Button, ButtonVariants},
    input::Input,
    menu::{ContextMenuExt, DropdownMenu, PopupMenuItem},
    select::Select as RoleSelect,
};

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

impl Sesh {
    fn status(&self, label: impl Into<SharedString>, color: Hsla, active: bool) -> AnyElement {
        div()
            .flex()
            .items_center()
            .gap_2()
            .text_size(px(12.))
            .text_color(color)
            .child(
                Icon::new(if active {
                    IconName::CircleCheck
                } else {
                    IconName::CircleX
                })
                .size(px(15.))
                .flex_shrink_0(),
            )
            .child(label.into())
            .into_any_element()
    }
    fn colors(&self, cx: &Context<Self>) -> Colors {
        if cx.theme().is_dark() {
            return Colors {
                background: rgb(0x1c1e22).into(),
                sidebar: rgb(0x24262b).into(),
                border: rgb(0x34373d).into(),
                text: rgb(0xe9ebef).into(),
                muted: rgb(0xa1a6b0).into(),
                selection: rgb(0x253e5d).into(),
                accent: rgb(0x83b9ff).into(),
                success: rgb(0x68c99e).into(),
                warning: rgb(0xe6b566).into(),
                profile: rgb(0xbda0ed).into(),
            };
        }
        Colors {
            background: rgb(0xffffff).into(),
            sidebar: rgb(0xf3f4f6).into(),
            border: rgb(0xe3e5e9).into(),
            text: rgb(0x20242c).into(),
            muted: rgb(0x6d7480).into(),
            selection: rgb(0xe8f0fc).into(),
            accent: rgb(0x245ea8).into(),
            success: rgb(0x23825c).into(),
            warning: rgb(0xa66a16).into(),
            profile: rgb(0x8252b3).into(),
        }
    }

    fn button(
        &self,
        id: impl Into<ElementId>,
        label: impl Into<SharedString>,
        command: Command,
        cx: &Context<Self>,
    ) -> Button {
        Button::new(id)
            .label(label)
            .h(px(36.))
            .px_3()
            .disabled(
                self.modal()
                    && !matches!(
                        command,
                        Command::Confirm | Command::Cancel | Command::OpenLogin
                    ),
            )
            .tab_stop(
                !self.modal()
                    || matches!(
                        command,
                        Command::Confirm | Command::Cancel | Command::OpenLogin
                    ),
            )
            .on_click(
                cx.listener(move |this, _, window, cx| this.dispatch(command.clone(), window, cx)),
            )
    }

    pub(super) fn preferences_dirty(&self, cx: &gpui::App) -> bool {
        let Some(account) = &self.account else {
            return false;
        };
        let role = self.role(cx);
        self.region.read(cx).value().trim() != account.region.as_deref().unwrap_or("")
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
        let sessions = self
            .data
            .sessions
            .iter()
            .enumerate()
            .map(|(index, session)| {
                let selected = self.screen == Screen::Accounts
                    && self.data.session.as_ref() == Some(&session.name);
                let name = session.name.clone();
                let session_name = session.name.clone();
                let authenticated = session.authenticated;
                let view = cx.entity().downgrade();
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
                                let signed_in =
                                    this.data.sessions.iter().any(|value| {
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
                    .context_menu(move |mut menu, _, _| {
                        for (label, command) in [
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
                        ] {
                            let view = view.clone();
                            let command = Command::SessionAction(name.clone(), Box::new(command));
                            menu =
                                menu.item(PopupMenuItem::new(label).disabled(disabled).on_click(
                                    move |_, window, cx| {
                                        let _ = view.update(cx, |this, cx| {
                                            this.dispatch(command.clone(), window, cx)
                                        });
                                    },
                                ));
                        }
                        menu
                    })
            });
        div()
            .w(px(216.))
            .flex_shrink_0()
            .h_full()
            .flex()
            .flex_col()
            .bg(colors.sidebar)
            .border_r_1()
            .border_color(colors.border)
            .child(
                div()
                    .px_5()
                    .pt_6()
                    .pb_5()
                    .flex()
                    .items_center()
                    .gap_3()
                    .child(
                        Icon::new(IconName::SquareTerminal)
                            .size(px(22.))
                            .text_color(colors.accent),
                    )
                    .child(
                        div()
                            .text_size(px(18.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Sesh"),
                    ),
            )
            .child(
                div()
                    .px_5()
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
                value.account_id.clone(),
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
        let view = cx.entity().downgrade();
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
                        colors.background
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
            .context_menu(move |mut menu, _, _| {
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
                for (label, command, unavailable) in commands {
                    let view = view.clone();
                    let command = Command::ItemAction(position, Box::new(command));
                    menu = menu.item(
                        PopupMenuItem::new(label)
                            .disabled(disabled || unavailable)
                            .on_click(move |_, window, cx| {
                                let _ = view.update(cx, |this, cx| {
                                    this.dispatch(command.clone(), window, cx)
                                });
                            }),
                    );
                }
                menu
            })
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
                        .h(px(38.))
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

    fn metadata(
        &self,
        label: &str,
        value: &str,
        technical: bool,
        cx: &Context<Self>,
    ) -> AnyElement {
        let colors = self.colors(cx);
        let value = div()
            .text_size(px(12.))
            .child(SharedString::from(value.to_owned()));
        div()
            .flex()
            .flex_col()
            .gap_1()
            .child(
                div()
                    .text_size(px(11.))
                    .text_color(colors.muted)
                    .child(SharedString::from(label.to_owned())),
            )
            .child(if technical {
                value.font_family(platform::mono_font())
            } else {
                value
            })
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
                            .child(self.status(
                                if value.is_default {
                                    "Default profile"
                                } else {
                                    "Named profile"
                                },
                                if value.is_default {
                                    colors.success
                                } else {
                                    colors.profile
                                },
                                true,
                            )),
                    )
                    .child(self.metadata("CLI profile", &value.profile_name, true, cx))
                    .child(self.metadata("Role", &value.role_name, false, cx))
                    .child(self.metadata("Organization", &value.session_name, false, cx))
                    .child(self.metadata(
                        "Region",
                        value.region.as_deref().unwrap_or("Not configured"),
                        true,
                        cx,
                    ))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_1()
                            .child(
                                div()
                                    .text_size(px(11.))
                                    .text_color(colors.muted)
                                    .child("Account ID"),
                            )
                            .child(
                                self.copy_value(
                                    "credential-id",
                                    &value.account_id,
                                    Command::CopyAccount,
                                    cx,
                                )
                                .font_family(platform::mono_font()),
                            ),
                    )
                    .child(
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
                                    .child(remaining(&value.expiration)),
                            )
                            .child(div().text_size(px(12.)).text_color(colors.muted).child(
                                format!("Expires at {} local time", expiration(&value.expiration)),
                            )),
                    )
                    .child(
                        self.button("copy-profile", "Copy profile", Command::CopyProfile, cx)
                            .icon(IconName::Copy),
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
        let region_dirty =
            self.region.read(cx).value().trim() != account.region.as_deref().unwrap_or("");
        let profile_dirty = self.profile.read(cx).value().trim()
            != role
                .as_ref()
                .and_then(|role| account.profiles.get(role))
                .map(String::as_str)
                .unwrap_or("");
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
                    .child(
                        RoleSelect::new(&self.roles)
                            .placeholder(if self.busy && !account.roles_loaded {
                                "Loading roles…"
                            } else {
                                "Select a role"
                            })
                            .h(px(38.))
                            .w_full()
                            .disabled(self.modal()),
                    )
                    .child(
                        self.button(
                            "prefer-role",
                            if role.is_some() && role == account.preferred_role {
                                "Preferred role"
                            } else {
                                "Make preferred"
                            },
                            Command::PreferRole,
                            cx,
                        )
                        .ghost()
                        .disabled(self.modal() || role.is_none() || role == account.preferred_role),
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
        panel =
            panel
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(div().font_weight(FontWeight::MEDIUM).child("Region"))
                        .child(
                            div()
                                .flex()
                                .gap_2()
                                .child(div().flex_1().min_w_0().child(
                                    Input::new(&self.region).h(px(38.)).disabled(self.modal()),
                                ))
                                .child(
                                    self.button("save-region", "Save", Command::SaveRegion, cx)
                                        .disabled(self.modal() || !region_dirty),
                                ),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(div().font_weight(FontWeight::MEDIUM).child("CLI profile"))
                        .child(
                            div()
                                .flex()
                                .gap_2()
                                .child(
                                    div().flex_1().min_w_0().child(
                                        Input::new(&self.profile)
                                            .h(px(38.))
                                            .disabled(self.modal() || role.is_none()),
                                    ),
                                )
                                .child(
                                    self.button("save-profile", "Save", Command::SaveProfile, cx)
                                        .disabled(self.modal() || !profile_dirty || role.is_none()),
                                ),
                        ),
                );
        if let Some(active) = active {
            panel = panel.child(
                div()
                    .p_3()
                    .rounded_md()
                    .bg(colors.sidebar)
                    .flex()
                    .flex_col()
                    .gap_2()
                    .child(self.status(
                        if active.is_default {
                            "Default profile"
                        } else {
                            "Named profile"
                        },
                        if active.is_default {
                            colors.success
                        } else {
                            colors.profile
                        },
                        true,
                    ))
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(colors.muted)
                            .child(remaining(&active.expiration)),
                    ),
            );
        }
        if self.preferences_dirty(cx) {
            panel = panel.child(
                div()
                    .text_size(px(11.))
                    .text_color(colors.muted)
                    .child("Save your changes before setting credentials."),
            );
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
        let shortcuts = [
            ("F", "Search the current list"),
            ("K", "Open command bar"),
            ("P", "Open command bar (alternative)"),
            ("N", "Add an SSO session"),
            ("E", "Edit the current session"),
            ("↵", "Set credentials explicitly"),
            ("B", "Open AWS Console"),
            ("1", "Accounts"),
            ("2", "Credentials"),
        ];
        div().id("settings-content").flex_1().min_h_0().overflow_y_scroll().p_8().flex().flex_col().gap_6()
            .child(div().max_w(px(650.)).flex().flex_col().gap_3()
                .child(div().text_size(px(16.)).font_weight(FontWeight::SEMIBOLD).child("Appearance"))
                .child(div().text_color(colors.muted).child("Follow your system, or choose a light or dark workspace."))
                .child(div().flex().gap_2().children(choices.into_iter().map(|(value, label)| self.button(value, label, Command::Appearance(value.into()), cx).selected(self.appearance == value)))))
            .child(div().max_w(px(650.)).flex().flex_col().gap_3().pt_5().border_t_1().border_color(colors.border)
                .child(div().text_size(px(16.)).font_weight(FontWeight::SEMIBOLD).child("Keyboard shortcuts"))
                .children(shortcuts.into_iter().map(|(key, label)| div().flex().items_center().justify_between().py_1().child(label).child(div().text_color(colors.muted).child(platform::shortcut_label(key)))))
                .child(div().text_size(px(12.)).text_color(colors.muted).child("Arrow keys inspect items. Enter inspects an account; it never writes credentials. Escape dismisses a dialog.")))
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
        if let Some(form) = &self.form {
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
                        .child(Input::new(input).h(px(38.)).disabled(submitting)),
                );
            }
            if self.error {
                panel = panel.child(div().text_color(rgb(0xc24840)).child(self.message.clone()));
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
                .child(Input::new(&self.command_search).prefix(Icon::new(IconName::Search)))
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
                                        .h(px(40.))
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
                    .h(px((count.min(8) * 40) as f32))
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
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let colors = self.colors(cx);
        let title = match self.screen {
            Screen::Accounts => self.data.session.as_deref().unwrap_or("Welcome to Sesh"),
            Screen::Credentials => "Credentials",
            Screen::Settings => "Settings",
        };
        let mut toolbar = div()
            .h(px(56.))
            .flex_shrink_0()
            .px_6()
            .flex()
            .items_center()
            .justify_between()
            .border_b_1()
            .border_color(colors.border)
            .child(
                div()
                    .min_w_0()
                    .flex()
                    .items_center()
                    .gap_4()
                    .child(
                        div()
                            .truncate()
                            .text_size(px(16.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(SharedString::from(title.to_owned())),
                    )
                    .when(
                        self.screen == Screen::Accounts && self.data.session.is_some(),
                        |header| {
                            header.child(self.status(
                                if self.authenticated() {
                                    "Signed in"
                                } else {
                                    "Signed out"
                                },
                                if self.authenticated() {
                                    colors.success
                                } else {
                                    colors.warning
                                },
                                self.authenticated(),
                            ))
                        },
                    ),
            );
        let mut actions = div().flex().gap_2();
        if self.screen == Screen::Accounts && self.data.session.is_some() {
            if !self.authenticated() {
                actions = actions.child(
                    self.button("auth-session", "Sign in", Command::Login, cx)
                        .primary(),
                );
            }
            let view = cx.entity().downgrade();
            let authenticated = self.authenticated();
            let disabled = self.modal();
            actions = actions.child(
                Button::new("session-options")
                    .icon(IconName::Ellipsis)
                    .ghost()
                    .h(px(36.))
                    .w(px(36.))
                    .tooltip("Session actions")
                    .disabled(disabled)
                    .dropdown_menu(move |mut menu, _, _| {
                        for (label, command) in [
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
                        ] {
                            let view = view.clone();
                            menu = menu.item(PopupMenuItem::new(label).on_click(
                                move |_, window, cx| {
                                    let _ = view.update(cx, |this, cx| {
                                        this.dispatch(command.clone(), window, cx)
                                    });
                                },
                            ));
                        }
                        menu
                    }),
            );
        }
        if self.screen != Screen::Settings {
            actions = actions.child(
                self.button("refresh", "", Command::Refresh, cx)
                    .icon(IconName::Redo)
                    .ghost()
                    .w(px(36.))
                    .tooltip("Refresh"),
            );
        }
        toolbar = toolbar.child(actions);
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
            .bg(colors.background)
            .text_color(colors.text)
            .font_family(cx.theme().font_family.clone())
            .text_size(px(14.))
            .key_context("Sesh")
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
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .child(self.sidebar(cx))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .child(toolbar)
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
                    .bg(colors.sidebar)
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
                                rgb(0xc24840).into()
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
        if let Some(overlay) = self.overlays(cx) {
            root = root.child(overlay);
        }
        root
    }
}
