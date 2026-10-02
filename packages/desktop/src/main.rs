mod sdk;

use gpui::{
    App, Application, Bounds, Context, Entity, FocusHandle, KeyBinding, SharedString, Subscription,
    UniformListScrollHandle, Window, WindowBounds, WindowOptions, actions, div, prelude::*, px,
    rgb, size, uniform_list,
};
use gpui_component::{
    Disableable, Root, Theme, ThemeMode,
    button::Button,
    input::{Input, InputEvent, InputState},
};
use sdk::{Account, Sdk, Snapshot};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

fn expiration(value: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|time| {
            time.with_timezone(&chrono::Local)
                .format("%H:%M")
                .to_string()
        })
        .unwrap_or_else(|_| value.into())
}

actions!(
    sesh,
    [
        Quit,
        Next,
        Previous,
        Select,
        Back,
        Search,
        Refresh,
        Roles,
        Console,
        Credentials,
        NewSession,
        EditSession,
        Palette
    ]
);

#[derive(Clone, Copy, PartialEq)]
enum Screen {
    Sessions,
    Accounts,
    Roles,
    Credentials,
}

#[derive(Clone)]
enum Command {
    Select,
    Back,
    Refresh,
    Roles,
    PreferRole,
    Console,
    Credentials,
    NewSession,
    EditSession,
    DeleteSession,
    SignOut,
    Region,
    Profile,
    RemoveCredential,
    Palette,
    ToggleTheme,
    Confirm,
    Cancel,
    Login,
    OpenLogin,
}

struct Form {
    title: String,
    fields: Vec<(String, Entity<InputState>)>,
    operation: &'static str,
    args: Value,
    _subscriptions: Vec<Subscription>,
}

struct Login {
    name: String,
    url: String,
    code: String,
}

struct Sesh {
    window: gpui::AnyWindowHandle,
    sdk: Arc<Mutex<Option<Sdk>>>,
    data: Snapshot,
    screen: Screen,
    selected: usize,
    account: Option<Account>,
    search: Entity<InputState>,
    focus: FocusHandle,
    scroll: UniformListScrollHandle,
    busy: bool,
    message: String,
    error: bool,
    form: Option<Form>,
    login: Option<Login>,
    palette: bool,
    dark: bool,
    _subscriptions: Vec<Subscription>,
}

