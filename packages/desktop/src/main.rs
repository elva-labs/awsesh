mod platform;
mod sdk;
mod ui;

use gpui::{
    App, Application, Bounds, ClipboardItem, Context, Entity, FocusHandle, KeyBinding,
    Subscription, UniformListScrollHandle, Window, WindowBounds, WindowOptions, actions,
    prelude::*, px, size,
};
use gpui_component::{
    Root,
    input::{InputEvent, InputState},
    select::{SelectEvent, SelectState},
};
use sdk::{Account, Credential, Sdk, Snapshot};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

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
        Console,
        Accounts,
        Credentials,
        NewSession,
        EditSession,
        Palette,
        Preferences,
        SetCredentials
    ]
);

#[derive(Clone, Copy, PartialEq)]
enum Screen {
    Accounts,
    Credentials,
    Settings,
}

#[derive(Clone)]
enum Command {
    Session(String),
    Inspect,
    SetCredentials,
    Accounts,
    Credentials,
    Settings,
    Refresh,
    LoadRoles,
    PreferRole,
    Console,
    Portal,
    NewSession,
    EditSession,
    DeleteSession,
    SignOut,
    SaveRegion,
    SaveProfile,
    RemoveCredential,
    Palette,
    Appearance(String),
    Confirm,
    Cancel,
    Login,
    OpenLogin,
    CopyAccount,
    CopyProfile,
}

struct Form {
    title: String,
    description: String,
    fields: Vec<(String, Entity<InputState>)>,
    operation: &'static str,
    args: Value,
    destructive: bool,
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
    initialized: bool,
    screen: Screen,
    selected: Option<usize>,
    account: Option<Account>,
    search: Entity<InputState>,
    roles: Entity<SelectState<Vec<String>>>,
    region: Entity<InputState>,
    profile: Entity<InputState>,
    focus: FocusHandle,
    scroll: UniformListScrollHandle,
    busy: bool,
    message: String,
    error: bool,
    form: Option<Form>,
    login: Option<Login>,
    palette: bool,
    appearance: String,
    _subscriptions: Vec<Subscription>,
}

