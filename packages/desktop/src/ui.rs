use crate::{
    Accounts, Back, Command, Console, Credentials, EditSession, NewSession, Next, Palette,
    Preferences, Previous, Refresh, Screen, Search, Select, Sesh, SetCredentials, platform,
};
use gpui::{
    AnyElement, Context, ElementId, FontWeight, Hsla, Render, SharedString, Window, div,
    prelude::*, px, rgb, uniform_list,
};
use gpui_component::{
    ActiveTheme, Disableable, Icon, IconName, Selectable, Sizable,
    button::{Button, ButtonVariants},
    input::Input,
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
            .small()
            .disabled(self.busy && !matches!(command, Command::Cancel | Command::OpenLogin))
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

    pub(super) fn preferences_dirty(&self, cx: &Context<Self>) -> bool {
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
                div().flex().items_center().gap_1().child(
                    self.button(
                        ("session", index),
                        SharedString::from(session.name.clone()),
                        Command::Session(session.name.clone()),
                        cx,
                    )
                    .icon(IconName::Building2)
                    .ghost()
                    .selected(selected)
                    .w_full()
                    .justify_start(),
                )
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
            .child(
                div()
                    .px_5()
                    .pb_4()
                    .text_size(px(11.))
                    .text_color(colors.muted)
                    .child(format!("SDK-backed · {}", env!("CARGO_PKG_VERSION"))),
            )
            .into_any_element()
    }

    fn row(&self, position: usize, index: usize, cx: &Context<Self>) -> AnyElement {
        let colors = self.colors(cx);
        let (title, detail, status) = if self.screen == Screen::Accounts {
            let value = &self.data.accounts[index];
            let active = self.data.credentials.iter().find(|credential| {
                credential.account_id == value.account_id
                    && Some(&credential.session_name) == self.data.session.as_ref()
            });
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
            )
        };
        let selected = self.selected == Some(position);
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
                    .child(
                        div()
                            .flex_shrink_0()
                            .text_size(px(11.))
                            .text_color(colors.accent)
                            .child(status),
                    ),
            )
            .on_click(cx.listener(move |this, _, window, cx| {
                if this.busy || this.modal() {
                    return;
                }
                this.selected = Some(position);
                this.focus.focus(window);
                this.inspect(window, cx);
                cx.notify();
            }))
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
                        .small()
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
            let (heading, description) = if !self.search.read(cx).value().is_empty() {
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
            if self.screen == Screen::Accounts && self.search.read(cx).value().is_empty() {
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
            .w(px(320.))
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
                panel = panel.child(div().flex().flex_col().gap_2().child(div().text_size(px(20.)).font_weight(FontWeight::SEMIBOLD).child(value.account_name.clone())).child(div().text_color(colors.accent).text_size(px(12.)).child(if value.is_default { "Default credentials" } else { "Named profile" })))
                    .child(self.metadata("CLI profile", &value.profile_name, true, cx))
                    .child(self.metadata("Role", &value.role_name, false, cx))
                    .child(self.metadata("Organization", &value.session_name, false, cx))
                    .child(self.metadata("Region", value.region.as_deref().unwrap_or("Not configured"), true, cx))
                    .child(self.metadata("Account ID", &value.account_id, true, cx))
                    .child(div().p_3().rounded_md().bg(colors.sidebar).flex().flex_col().gap_2()
                        .child(div().font_weight(FontWeight::MEDIUM).child(remaining(&value.expiration)))
                        .child(div().text_size(px(12.)).text_color(colors.muted).child(format!("Expires at {} local time", expiration(&value.expiration)))))
                    .child(div().flex().gap_2().child(self.button("copy-profile", "Copy profile", Command::CopyProfile, cx).icon(IconName::Copy)).child(self.button("copy-credential-id", "Copy ID", Command::CopyAccount, cx)))
                    .child(div().text_size(px(12.)).text_color(colors.muted).child("Use this profile with AWS_PROFILE in your shell. Sesh never changes an existing shell’s environment."))
                    .child(self.button("remove-credential", "Remove profile…", Command::RemoveCredential, cx).danger().w_full());
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
                        .child("Select an account")
                        .child(
                            div()
                                .text_size(px(12.))
                                .text_center()
                                .child("Inspect roles and preferences before setting credentials."),
                        ),
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
                        div()
                            .text_size(px(20.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(account.name.clone()),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .gap_2()
                            .child(
                                div()
                                    .font_family(platform::mono_font())
                                    .text_size(px(11.))
                                    .text_color(colors.muted)
                                    .child(account.account_id.clone()),
                            )
                            .child(
                                self.button("copy-account", "Copy ID", Command::CopyAccount, cx)
                                    .ghost(),
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
                            .small()
                            .w_full()
                            .disabled(self.busy || self.modal()),
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
                        .disabled(self.busy || role.is_none() || role == account.preferred_role),
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
                        div()
                            .flex()
                            .gap_2()
                            .child(
                                div().flex_1().min_w_0().child(
                                    Input::new(&self.region)
                                        .small()
                                        .disabled(self.busy || self.modal()),
                                ),
                            )
                            .child(
                                self.button("save-region", "Save", Command::SaveRegion, cx)
                                    .disabled(self.busy || !region_dirty),
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
                                        .small()
                                        .disabled(self.busy || self.modal() || role.is_none()),
                                ),
                            )
                            .child(
                                self.button("save-profile", "Save", Command::SaveProfile, cx)
                                    .disabled(self.busy || !profile_dirty || role.is_none()),
                            ),
                    )
                    .child(
                        div()
                            .text_size(px(11.))
                            .text_color(colors.muted)
                            .child("Leave empty to use the default profile."),
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
                    .child(
                        div()
                            .font_weight(FontWeight::MEDIUM)
                            .child(if active.is_default {
                                "Default credentials active"
                            } else {
                                "Profile credentials active"
                            }),
                    )
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
                    .disabled(self.busy || !ready || self.preferences_dirty(cx)),
                )
                .child(
                    self.button("open-console", "Open AWS Console", Command::Console, cx)
                        .icon(IconName::ExternalLink)
                        .w_full()
                        .disabled(self.busy || role.is_none()),
                )
                .child(
                    div()
                        .text_size(px(11.))
                        .text_color(colors.muted)
                        .text_center()
                        .child(format!(
                            "{} to set credentials",
                            platform::shortcut_label("↵")
                        )),
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
            ("P", "Open commands"),
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
            .child(div().max_w(px(650.)).pt_5().border_t_1().border_color(colors.border).flex().flex_col().gap_2()
                .child(div().font_weight(FontWeight::MEDIUM).child("One SDK, every interface"))
                .child(div().text_size(px(12.)).text_color(colors.muted).child("Sesh shares organizations, account preferences and credential profiles with the awsesh CLI and TUI. AWS operations run exclusively through the SDK.")))
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
                        .child(Input::new(input).small().disabled(self.busy)),
                );
            }
            if self.error {
                panel = panel.child(div().text_color(rgb(0xc24840)).child(self.message.clone()));
            }
            let confirm = self.button(
                "confirm-form",
                if self.busy {
                    "Working…"
                } else if form.destructive {
                    "Remove"
                } else {
                    "Save session"
                },
                Command::Confirm,
                cx,
            );
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
                        .child("Authorize in your browser"),
                )
                .child(
                    div()
                        .text_color(colors.muted)
                        .child("Check that this code matches the code shown in your browser."),
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
                                .primary(),
                        ),
                );
        } else if self.palette {
            let mut commands = vec![
                ("Add SSO session…", Command::NewSession),
                ("Accounts", Command::Accounts),
                ("Active credentials", Command::Credentials),
                ("Settings", Command::Settings),
            ];
            if self.data.session.is_some() {
                commands.extend([
                    ("Edit this session…", Command::EditSession),
                    ("Sign in", Command::Login),
                    ("Open SSO portal", Command::Portal),
                    ("Sign out…", Command::SignOut),
                    ("Delete this session…", Command::DeleteSession),
                ]);
            }
            if self.account.is_some() {
                commands.extend([
                    ("Set credentials", Command::SetCredentials),
                    ("Open AWS Console", Command::Console),
                ]);
            }
            if self.credential(cx).is_some() {
                commands.push(("Remove credential profile…", Command::RemoveCredential));
            }
            panel = panel
                .child(
                    div()
                        .text_size(px(18.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child("Commands"),
                )
                .child(
                    div()
                        .id("command-list")
                        .max_h(px(390.))
                        .overflow_y_scroll()
                        .flex()
                        .flex_col()
                        .gap_1()
                        .children(commands.into_iter().enumerate().map(
                            |(index, (label, command))| {
                                Button::new(("command", index))
                                    .label(label)
                                    .small()
                                    .ghost()
                                    .w_full()
                                    .justify_start()
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.dispatch(command.clone(), window, cx)
                                    }))
                            },
                        )),
                )
                .child(self.button("close-commands", "Close", Command::Cancel, cx));
        } else {
            return None;
        }
        Some(
            div()
                .absolute()
                .inset_0()
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
        let subtitle = match self.screen {
            Screen::Accounts if self.data.session.is_some() => {
                if self.authenticated() {
                    "Signed in · AWS IAM Identity Center"
                } else {
                    "Signed out · cached accounts only"
                }
            }
            Screen::Accounts => "Your AWS session workspace",
            Screen::Credentials => "Manage your active AWS CLI profiles",
            Screen::Settings => "Appearance and keyboard shortcuts",
        };
        let mut toolbar = div()
            .h(px(82.))
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
                    .flex_col()
                    .gap_1()
                    .child(
                        div()
                            .truncate()
                            .text_size(px(21.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(SharedString::from(title.to_owned())),
                    )
                    .child(
                        div()
                            .text_size(px(12.))
                            .text_color(colors.muted)
                            .child(subtitle),
                    ),
            );
        let mut actions = div().flex().gap_2();
        if self.screen == Screen::Accounts && self.data.session.is_some() {
            actions = actions
                .child(
                    self.button("edit-session", "Edit session", Command::EditSession, cx)
                        .ghost(),
                )
                .child(self.button(
                    "auth-session",
                    if self.authenticated() {
                        "Sign out…"
                    } else {
                        "Sign in"
                    },
                    if self.authenticated() {
                        Command::SignOut
                    } else {
                        Command::Login
                    },
                    cx,
                ));
        }
        if self.screen != Screen::Settings {
            actions = actions.child(
                self.button("refresh", "Refresh", Command::Refresh, cx)
                    .ghost(),
            );
        }
        toolbar = toolbar.child(
            actions.child(
                self.button("commands", "Commands", Command::Palette, cx)
                    .icon(IconName::Ellipsis)
                    .ghost(),
            ),
        );
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
            .text_size(px(13.))
            .key_context("Sesh")
            .track_focus(&self.focus)
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