impl Sesh {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| {
            InputState::new(window, cx).placeholder("Search sessions, accounts or roles…")
        });
        let subscription = cx.subscribe_in(
            &search,
            window,
            |this, _, event: &InputEvent, window, cx| {
                if matches!(event, InputEvent::Change) {
                    this.selected = 0;
                    this.scroll.scroll_to_item(0, gpui::ScrollStrategy::Top);
                    cx.notify();
                }
                if matches!(event, InputEvent::PressEnter { .. }) {
                    this.dispatch(Command::Select, window, cx);
                }
            },
        );
        let mut view = Self {
            window: window.window_handle(),
            sdk: Arc::new(Mutex::new(None)),
            data: Snapshot::default(),
            screen: Screen::Sessions,
            selected: 0,
            account: None,
            search,
            focus: cx.focus_handle(),
            scroll: UniformListScrollHandle::new(),
            busy: false,
            message: String::new(),
            error: false,
            form: None,
            login: None,
            palette: false,
            dark: false,
            _subscriptions: vec![subscription],
        };
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(std::time::Duration::from_secs(30)).await;
                if this.update(cx, |this, cx| {
                    if !this.busy && this.form.is_none() && this.login.is_none() && !this.palette {
                        this.request("snapshot", json!({"name": if this.screen == Screen::Sessions { None } else { this.data.session.clone() }}), cx);
                    }
                }).is_err() { break; }
            }
        }).detach();
        view.focus.focus(window);
        view.request("snapshot", json!({}), cx);
        view
    }

    fn request(&mut self, operation: &'static str, args: Value, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        self.error = false;
        self.message = match operation {
            "pollLogin" => "Waiting for browser authorization…",
            "assumeRole" => "Setting credentials…",
            "selectSession" => "Loading accounts…",
            "loadRoles" => "Loading roles…",
            _ => "Working…",
        }
        .into();
        let sdk = self.sdk.clone();
        let task = cx.background_executor().spawn(async move {
            let mut guard = sdk
                .lock()
                .map_err(|_| anyhow::anyhow!("SDK connection unavailable"))?;
            if guard.is_none() {
                *guard = Some(Sdk::start()?);
            }
            guard
                .as_mut()
                .ok_or_else(|| anyhow::anyhow!("SDK helper unavailable"))?
                .request(operation, args)
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            let _ = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(value) => this.receive(operation, value, cx),
                    Err(error) => {
                        this.error = true;
                        this.message = error.to_string();
                        if operation == "pollLogin" {
                            this.login = None;
                        }
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn receive(&mut self, operation: &'static str, value: Value, cx: &mut Context<Self>) {
        self.message.clear();
        if value.get("sessions").is_some() {
            match serde_json::from_value::<Snapshot>(value) {
                Ok(data) => {
                    self.data = data;
                    if let Some(account) = &self.account {
                        self.account = self
                            .data
                            .accounts
                            .iter()
                            .find(|value| value.account_id == account.account_id)
                            .cloned();
                    }
                    if operation == "selectSession" {
                        self.screen = Screen::Accounts;
                        self.selected =
                            self.visible(cx)
                                .iter()
                                .position(|index| {
                                    self.data.last_account.as_ref().is_some_and(|id| {
                                        self.data.accounts[*index].account_id == *id
                                    })
                                })
                                .unwrap_or(0);
                    }
                    if operation == "saveSession" || operation == "removeSession" {
                        self.screen = Screen::Sessions;
                        self.form = None;
                        self.selected = 0;
                    }
                    if operation == "loadRoles" {
                        self.screen = Screen::Roles;
                        self.selected = 0;
                    }
                    if operation == "assumeRole" {
                        self.message = "Credentials set in ~/.aws/credentials".into();
                    }
                    if matches!(
                        operation,
                        "setRegion" | "setProfile" | "clearCredential" | "signOut"
                    ) {
                        self.form = None;
                    }
                    if operation == "preferRole" {
                        self.screen = Screen::Accounts;
                        self.selected = 0;
                    }
                    if matches!(
                        operation,
                        "saveSession"
                            | "removeSession"
                            | "setRegion"
                            | "setProfile"
                            | "clearCredential"
                            | "signOut"
                    ) {
                        let focus = self.focus.clone();
                        let _ =
                            cx.update_window(self.window, move |_, window, _| focus.focus(window));
                    }
                    self.selected = self.selected.min(self.visible(cx).len().saturating_sub(1));
                }
                Err(error) => {
                    self.error = true;
                    self.message = format!("Invalid SDK state: {error}");
                }
            }
        } else if operation == "consoleUrl" {
            if let Some(url) = value.as_str() {
                cx.open_url(url);
            }
        } else if operation == "startLogin" {
            if let (Some(url), Some(code), Some(name)) = (
                value["url"].as_str(),
                value["code"].as_str(),
                self.data.session.clone(),
            ) {
                cx.open_url(url);
                self.login = Some(Login {
                    name,
                    url: url.into(),
                    code: code.into(),
                });
                self.poll(cx);
            }
        } else if operation == "pollLogin" {
            if let Some(login) = &self.login {
                if value["complete"].as_bool() == Some(true) {
                    let name = login.name.clone();
                    self.login = None;
                    self.request("selectSession", json!({"name": name, "refresh": true}), cx);
                } else {
                    self.poll(cx);
                }
            } else {
                self.request("cancelLogin", json!({"name": self.data.session}), cx);
            }
        }
    }

    fn poll(&mut self, cx: &mut Context<Self>) {
        if let Some(login) = &self.login {
            self.request("pollLogin", json!({"name": login.name}), cx);
        }
    }

    fn visible(&self, cx: &App) -> Vec<usize> {
        let query = self.search.read(cx).value().to_lowercase();
        let matches = |text: String| {
            query
                .split_whitespace()
                .all(|part| text.to_lowercase().contains(part))
        };
        match self.screen {
            Screen::Sessions => self
                .data
                .sessions
                .iter()
                .enumerate()
                .filter(|(_, value)| {
                    matches(format!(
                        "{} {} {}",
                        value.name, value.start_url, value.sso_region
                    ))
                })
                .map(|(index, _)| index)
                .collect(),
            Screen::Accounts => self
                .data
                .accounts
                .iter()
                .enumerate()
                .filter(|(_, value)| {
                    matches(format!(
                        "{} {} {} {}",
                        value.name,
                        value.account_id,
                        value.roles.join(" "),
                        value.region.clone().unwrap_or_default()
                    ))
                })
                .map(|(index, _)| index)
                .collect(),
            Screen::Roles => self
                .account
                .iter()
                .flat_map(|value| value.roles.iter().enumerate())
                .filter(|(_, role)| matches(role.to_string()))
                .map(|(index, _)| index)
                .collect(),
            Screen::Credentials => self
                .data
                .credentials
                .iter()
                .enumerate()
                .filter(|(_, value)| {
                    matches(format!(
                        "{} {} {} {}",
                        value.account_name, value.role_name, value.profile_name, value.session_name
                    ))
                })
                .map(|(index, _)| index)
                .collect(),
        }
    }

    fn selected_account(&self, cx: &App) -> Option<Account> {
        if self.screen == Screen::Roles {
            return self.account.clone();
        }
        if self.screen != Screen::Accounts {
            return None;
        }
        self.visible(cx)
            .get(self.selected)
            .and_then(|index| self.data.accounts.get(*index))
            .cloned()
    }

    fn selected_role(&self, cx: &App) -> Option<String> {
        let account = self.selected_account(cx)?;
        if self.screen == Screen::Roles {
            return self
                .visible(cx)
                .get(self.selected)
                .and_then(|index| account.roles.get(*index))
                .cloned();
        }
        account.preferred_role
    }

    fn move_selection(&mut self, direction: i32, window: &mut Window, cx: &mut Context<Self>) {
        if self.form.is_some() || self.login.is_some() || self.palette {
            return;
        }
        let count = self.visible(cx).len();
        if count == 0 {
            return;
        }
        self.selected = if direction > 0 {
            (self.selected + 1).min(count - 1)
        } else {
            self.selected.saturating_sub(1)
        };
        self.scroll
            .scroll_to_item(self.selected, gpui::ScrollStrategy::Center);
        self.focus.focus(window);
        cx.notify();
    }

    fn reset_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.search
            .update(cx, |state, cx| state.set_value("", window, cx));
        self.selected = 0;
        self.scroll.scroll_to_item(0, gpui::ScrollStrategy::Top);
        self.focus.focus(window);
    }

    fn show_form(
        &mut self,
        title: &str,
        fields: Vec<(&str, String)>,
        operation: &'static str,
        args: Value,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let fields: Vec<_> = fields
            .into_iter()
            .map(|(label, value)| {
                (
                    label.into(),
                    cx.new(|cx| InputState::new(window, cx).default_value(value)),
                )
            })
            .collect();
        let subscriptions = fields
            .iter()
            .map(|(_, input)| {
                cx.subscribe_in(input, window, |this, _, event: &InputEvent, window, cx| {
                    if matches!(event, InputEvent::PressEnter { .. }) {
                        this.dispatch(Command::Confirm, window, cx);
                    }
                })
            })
            .collect();
        if let Some((_, input)) = fields.first() {
            input.update(cx, |input, cx| input.focus(window, cx));
        }
        self.form = Some(Form {
            title: title.into(),
            fields,
            operation,
            args,
            _subscriptions: subscriptions,
        });
        cx.notify();
    }

    fn dispatch(&mut self, command: Command, window: &mut Window, cx: &mut Context<Self>) {
        if matches!(command, Command::Cancel | Command::Back) {
            if self.busy && self.login.is_none() {
                return;
            }
            if let Some(login) = self.login.take() {
                self.message.clear();
                if !self.busy {
                    self.request("cancelLogin", json!({"name": login.name}), cx);
                }
            } else if self.form.take().is_some() || self.palette {
                self.palette = false;
            } else if self.screen != Screen::Sessions {
                self.screen = if self.screen == Screen::Roles {
                    Screen::Accounts
                } else {
                    Screen::Sessions
                };
                self.reset_search(window, cx);
                if self.screen == Screen::Sessions {
                    self.request("snapshot", json!({}), cx);
                }
            }
            self.focus.focus(window);
            cx.notify();
            return;
        }
        if matches!(command, Command::OpenLogin) {
            if let Some(login) = &self.login {
                cx.open_url(&login.url);
            }
            return;
        }
        if self.busy {
            return;
        }
        self.palette = false;
        if self.form.is_some() && !matches!(command, Command::Confirm) {
            return;
        }
        let visible = self.visible(cx);
        let index = visible.get(self.selected).copied();
        let name = if self.screen == Screen::Sessions {
            index
                .and_then(|index| self.data.sessions.get(index))
                .map(|value| value.name.clone())
        } else {
            self.data.session.clone()
        };
        let account = self.selected_account(cx);
        let role = self.selected_role(cx);
        let args = json!({"name": name, "accountId": account.as_ref().map(|value| &value.account_id), "role": role});
        match command {
            Command::Select => match self.screen {
                Screen::Sessions => {
                    if let Some(name) = name {
                        let authenticated = index
                            .and_then(|index| self.data.sessions.get(index))
                            .is_some_and(|value| value.authenticated);
                        self.reset_search(window, cx);
                        if authenticated {
                            self.request("selectSession", json!({"name": name}), cx);
                        } else {
                            self.data.session = Some(name.clone());
                            self.screen = Screen::Accounts;
                            self.data.accounts.clear();
                            self.request("startLogin", json!({"name": name}), cx);
                        }
                    }
                }
                Screen::Accounts => {
                    if let Some(account) = account {
                        if !account.roles_loaded || role.is_none() {
                            self.account = Some(account);
                            self.reset_search(window, cx);
                            self.request("loadRoles", args, cx);
                        } else {
                            self.request("assumeRole", args, cx);
                        }
                    }
                }
                Screen::Roles => {
                    if role.is_some() {
                        self.request("assumeRole", args, cx);
                    }
                }
                Screen::Credentials => {}
            },
            Command::Refresh => {
                self.request(if self.screen == Screen::Sessions || self.screen == Screen::Credentials { "snapshot" } else { "selectSession" }, json!({"name": if self.screen == Screen::Sessions { None } else { name }, "refresh": true}), cx);
            }
            Command::Roles => {
                if self.screen == Screen::Accounts && account.is_some() {
                    self.account = account;
                    self.reset_search(window, cx);
                    self.request("loadRoles", args, cx);
                }
            }
            Command::PreferRole => {
                if role.is_some() {
                    self.request("preferRole", args, cx);
                }
            }
            Command::Console => {
                if name.is_some() {
                    self.request(
                        "consoleUrl",
                        if self.screen == Screen::Sessions {
                            json!({"name": name})
                        } else {
                            args
                        },
                        cx,
                    );
                }
            }
            Command::Credentials => {
                self.screen = Screen::Credentials;
                self.reset_search(window, cx);
                self.request("snapshot", json!({"name": self.data.session}), cx);
            }
            Command::Login => {
                if name.is_some() {
                    self.data.session = name.clone();
                    self.screen = Screen::Accounts;
                    self.request("startLogin", json!({"name": name}), cx);
                }
            }
            Command::NewSession | Command::EditSession => {
                let editing = matches!(command, Command::EditSession);
                if editing && self.screen != Screen::Sessions {
                    return;
                }
                let session = if editing {
                    index
                        .and_then(|index| self.data.sessions.get(index))
                        .cloned()
                } else {
                    None
                };
                if editing && session.is_none() {
                    return;
                }
                let session = session.unwrap_or_default();
                self.show_form(if editing { "Edit SSO session" } else { "New SSO session" }, vec![
                    ("name", session.name.clone()), ("startUrl", session.start_url),
                    ("ssoRegion", if session.sso_region.is_empty() { "eu-north-1".into() } else { session.sso_region }),
                    ("defaultRegion", if session.default_region.is_empty() { "eu-north-1".into() } else { session.default_region }),
                ], "saveSession", json!({"creating": !editing, "originalName": if editing { Some(session.name) } else { None }}), window, cx);
            }
            Command::DeleteSession => {
                if self.screen == Screen::Sessions && name.is_some() {
                    self.show_form(
                        "Delete this SSO session? Existing credentials are not removed.",
                        vec![],
                        "removeSession",
                        json!({"name": name}),
                        window,
                        cx,
                    );
                }
            }
            Command::SignOut => {
                if name.is_some() {
                    self.show_form(
                        "Sign out and remove this session’s tracked credential profiles?",
                        vec![],
                        "signOut",
                        json!({"name": name}),
                        window,
                        cx,
                    );
                }
            }
            Command::Region => {
                if let Some(account) = account {
                    self.show_form(
                        "Account region",
                        vec![("region", account.region.unwrap_or_default())],
                        "setRegion",
                        args,
                        window,
                        cx,
                    );
                }
            }
            Command::Profile => {
                if let (Some(account), Some(role)) = (account, role) {
                    self.show_form(
                        "CLI profile (empty uses default)",
                        vec![(
                            "profile",
                            account.profiles.get(&role).cloned().unwrap_or_default(),
                        )],
                        "setProfile",
                        args,
                        window,
                        cx,
                    );
                }
            }
            Command::RemoveCredential => {
                if self.screen == Screen::Credentials {
                    if let Some(credential) =
                        index.and_then(|index| self.data.credentials.get(index))
                    {
                        self.show_form("Remove this credential and its AWS profile?", vec![], "clearCredential", json!({"name": self.data.session, "accountId": credential.account_id, "role": credential.role_name, "profile": credential.profile_name}), window, cx);
                    }
                }
            }
            Command::Confirm => {
                if let Some(form) = &self.form {
                    let mut args = form.args.clone();
                    for (key, input) in &form.fields {
                        args[key] = json!(input.read(cx).value().trim());
                    }
                    if let Some(original) = args["originalName"].as_str() {
                        if args["name"].as_str() != Some(original) {
                            self.error = true;
                            self.message = "Session names cannot be changed when editing".into();
                            cx.notify();
                            return;
                        }
                    }
                    self.request(form.operation, args, cx);
                }
            }
            Command::Palette => {
                self.palette = true;
                self.focus.focus(window);
            }
            Command::ToggleTheme => {
                self.dark = !self.dark;
                Theme::change(
                    if self.dark {
                        ThemeMode::Dark
                    } else {
                        ThemeMode::Light
                    },
                    Some(window),
                    cx,
                );
            }
            Command::Cancel | Command::Back | Command::OpenLogin => {}
        }
        cx.notify();
    }

    fn button(
        &self,
        id: &'static str,
        label: &str,
        command: Command,
        cx: &Context<Self>,
    ) -> Button {
        Button::new(id)
            .label(SharedString::from(label.to_owned()))
            .disabled(self.busy && !matches!(command, Command::Cancel | Command::OpenLogin))
            .tab_stop(
                (self.form.is_none() && self.login.is_none() && !self.palette)
                    || matches!(
                        command,
                        Command::Confirm | Command::Cancel | Command::OpenLogin
                    ),
            )
            .on_click(
                cx.listener(move |this, _, window, cx| this.dispatch(command.clone(), window, cx)),
            )
    }

    fn row(&self, position: usize, index: usize, cx: &Context<Self>) -> impl IntoElement {
        let (title, subtitle, status) = match self.screen {
            Screen::Sessions => {
                let value = &self.data.sessions[index];
                (
                    value.name.clone(),
                    format!("{} · {}", value.start_url, value.sso_region),
                    if value.authenticated {
                        "● Signed in"
                    } else {
                        "○ Sign in"
                    }
                    .into(),
                )
            }
            Screen::Accounts => {
                let value = &self.data.accounts[index];
                let active = self
                    .data
                    .credentials
                    .iter()
                    .find(|credential| credential.account_id == value.account_id);
                let profile = value
                    .preferred_role
                    .as_ref()
                    .and_then(|role| value.profiles.get(role))
                    .map(|profile| format!(" · {profile}"))
                    .unwrap_or_default();
                (
                    value.name.clone(),
                    format!(
                        "{} · {} · {}{}",
                        value.account_id,
                        value.preferred_role.as_deref().unwrap_or("Select a role"),
                        value.region.as_deref().unwrap_or(""),
                        profile
                    ),
                    active
                        .map(|value| {
                            format!(
                                "● {} · Expires {}",
                                if value.is_default {
                                    "Default"
                                } else {
                                    "Active"
                                },
                                expiration(&value.expiration)
                            )
                        })
                        .unwrap_or_else(|| "○".into()),
                )
            }
            Screen::Roles => {
                let role = self
                    .account
                    .as_ref()
                    .and_then(|value| value.roles.get(index))
                    .cloned()
                    .unwrap_or_default();
                (
                    role,
                    "Enter to set credentials · Use as preferred role below".into(),
                    String::new(),
                )
            }
            Screen::Credentials => {
                let value = &self.data.credentials[index];
                (
                    value.account_name.clone(),
                    format!(
                        "{} · {} · {}",
                        value.role_name, value.profile_name, value.session_name
                    ),
                    format!("Expires {}", expiration(&value.expiration)),
                )
            }
        };
        let selected = self.selected == position;
        div()
            .id(("row", position))
            .w_full()
            .flex()
            .items_center()
            .justify_between()
            .h(px(76.))
            .px_5()
            .border_b_1()
            .border_color(rgb(if self.dark { 0x303338 } else { 0xd6d5cc }))
            .bg(rgb(if selected {
                if self.dark { 0x285953 } else { 0x3e817b }
            } else if self.dark {
                0x191c20
            } else {
                0xfffdf2
            }))
            .text_color(rgb(if selected || self.dark {
                0xf6f5ed
            } else {
                0x181a18
            }))
            .cursor_pointer()
            .on_click(
                cx.listener(move |this, event: &gpui::ClickEvent, window, cx| {
                    this.selected = position;
                    this.focus.focus(window);
                    if event.click_count() >= 2 {
                        this.dispatch(Command::Select, window, cx);
                    }
                    cx.notify();
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
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .child(title),
                    )
                    .child(div().truncate().text_sm().child(subtitle)),
            )
            .child(div().flex_shrink_0().ml_4().text_sm().child(status))
    }
}

impl Render for Sesh {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let visible = self.visible(cx);
        let count = visible.len();
        let title = match self.screen {
            Screen::Sessions => "SSO Sessions".into(),
            Screen::Accounts => {
                format!("Accounts — {}", self.data.session.as_deref().unwrap_or(""))
            }
            Screen::Roles => format!(
                "Roles — {}",
                self.account
                    .as_ref()
                    .map(|value| value.name.as_str())
                    .unwrap_or("")
            ),
            Screen::Credentials => "Active Credentials".into(),
        };
        let background = if self.dark { 0x191c20 } else { 0xfffdf2 };
        let border = if self.dark { 0x303338 } else { 0xd6d5cc };
        let muted = if self.dark { 0xa4aaa5 } else { 0x63665e };
        let active = self
            .data
            .credentials
            .iter()
            .find(|value| value.is_default)
            .or(self.data.credentials.first());
        let footer = active
            .map(|value| {
                format!(
                    "SSO  {}     Account  {}     Profile  {}     Expires {}",
                    value.session_name,
                    value.account_name,
                    value.profile_name,
                    expiration(&value.expiration)
                )
            })
            .unwrap_or_else(|| "No active credentials".into());
        let controls = match self.screen {
            Screen::Sessions => vec![
                ("select", "↵ Select", Command::Select),
                ("new", "⌘N New", Command::NewSession),
                ("edit", "⌘E Edit", Command::EditSession),
            ],
            Screen::Accounts => vec![
                ("select", "↵ Select", Command::Select),
                ("roles", "Roles", Command::Roles),
                ("profile", "Profile", Command::Profile),
                ("back", "Esc Back", Command::Back),
            ],
            Screen::Roles => vec![
                ("select", "↵ Set credentials", Command::Select),
                ("prefer-role", "Prefer role", Command::PreferRole),
                ("profile", "Profile", Command::Profile),
                ("back", "Esc Back", Command::Back),
            ],
            Screen::Credentials => vec![
                ("remove", "Remove credential", Command::RemoveCredential),
                ("back", "Esc Back", Command::Back),
            ],
        };
        let mut content = div()
            .relative()
            .size_full()
            .flex()
            .flex_col()
            .bg(rgb(background))
            .text_color(rgb(if self.dark { 0xf6f5ed } else { 0x181a18 }))
            .font_family("Menlo")
            .text_size(px(14.))
            .key_context("Sesh")
            .track_focus(&self.focus)
            .on_action(cx.listener(|this, _: &Next, window, cx| this.move_selection(1, window, cx)))
            .on_action(
                cx.listener(|this, _: &Previous, window, cx| this.move_selection(-1, window, cx)),
            )
            .on_action(cx.listener(|this, _: &Select, window, cx| {
                this.dispatch(
                    if this.form.is_some() {
                        Command::Confirm
                    } else {
                        Command::Select
                    },
                    window,
                    cx,
                )
            }))
            .on_action(
                cx.listener(|this, _: &Back, window, cx| this.dispatch(Command::Back, window, cx)),
            )
            .on_action(cx.listener(|this, _: &Search, window, cx| {
                if this.form.is_some() || this.login.is_some() || this.palette {
                    return;
                }
                this.search.update(cx, |input, cx| input.focus(window, cx))
            }))
            .on_action(cx.listener(|this, _: &Refresh, window, cx| {
                this.dispatch(Command::Refresh, window, cx)
            }))
            .on_action(
                cx.listener(|this, _: &Roles, window, cx| {
                    this.dispatch(Command::Roles, window, cx)
                }),
            )
            .on_action(cx.listener(|this, _: &Console, window, cx| {
                this.dispatch(Command::Console, window, cx)
            }))
            .on_action(cx.listener(|this, _: &Credentials, window, cx| {
                this.dispatch(Command::Credentials, window, cx)
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
                    .flex()
                    .items_center()
                    .justify_between()
                    .px_5()
                    .py_4()
                    .border_b_1()
                    .border_color(rgb(border))
                    .child(
                        div()
                            .flex()
                            .gap_4()
                            .items_center()
                            .child(div().font_weight(gpui::FontWeight::BOLD).child(title))
                            .child(div().text_color(rgb(muted)).child(format!("{count} items"))),
                    )
                    .child(
                        div()
                            .flex()
                            .gap_2()
                            .child(self.button(
                                "credentials",
                                "Credentials",
                                Command::Credentials,
                                cx,
                            ))
                            .child(self.button("more", "⌘P More", Command::Palette, cx)),
                    ),
            )
            .child(
                div()
                    .px_4()
                    .py_3()
                    .border_b_1()
                    .border_color(rgb(border))
                    .child(
                        Input::new(&self.search)
                            .disabled(self.form.is_some() || self.login.is_some() || self.palette),
                    ),
            )
            .child(if count == 0 {
                div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap_4()
                    .text_color(rgb(muted))
                    .child(if self.busy {
                        "Loading…"
                    } else if self.screen == Screen::Sessions {
                        "No SSO sessions. Add one to get started."
                    } else {
                        "No matching items. Try another search or refresh."
                    })
                    .child(self.button(
                        "empty-action",
                        if self.screen == Screen::Sessions {
                            "New SSO session"
                        } else {
                            "Sign in"
                        },
                        if self.screen == Screen::Sessions {
                            Command::NewSession
                        } else {
                            Command::Login
                        },
                        cx,
                    ))
                    .into_any_element()
            } else {
                uniform_list(
                    "items",
                    count,
                    cx.processor(move |this, range: std::ops::Range<usize>, _, cx| {
                        range
                            .map(|position| {
                                this.row(position, visible[position], cx).into_any_element()
                            })
                            .collect::<Vec<_>>()
                    }),
                )
                .w_full()
                .flex_1()
                .track_scroll(self.scroll.clone())
                .into_any_element()
            })
            .child(
                div()
                    .min_h(px(32.))
                    .px_5()
                    .py_2()
                    .text_sm()
                    .text_color(rgb(if self.error { 0xc34b42 } else { muted }))
                    .child(self.message.clone()),
            )
            .child(
                div()
                    .px_5()
                    .py_3()
                    .border_t_1()
                    .border_b_1()
                    .border_color(rgb(border))
                    .child(footer),
            )
            .child(
                div()
                    .flex()
                    .justify_between()
                    .items_center()
                    .px_4()
                    .py_3()
                    .child(
                        div().flex().gap_2().children(
                            controls
                                .into_iter()
                                .map(|(id, label, command)| self.button(id, label, command, cx)),
                        ),
                    )
                    .child(self.button("refresh", "⌘R Refresh", Command::Refresh, cx)),
            );

        if let Some(form) = &self.form {
            let mut panel = div()
                .w(px(540.))
                .p_6()
                .flex()
                .flex_col()
                .gap_4()
                .bg(rgb(background))
                .border_1()
                .border_color(rgb(border))
                .rounded_lg()
                .shadow_lg()
                .child(
                    div()
                        .font_weight(gpui::FontWeight::BOLD)
                        .child(form.title.clone()),
                );
            for (label, input) in &form.fields {
                let title = match label.as_str() {
                    "name" => "Session name",
                    "startUrl" => "SSO start URL",
                    "ssoRegion" => "SSO region",
                    "defaultRegion" => "Default region",
                    "region" => "AWS region",
                    "profile" => "CLI profile name",
                    _ => label,
                };
                panel = panel.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(SharedString::from(title.to_owned()))
                        .child(Input::new(input)),
                );
            }
            if self.error {
                panel = panel.child(div().text_color(rgb(0xc34b42)).child(self.message.clone()));
            }
            panel = panel.child(
                div()
                    .flex()
                    .justify_end()
                    .gap_2()
                    .child(self.button("cancel-form", "Cancel", Command::Cancel, cx))
                    .child(self.button(
                        "confirm-form",
                        if self.busy { "Working…" } else { "Confirm" },
                        Command::Confirm,
                        cx,
                    )),
            );
            content = content.child(
                div()
                    .absolute()
                    .inset_0()
                    .bg(gpui::rgba(0x00000055))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(panel),
            );
        }
        if let Some(login) = &self.login {
            content = content.child(div().absolute().inset_0().bg(gpui::rgba(0x00000055)).flex().items_center().justify_center().child(
                div().w(px(540.)).p_6().flex().flex_col().gap_4().bg(rgb(background)).rounded_lg().shadow_lg()
                    .child("Authorize in your browser")
                    .child(div().text_xl().font_weight(gpui::FontWeight::BOLD).child(login.code.clone()))
                    .child("Check that this code matches the browser. Waiting for authorization…")
                    .child(div().flex().gap_2().child(self.button("open-login", "Open browser again", Command::OpenLogin, cx)).child(self.button("cancel-login", "Cancel", Command::Cancel, cx)))));
        }
        if self.palette {
            let commands = [
                ("New SSO session", Command::NewSession),
                ("Edit session", Command::EditSession),
                ("Delete session", Command::DeleteSession),
                ("Sign in", Command::Login),
                ("Open AWS Console", Command::Console),
                ("Account region", Command::Region),
                ("CLI profile", Command::Profile),
                ("Active credentials", Command::Credentials),
                ("Remove selected credential", Command::RemoveCredential),
                ("Sign out session", Command::SignOut),
                ("Switch light / dark theme", Command::ToggleTheme),
            ];
            let panel = div()
                .w(px(440.))
                .p_5()
                .flex()
                .flex_col()
                .gap_2()
                .bg(rgb(background))
                .rounded_lg()
                .shadow_lg()
                .child("Commands")
                .children(
                    commands
                        .into_iter()
                        .enumerate()
                        .map(|(index, (label, command))| {
                            Button::new(("command", index))
                                .label(label)
                                .on_click(cx.listener(move |this, _, window, cx| {
                                    this.dispatch(command.clone(), window, cx)
                                }))
                        }),
                )
                .child(self.button("close-palette", "Esc Close", Command::Cancel, cx));
            content = content.child(
                div()
                    .absolute()
                    .inset_0()
                    .bg(gpui::rgba(0x00000055))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(panel),
            );
        }
        content
    }
}

fn main() {
    Application::new().run(|cx: &mut App| {
        gpui_component::init(cx);
        Theme::change(ThemeMode::Light, None, cx);
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.bind_keys([
            KeyBinding::new("cmd-q", Quit, None),
            KeyBinding::new("down", Next, Some("Sesh")),
            KeyBinding::new("up", Previous, Some("Sesh")),
            KeyBinding::new("j", Next, Some("Sesh && !Input")),
            KeyBinding::new("k", Previous, Some("Sesh && !Input")),
            KeyBinding::new("enter", Select, Some("Sesh")),
            KeyBinding::new("escape", Back, Some("Sesh")),
            KeyBinding::new("cmd-f", Search, Some("Sesh")),
            KeyBinding::new("/", Search, Some("Sesh && !Input")),
            KeyBinding::new("cmd-r", Refresh, Some("Sesh")),
            KeyBinding::new("cmd-p", Palette, Some("Sesh")),
            KeyBinding::new("cmd-n", NewSession, Some("Sesh")),
            KeyBinding::new("cmd-e", EditSession, Some("Sesh")),
            KeyBinding::new("cmd-b", Console, Some("Sesh")),
            KeyBinding::new("cmd-1", Credentials, Some("Sesh")),
            KeyBinding::new("r", Roles, Some("Sesh && !Input")),
        ]);
        let bounds = Bounds::centered(None, size(px(1100.), px(760.)), cx);
        let result = cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                window_min_size: Some(size(px(760.), px(560.))),
                titlebar: Some(gpui::TitlebarOptions {
                    title: Some("Sesh".into()),
                    ..Default::default()
                }),
                ..Default::default()
            },
            |window, cx| {
                let view = cx.new(|cx| Sesh::new(window, cx));
                cx.new(|cx| Root::new(view, window, cx))
            },
        );
        if let Err(error) = result {
            eprintln!("Cannot open Sesh: {error}");
            cx.quit();
            return;
        }
        cx.on_window_closed(|cx| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        cx.activate(true);
    });
}