impl Sesh {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search =
            cx.new(|cx| InputState::new(window, cx).placeholder("Search accounts, IDs or roles"));
        let roles =
            cx.new(|cx| SelectState::new(Vec::<String>::new(), None, window, cx).searchable(true));
        let region = cx.new(|cx| InputState::new(window, cx).placeholder("eu-north-1"));
        let profile = cx.new(|cx| InputState::new(window, cx).placeholder("default"));
        let subscriptions = vec![
            cx.subscribe_in(
                &search,
                window,
                |this, _, event: &InputEvent, window, cx| {
                    if matches!(event, InputEvent::Change) {
                        this.selected = None;
                        this.account = None;
                        this.scroll.scroll_to_item(0, gpui::ScrollStrategy::Top);
                        cx.notify();
                    }
                    if matches!(event, InputEvent::PressEnter { .. }) {
                        this.selected = Some(0);
                        this.inspect(window, cx);
                    }
                },
            ),
            cx.subscribe_in(
                &roles,
                window,
                |this, _, event: &SelectEvent<Vec<String>>, window, cx| {
                    if let SelectEvent::Confirm(Some(role)) = event {
                        let value = this
                            .account
                            .as_ref()
                            .and_then(|account| account.profiles.get(role))
                            .cloned()
                            .unwrap_or_default();
                        this.profile
                            .update(cx, |input, cx| input.set_value(value, window, cx));
                        cx.notify();
                    }
                },
            ),
            cx.subscribe_in(
                &region,
                window,
                |this, _, event: &InputEvent, window, cx| {
                    if matches!(event, InputEvent::PressEnter { .. }) {
                        this.dispatch(Command::SaveRegion, window, cx);
                    }
                    if matches!(event, InputEvent::Change) {
                        cx.notify();
                    }
                },
            ),
            cx.subscribe_in(
                &profile,
                window,
                |this, _, event: &InputEvent, window, cx| {
                    if matches!(event, InputEvent::PressEnter { .. }) {
                        this.dispatch(Command::SaveProfile, window, cx);
                    }
                    if matches!(event, InputEvent::Change) {
                        cx.notify();
                    }
                },
            ),
            cx.observe_window_appearance(window, |this, window, cx| {
                if this.appearance == "system" {
                    platform::apply_appearance("system", Some(window), cx);
                }
                cx.notify();
            }),
        ];
        let mut view = Self {
            window: window.window_handle(),
            sdk: Arc::new(Mutex::new(None)),
            data: Snapshot::default(),
            initialized: false,
            screen: Screen::Accounts,
            selected: None,
            account: None,
            search,
            roles,
            region,
            profile,
            focus: cx.focus_handle(),
            scroll: UniformListScrollHandle::new(),
            busy: false,
            message: String::new(),
            error: false,
            form: None,
            login: None,
            palette: false,
            appearance: "system".into(),
            _subscriptions: subscriptions,
        };
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor()
                    .timer(std::time::Duration::from_secs(30))
                    .await;
                if this
                    .update(cx, |this, cx| {
                        if !this.busy && !this.modal() {
                            this.request("snapshot", json!({"name": this.data.session}), cx);
                        }
                        cx.notify();
                    })
                    .is_err()
                {
                    break;
                }
            }
        })
        .detach();
        view.focus.focus(window);
        view.request("snapshot", json!({}), cx);
        view
    }

    fn modal(&self) -> bool {
        self.form.is_some() || self.login.is_some() || self.palette
    }

    fn authenticated(&self) -> bool {
        self.data.sessions.iter().any(|session| {
            Some(&session.name) == self.data.session.as_ref() && session.authenticated
        })
    }

    fn request(&mut self, operation: &'static str, args: Value, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        if operation != "snapshot" {
            self.error = false;
            self.message = match operation {
                "pollLogin" => "Waiting for browser authorization…",
                "assumeRole" => "Setting credentials…",
                "selectSession" => "Loading accounts…",
                "loadRoles" => "Loading available roles…",
                _ => "Saving…",
            }
            .into();
        }
        let sdk = self.sdk.clone();
        let window = self.window;
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
            let _ = cx.update_window(window, |_, window, cx| {
                let _ = this.update(cx, |this, cx| {
                    this.busy = false;
                    match result {
                        Ok(value) => this.receive(operation, value, window, cx),
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
            });
        })
        .detach();
        cx.notify();
    }

    fn receive(
        &mut self,
        operation: &'static str,
        value: Value,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if operation != "snapshot" {
            self.message.clear();
        }
        if value.get("sessions").is_some() {
            let data = match serde_json::from_value::<Snapshot>(value) {
                Ok(data) => data,
                Err(error) => {
                    self.error = true;
                    self.message = format!("Invalid SDK state: {error}");
                    return;
                }
            };
            self.data = data;
            self.appearance = self
                .data
                .appearance
                .clone()
                .unwrap_or_else(|| "system".into());
            platform::apply_appearance(&self.appearance, Some(window), cx);
            if !self.initialized {
                self.initialized = true;
                let name = self
                    .data
                    .last_session
                    .as_ref()
                    .filter(|name| {
                        self.data
                            .sessions
                            .iter()
                            .any(|session| session.name == **name)
                    })
                    .cloned()
                    .or_else(|| {
                        self.data
                            .sessions
                            .first()
                            .map(|session| session.name.clone())
                    });
                if let Some(name) = name {
                    self.open_session(name, window, cx);
                }
                return;
            }
            if matches!(operation, "saveSession" | "removeSession") {
                let created = self
                    .form
                    .as_ref()
                    .and_then(|form| form.fields.iter().find(|(key, _)| key == "name"))
                    .map(|(_, input)| input.read(cx).value().trim().to_owned());
                self.form = None;
                self.focus.focus(window);
                let name = created
                    .filter(|name| {
                        self.data
                            .sessions
                            .iter()
                            .any(|session| session.name == *name)
                    })
                    .or_else(|| {
                        self.data
                            .sessions
                            .first()
                            .map(|session| session.name.clone())
                    });
                self.account = None;
                if let Some(name) = name {
                    self.open_session(name, window, cx);
                }
                return;
            }
            if operation == "selectSession" {
                self.selected = self
                    .data
                    .last_account
                    .as_ref()
                    .and_then(|id| {
                        self.visible(cx)
                            .iter()
                            .position(|index| self.data.accounts[*index].account_id == *id)
                    })
                    .or_else(|| (!self.data.accounts.is_empty()).then_some(0));
                self.inspect(window, cx);
            } else if let Some(account) = &self.account {
                let updated = self
                    .data
                    .accounts
                    .iter()
                    .find(|value| value.account_id == account.account_id)
                    .cloned();
                if let Some(account) = updated {
                    self.sync_inspector(account, false, window, cx);
                } else {
                    self.account = None;
                    self.selected = None;
                }
            }
            if matches!(operation, "setRegion" | "setProfile" | "preferRole") {
                self.message = "Preference saved".into();
            }
            if operation == "assumeRole" {
                self.message = "Credentials set. Your CLI profile is ready to use.".into();
            }
            if matches!(operation, "clearCredential" | "signOut") {
                self.form = None;
                self.focus.focus(window);
                self.message = "Local credentials removed".into();
            }
            if let Some(selected) = self.selected {
                self.selected = Some(selected.min(self.visible(cx).len().saturating_sub(1)));
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
                self.focus.focus(window);
                self.poll(cx);
            }
        } else if operation == "pollLogin" {
            if let Some(login) = &self.login {
                if value["complete"].as_bool() == Some(true) {
                    let name = login.name.clone();
                    self.login = None;
                    self.focus.focus(window);
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

    fn open_session(&mut self, name: String, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let authenticated = self
            .data
            .sessions
            .iter()
            .any(|session| session.name == name && session.authenticated);
        self.screen = Screen::Accounts;
        self.reset_search(window, cx);
        self.data.session = Some(name.clone());
        self.data.accounts.clear();
        self.account = None;
        self.request(
            if authenticated {
                "selectSession"
            } else {
                "snapshot"
            },
            json!({"name": name}),
            cx,
        );
    }

    fn visible(&self, cx: &App) -> Vec<usize> {
        let query = self.search.read(cx).value().to_lowercase();
        let matches = |text: String| {
            let text = text.to_lowercase();
            query.split_whitespace().all(|part| text.contains(part))
        };
        match self.screen {
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
                        value.region.as_deref().unwrap_or("")
                    ))
                })
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
                        value.account_name, value.account_id, value.role_name, value.profile_name
                    ))
                })
                .map(|(index, _)| index)
                .collect(),
            Screen::Settings => vec![],
        }
    }

    fn credential(&self, cx: &App) -> Option<Credential> {
        if self.screen != Screen::Credentials {
            return None;
        }
        self.selected.and_then(|selected| {
            self.visible(cx)
                .get(selected)
                .and_then(|index| self.data.credentials.get(*index))
                .cloned()
        })
    }

    fn role(&self, cx: &App) -> Option<String> {
        self.roles.read(cx).selected_value().cloned()
    }

    fn inspect(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.screen != Screen::Accounts || self.busy {
            return;
        }
        let account = self.selected.and_then(|selected| {
            self.visible(cx)
                .get(selected)
                .and_then(|index| self.data.accounts.get(*index))
                .cloned()
        });
        if let Some(account) = account {
            let load = !account.roles_loaded && self.authenticated();
            let id = account.account_id.clone();
            let reset = self
                .account
                .as_ref()
                .is_none_or(|value| value.account_id != id);
            self.sync_inspector(account, reset, window, cx);
            if load {
                self.request(
                    "loadRoles",
                    json!({"name": self.data.session, "accountId": id}),
                    cx,
                );
            }
        }
    }

    fn sync_inspector(
        &mut self,
        account: Account,
        reset: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let role = if reset {
            account.preferred_role.clone()
        } else {
            self.role(cx)
                .filter(|role| account.roles.contains(role))
                .or_else(|| account.preferred_role.clone())
        };
        self.roles.update(cx, |state, cx| {
            state.set_items(account.roles.clone(), window, cx);
            if let Some(role) = &role {
                state.set_selected_value(role, window, cx);
            } else {
                state.set_selected_index(None, window, cx);
            }
        });
        if reset {
            self.region.update(cx, |state, cx| {
                state.set_value(account.region.clone().unwrap_or_default(), window, cx)
            });
        }
        let profile = role
            .as_ref()
            .and_then(|role| account.profiles.get(role))
            .cloned()
            .unwrap_or_default();
        if reset
            || self
                .account
                .as_ref()
                .is_some_and(|previous| previous.roles != account.roles)
        {
            self.profile
                .update(cx, |state, cx| state.set_value(profile, window, cx));
        }
        self.account = Some(account);
    }

    fn move_selection(&mut self, direction: i32, window: &mut Window, cx: &mut Context<Self>) {
        if self.modal() || self.busy {
            return;
        }
        let count = self.visible(cx).len();
        if count == 0 {
            return;
        }
        self.selected = Some(match self.selected {
            None => 0,
            Some(selected) if direction > 0 => (selected + 1).min(count - 1),
            Some(selected) => selected.saturating_sub(1),
        });
        if let Some(selected) = self.selected {
            self.scroll
                .scroll_to_item(selected, gpui::ScrollStrategy::Center);
        }
        self.focus.focus(window);
        self.inspect(window, cx);
        cx.notify();
    }

    fn reset_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.search
            .update(cx, |state, cx| state.set_value("", window, cx));
        self.selected = None;
        self.scroll.scroll_to_item(0, gpui::ScrollStrategy::Top);
        self.focus.focus(window);
    }

    fn show_form(
        &mut self,
        title: &str,
        description: &str,
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
        } else {
            self.focus.focus(window);
        }
        self.form = Some(Form {
            title: title.into(),
            description: description.into(),
            fields,
            operation,
            args,
            destructive: matches!(operation, "removeSession" | "signOut" | "clearCredential"),
            _subscriptions: subscriptions,
        });
        self.error = false;
        cx.notify();
    }

    fn dispatch(&mut self, command: Command, window: &mut Window, cx: &mut Context<Self>) {
        if matches!(command, Command::Cancel) {
            if self.busy && self.login.is_none() {
                return;
            }
            if let Some(login) = self.login.take() {
                if !self.busy {
                    self.request("cancelLogin", json!({"name": login.name}), cx);
                }
            }
            self.form = None;
            self.palette = false;
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
        if self.busy || self.login.is_some() {
            return;
        }
        if self.form.is_some() && !matches!(command, Command::Confirm) {
            return;
        }
        self.palette = false;
        let name = self.data.session.clone();
        let role = self.role(cx);
        let args = json!({"name": name, "accountId": self.account.as_ref().map(|value| &value.account_id), "role": role});
        match command {
            Command::Session(name) => self.open_session(name, window, cx),
            Command::Inspect => {
                if self.selected.is_none() {
                    self.selected = Some(0);
                }
                self.inspect(window, cx);
                if self
                    .account
                    .as_ref()
                    .is_some_and(|account| account.roles_loaded)
                {
                    self.roles.update(cx, |state, cx| state.focus(window, cx));
                }
            }
            Command::SetCredentials => {
                if self.screen == Screen::Accounts
                    && self.account.is_some()
                    && role.is_some()
                    && self.authenticated()
                {
                    if self.preferences_dirty(cx) {
                        self.error = true;
                        self.message =
                            "Save region and profile changes before setting credentials.".into();
                    } else {
                        self.request("assumeRole", args, cx);
                    }
                }
            }
            Command::Accounts | Command::Credentials | Command::Settings => {
                self.screen = match command {
                    Command::Credentials => Screen::Credentials,
                    Command::Settings => Screen::Settings,
                    _ => Screen::Accounts,
                };
                self.reset_search(window, cx);
                self.account = None;
                self.request("snapshot", json!({"name": name}), cx);
            }
            Command::Refresh => self.request(
                if self.screen == Screen::Accounts && self.authenticated() {
                    "selectSession"
                } else {
                    "snapshot"
                },
                json!({"name": name, "refresh": true}),
                cx,
            ),
            Command::LoadRoles => {
                if self.account.is_some() {
                    self.request("loadRoles", args, cx);
                }
            }
            Command::PreferRole => {
                if self.account.is_some() && role.is_some() {
                    self.request("preferRole", args, cx);
                }
            }
            Command::Console => {
                if self.account.is_some() && role.is_some() {
                    self.request("consoleUrl", args, cx);
                }
            }
            Command::Portal => {
                if name.is_some() {
                    self.request("consoleUrl", json!({"name": name}), cx);
                }
            }
            Command::Login => {
                if name.is_some() {
                    self.request("startLogin", json!({"name": name}), cx);
                }
            }
            Command::NewSession | Command::EditSession => {
                let editing = matches!(command, Command::EditSession);
                let session = if editing {
                    self.data
                        .sessions
                        .iter()
                        .find(|session| Some(&session.name) == name.as_ref())
                        .cloned()
                } else {
                    None
                };
                if editing && session.is_none() {
                    return;
                }
                let session = session.unwrap_or_default();
                self.show_form(if editing { "Edit SSO session" } else { "Add SSO session" }, "Connect an AWS IAM Identity Center organization.", vec![
                    ("name", session.name.clone()), ("startUrl", session.start_url),
                    ("ssoRegion", if session.sso_region.is_empty() { "eu-north-1".into() } else { session.sso_region }),
                    ("defaultRegion", if session.default_region.is_empty() { "eu-north-1".into() } else { session.default_region }),
                ], "saveSession", json!({"creating": !editing, "originalName": if editing { Some(session.name) } else { None }}), window, cx);
            }
            Command::DeleteSession => {
                if name.is_some() {
                    self.show_form("Delete SSO session?", "This removes its configuration only. Existing credential profiles remain; sign out first to remove them.", vec![], "removeSession", json!({"name": name}), window, cx);
                }
            }
            Command::SignOut => {
                if name.is_some() {
                    self.show_form("Sign out of this organization?", "Removes its local access token and tracked AWS credential profiles. Your browser session is not signed out.", vec![], "signOut", json!({"name": name}), window, cx);
                }
            }
            Command::SaveRegion => {
                if self.account.is_some() {
                    self.request("setRegion", json!({"name": name, "accountId": self.account.as_ref().map(|value| &value.account_id), "region": self.region.read(cx).value().trim()}), cx);
                }
            }
            Command::SaveProfile => {
                if self.account.is_some() && role.is_some() {
                    self.request("setProfile", json!({"name": name, "accountId": self.account.as_ref().map(|value| &value.account_id), "role": role, "profile": self.profile.read(cx).value().trim()}), cx);
                }
            }
            Command::RemoveCredential => {
                if let Some(value) = self.credential(cx) {
                    self.show_form("Remove credential profile?", &format!("Removes ‘{}’ from your AWS credentials file and clears its tracking. This cannot be undone.", value.profile_name), vec![], "clearCredential", json!({"name": name, "accountId": value.account_id, "role": value.role_name, "profile": value.profile_name}), window, cx);
                }
            }
            Command::Confirm => {
                if let Some(form) = &self.form {
                    let mut args = form.args.clone();
                    for (key, input) in &form.fields {
                        args[key] = json!(input.read(cx).value().trim());
                    }
                    if args["originalName"]
                        .as_str()
                        .is_some_and(|original| args["name"].as_str() != Some(original))
                    {
                        self.error = true;
                        self.message = "The session name cannot be changed when editing.".into();
                    } else {
                        self.request(form.operation, args, cx);
                    }
                }
            }
            Command::Palette => {
                self.palette = true;
                self.focus.focus(window);
            }
            Command::Appearance(appearance) => self.request(
                "setAppearance",
                json!({"name": name, "appearance": appearance}),
                cx,
            ),
            Command::CopyAccount => {
                let value = self
                    .credential(cx)
                    .map(|value| value.account_id)
                    .or_else(|| self.account.as_ref().map(|value| value.account_id.clone()));
                if let Some(value) = value {
                    cx.write_to_clipboard(ClipboardItem::new_string(value));
                    self.message = "Account ID copied".into();
                }
            }
            Command::CopyProfile => {
                if let Some(value) = self.credential(cx) {
                    cx.write_to_clipboard(ClipboardItem::new_string(value.profile_name));
                    self.message = "Profile name copied".into();
                }
            }
            Command::Cancel | Command::OpenLogin => {}
        }
        cx.notify();
    }
}

fn main() {
    Application::new()
        .with_assets(gpui_component_assets::Assets)
        .run(|cx: &mut App| {
            gpui_component::init(cx);
            platform::apply_appearance("system", None, cx);
            platform::configure(cx);
            cx.bind_keys([
                KeyBinding::new("down", Next, Some("Sesh && !Input && !Select")),
                KeyBinding::new("up", Previous, Some("Sesh && !Input && !Select")),
                KeyBinding::new("enter", Select, Some("Sesh && !Input && !Select")),
                KeyBinding::new("escape", Back, Some("Sesh")),
            ]);
            let bounds = Bounds::centered(None, size(px(1200.), px(780.)), cx);
            let result = cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    window_min_size: Some(size(px(960.), px(620.))),
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
