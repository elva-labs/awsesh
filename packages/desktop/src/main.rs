mod platform;
mod sdk;
mod theme;
mod ui;

use gpui::{
    App, Application, Bounds, ClipboardItem, Context, Entity, FocusHandle, Focusable, KeyBinding,
    Subscription, UniformListScrollHandle, Window, WindowBounds, WindowOptions, actions,
    prelude::*, px, size,
};
use gpui_component::{
    Root,
    input::{InputEvent, InputState, RopeExt},
    menu::PopupMenu,
    select::{SearchableVec, SelectEvent, SelectState},
    slider::{SliderEvent, SliderState, SliderValue},
};
use sdk::{Account, Credential, Sdk, Snapshot};
use serde_json::{Value, json};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Instant;

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
        SetCredentials,
        ToggleDithering,
        ToggleSidebar
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
    ClearAllCredentials,
    Palette,
    Appearance(String),
    Theme(String),
    OpenThemeDirectory,
    Translucency(f32),
    Dithering(bool),
    ToggleSidebar,
    SidebarWidth(f32),
    Confirm,
    Cancel,
    Login,
    OpenLogin,
    CopyAccount,
    CopyProfile,
    CopyName,
    SessionAction(String, Box<Command>),
    ItemAction(usize, Box<Command>),
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

fn sso_start_url(value: &str) -> String {
    let value = value.trim();
    if !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return format!("https://{value}.awsapps.com/start");
    }
    value.to_owned()
}

struct Sesh {
    window: gpui::AnyWindowHandle,
    sdk: Arc<Mutex<Option<Sdk>>>,
    data: Snapshot,
    initialized: bool,
    screen: Screen,
    sidebar_visible: bool,
    sidebar_transition: Option<(f32, Instant)>,
    sidebar_width: f32,
    sidebar_resize_focus: FocusHandle,
    sidebar_save: Option<gpui::Task<()>>,
    window_should_move: bool,
    selected: Option<usize>,
    account: Option<Account>,
    search: Entity<InputState>,
    roles: Entity<SelectState<SearchableVec<String>>>,
    region: Entity<InputState>,
    profile: Entity<InputState>,
    focus: FocusHandle,
    scroll: UniformListScrollHandle,
    busy: bool,
    active: Option<(&'static str, Value)>,
    requests: VecDeque<(&'static str, Value)>,
    message: String,
    error: bool,
    form: Option<Form>,
    login: Option<Login>,
    palette: bool,
    popup: Option<(gpui::Point<gpui::Pixels>, Entity<PopupMenu>, Subscription)>,
    command_search: Entity<InputState>,
    command_selected: usize,
    command_scroll: UniformListScrollHandle,
    pending: Option<(String, Option<String>, Command)>,
    appearance: theme::Appearance,
    themes: Entity<SelectState<SearchableVec<String>>>,
    translucency: Entity<SliderState>,
    translucency_focus: FocusHandle,
    translucency_save: Option<gpui::Task<()>>,
    texture: Arc<gpui::Image>,
    _subscriptions: Vec<Subscription>,
}

impl Sesh {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search =
            cx.new(|cx| InputState::new(window, cx).placeholder("Search accounts, IDs or roles"));
        let roles = cx.new(|cx| {
            SelectState::new(SearchableVec::new(Vec::<String>::new()), None, window, cx)
                .searchable(true)
        });
        let region = cx.new(|cx| InputState::new(window, cx).placeholder("eu-north-1"));
        let profile = cx.new(|cx| InputState::new(window, cx).placeholder("default"));
        let themes = cx.new(|cx| {
            SelectState::new(
                SearchableVec::new(vec!["system".to_owned()]),
                None,
                window,
                cx,
            )
            .searchable(true)
        });
        let command_search = cx.new(|cx| {
            InputState::new(window, cx).placeholder("Search commands and organizations…")
        });
        let translucency = cx.new(|_| SliderState::new().max(100.).step(1.).default_value(10.));
        let subscriptions = vec![
            cx.subscribe_in(&translucency, window, |this, _, event, window, cx| {
                if let SliderEvent::Change(SliderValue::Single(value)) = event {
                    let amount = if (8. ..=12.).contains(value) {
                        10.
                    } else {
                        *value
                    };
                    this.dispatch(Command::Translucency(amount), window, cx);
                }
            }),
            cx.subscribe_in(
                &themes,
                window,
                |this, _, event: &SelectEvent<SearchableVec<String>>, window, cx| {
                    if let SelectEvent::Confirm(Some(name)) = event {
                        this.dispatch(Command::Theme(name.clone()), window, cx);
                    }
                },
            ),
            cx.subscribe_in(
                &command_search,
                window,
                |this, _, event: &InputEvent, window, cx| {
                    if matches!(event, InputEvent::Change) {
                        this.command_selected = 0;
                        this.command_scroll
                            .scroll_to_item(0, gpui::ScrollStrategy::Top);
                        cx.notify();
                    }
                    if matches!(event, InputEvent::PressEnter { .. }) {
                        if let Some((_, command)) =
                            this.commands(cx).get(this.command_selected).cloned()
                        {
                            this.dispatch(command, window, cx);
                        }
                    }
                },
            ),
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
                |this, _, event: &SelectEvent<SearchableVec<String>>, window, cx| {
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
                if this.appearance.mode == "system" {
                    this.apply_appearance(window, cx);
                }
                cx.notify();
            }),
            cx.observe_window_activation(window, |_, _, cx| cx.notify()),
            cx.observe_keystrokes(|this, event, window, cx| {
                if event.keystroke.key != "tab" {
                    return;
                }
                let input = this
                    .form
                    .iter()
                    .flat_map(|form| form.fields.iter().map(|(_, input)| input))
                    .chain([&this.region, &this.profile])
                    .find(|input| input.read(cx).focus_handle(cx).is_focused(window))
                    .cloned();
                if let Some(input) = input {
                    input.update(cx, |input, cx| {
                        let end = input.text().offset_to_position(input.text().len());
                        input.set_cursor_position(end, window, cx);
                    });
                }
            }),
        ];
        let mut view = Self {
            window: window.window_handle(),
            sdk: Arc::new(Mutex::new(None)),
            data: Snapshot::default(),
            initialized: false,
            screen: Screen::Accounts,
            sidebar_visible: true,
            sidebar_transition: None,
            sidebar_width: 216.,
            sidebar_resize_focus: cx.focus_handle(),
            sidebar_save: None,
            window_should_move: false,
            selected: None,
            account: None,
            search,
            roles,
            region,
            profile,
            focus: cx.focus_handle(),
            scroll: UniformListScrollHandle::new(),
            busy: false,
            active: None,
            requests: VecDeque::new(),
            message: String::new(),
            error: false,
            form: None,
            login: None,
            palette: false,
            popup: None,
            command_search,
            command_selected: 0,
            command_scroll: UniformListScrollHandle::new(),
            pending: None,
            appearance: theme::Appearance {
                theme: "system".into(),
                mode: "system".into(),
                translucency: 10.,
                sidebar_visible: true,
                sidebar_width: 216.,
                ..Default::default()
            },
            themes,
            translucency,
            translucency_focus: cx.focus_handle(),
            translucency_save: None,
            texture: Arc::new(gpui::Image::from_bytes(
                gpui::ImageFormat::Svg,
                include_bytes!("../assets/dither.svg").to_vec(),
            )),
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
        view.request("getAppearance", json!({}), cx);
        view.request("snapshot", json!({}), cx);
        view
    }

    fn modal(&self) -> bool {
        self.form.is_some() || self.login.is_some() || self.palette
    }

    fn apply_appearance(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.sidebar_save.is_none()
            && !self.active.as_ref().is_some_and(|(operation, args)| {
                *operation == "setAppearance" && args.get("sidebarWidth").is_some()
            })
            && !self.requests.iter().any(|(operation, args)| {
                *operation == "setAppearance" && args.get("sidebarWidth").is_some()
            })
        {
            self.sidebar_width = self.appearance.sidebar_width;
        }
        if !self.active.as_ref().is_some_and(|(operation, args)| {
            *operation == "setAppearance" && args.get("sidebarVisible").is_some()
        }) && !self.requests.iter().any(|(operation, args)| {
            *operation == "setAppearance" && args.get("sidebarVisible").is_some()
        }) {
            self.sidebar_visible = self.appearance.sidebar_visible;
        }
        if self.translucency_save.is_none()
            && !self.active.as_ref().is_some_and(|(operation, args)| {
                *operation == "setAppearance" && args.get("translucency").is_some()
            })
            && !self.requests.iter().any(|(operation, args)| {
                *operation == "setAppearance" && args.get("translucency").is_some()
            })
        {
            self.translucency.update(cx, |state, cx| {
                state.set_value(self.appearance.translucency, window, cx);
            });
        }
        theme::apply(&self.appearance, Some(window), cx);
        theme::apply_translucency(self.translucency.read(cx).value().end(), window, cx);
    }

    fn sidebar_progress(&self) -> f32 {
        let target = if self.sidebar_visible { 1. } else { 0. };
        let Some((from, started)) = self.sidebar_transition else {
            return target;
        };
        let elapsed = (started.elapsed().as_secs_f32() / 0.2).min(1.);
        if elapsed >= 1. {
            return target;
        }
        let mut low = 0.;
        let mut high = 1.;
        for _ in 0..12 {
            let time = (low + high) / 2.;
            let position = time * time * (1.74 - 0.74 * time);
            if position < elapsed {
                low = time;
            } else {
                high = time;
            }
        }
        let time = (low + high) / 2.;
        let progress = time * time * (3. - 2. * time);
        from + (target - from) * progress
    }

    fn authenticated(&self) -> bool {
        self.data.sessions.iter().any(|session| {
            Some(&session.name) == self.data.session.as_ref() && session.authenticated
        })
    }

    fn request(&mut self, operation: &'static str, args: Value, cx: &mut Context<Self>) {
        if operation != "setAppearance"
            && (self
                .active
                .as_ref()
                .is_some_and(|(current, values)| *current == operation && *values == args)
                || self
                    .requests
                    .iter()
                    .any(|(current, values)| *current == operation && *values == args))
        {
            return;
        }
        if self.busy {
            self.requests.push_back((operation, args));
            return;
        }
        if !self.requests.is_empty() {
            self.requests.push_back((operation, args));
            if let Some((operation, args)) = self.requests.pop_front() {
                self.start_request(operation, args, cx);
            }
            return;
        }
        self.start_request(operation, args, cx);
    }

    fn start_request(&mut self, operation: &'static str, args: Value, cx: &mut Context<Self>) {
        self.busy = true;
        self.active = Some((operation, args.clone()));
        let request_name = args.get("name").and_then(Value::as_str).map(str::to_owned);
        let request_account = args
            .get("accountId")
            .and_then(Value::as_str)
            .map(str::to_owned);
        if !matches!(
            operation,
            "snapshot" | "getAppearance" | "openThemeDirectory"
        ) {
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
                    this.active = None;
                    match result {
                        Ok(value) => this.receive(operation, value, window, cx),
                        Err(error) => {
                            if operation == "setAppearance" {
                                this.themes.update(cx, |state, cx| {
                                    state.set_selected_value(&this.appearance.theme, window, cx);
                                });
                                this.apply_appearance(window, cx);
                            }
                            if this.pending.as_ref().is_some_and(|(name, account, _)| {
                                Some(name) == request_name.as_ref() && *account == request_account
                            }) {
                                this.pending = None;
                            }
                            this.error = true;
                            this.message = error.to_string();
                            if matches!(operation, "pollLogin" | "startLogin") {
                                this.login = None;
                            }
                        }
                    }
                    if !this.busy {
                        if let Some((operation, args)) = this.requests.pop_front() {
                            this.start_request(operation, args, cx);
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
        if !matches!(
            operation,
            "snapshot" | "getAppearance" | "openThemeDirectory"
        ) {
            self.message.clear();
        }
        if matches!(operation, "getAppearance" | "setAppearance") {
            match serde_json::from_value::<theme::Appearance>(value) {
                Ok(appearance) => {
                    self.appearance = appearance;
                    self.apply_appearance(window, cx);
                    self.themes.update(cx, |state, cx| {
                        state.set_items(self.appearance.themes.clone().into(), window, cx);
                        state.set_selected_value(&self.appearance.theme, window, cx);
                    });
                    if !self.appearance.warnings.is_empty() {
                        self.error = true;
                        self.message = self.appearance.warnings.join(" · ");
                    }
                }
                Err(error) => {
                    self.error = true;
                    self.message = format!("Invalid appearance state: {error}");
                }
            }
            return;
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
            let current = data.session == self.data.session;
            if !self.initialized || current || matches!(operation, "saveSession" | "removeSession")
            {
                self.data = data;
            } else {
                self.data.sessions = data.sessions;
                self.data.credentials = data.credentials;
            }
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
            if current
                && operation == "selectSession"
                && self.screen == Screen::Accounts
                && self.account.is_none()
                && self.search.read(cx).value().is_empty()
            {
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
            } else if current && let Some(account) = &self.account {
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
                self.message = "Credentials set".into();
            }
            if matches!(
                operation,
                "clearCredential" | "clearAllCredentials" | "signOut"
            ) {
                self.form = None;
                self.focus.focus(window);
                self.message = "Local credentials removed".into();
            }
            if let Some(selected) = self.selected {
                self.selected = Some(selected.min(self.visible(cx).len().saturating_sub(1)));
            }
            if current
                && self.pending.as_ref().is_some_and(|(name, account, _)| {
                    self.data.session.as_ref() == Some(name)
                        && account.as_ref().is_none_or(|id| {
                            self.account
                                .as_ref()
                                .is_some_and(|value| value.account_id == *id && value.roles_loaded)
                        })
                })
            {
                if let Some((_, _, command)) = self.pending.take() {
                    self.dispatch(command, window, cx);
                }
            }
        } else if operation == "openThemeDirectory" {
            if let Some(directory) = value.as_str() {
                cx.reveal_path(&std::path::Path::new(directory).join("theme.json.example"));
            }
        } else if operation == "consoleUrl" {
            if let Some(url) = value.as_str() {
                cx.open_url(url);
            }
        } else if operation == "startLogin" {
            if let (Some(url), Some(code), Some(name)) = (
                value["url"].as_str(),
                value["code"].as_str(),
                self.login.as_ref().map(|login| login.name.clone()),
            ) {
                cx.open_url(url);
                self.login = Some(Login {
                    name,
                    url: url.into(),
                    code: code.into(),
                });
                self.focus.focus(window);
                self.poll(cx);
            } else {
                self.request("cancelLogin", json!({"name": self.data.session}), cx);
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
        if self.data.session.as_ref() == Some(&name) {
            if self.screen != Screen::Accounts {
                self.reset_search(window, cx);
            }
            self.screen = Screen::Accounts;
            cx.notify();
            return;
        }
        let authenticated = self
            .data
            .sessions
            .iter()
            .any(|session| session.name == name && session.authenticated);
        self.screen = Screen::Accounts;
        self.pending = None;
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
                        "{} {} {} {} {}",
                        value.name,
                        value.account_id,
                        value.roles.join(" "),
                        value.region.as_deref().unwrap_or(""),
                        value.last_profile.as_deref().unwrap_or("")
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

    fn commands(&self, cx: &App) -> Vec<(String, Command)> {
        let mut commands = vec![
            ("Add SSO session…".into(), Command::NewSession),
            ("Show accounts".into(), Command::Accounts),
            ("Show active credentials".into(), Command::Credentials),
            (
                "Clear all active credentials…".into(),
                Command::ClearAllCredentials,
            ),
            ("Settings".into(), Command::Settings),
            ("Refresh".into(), Command::Refresh),
        ];
        if cfg!(target_os = "macos") {
            commands.push((
                if self.sidebar_visible {
                    "Hide sidebar"
                } else {
                    "Show sidebar"
                }
                .into(),
                Command::ToggleSidebar,
            ));
        }
        commands.extend(self.data.sessions.iter().map(|session| {
            (
                format!("Switch to {}", session.name),
                Command::Session(session.name.clone()),
            )
        }));
        commands.extend(
            self.appearance
                .themes
                .iter()
                .map(|name| (format!("Theme: {name}"), Command::Theme(name.clone()))),
        );
        commands.extend(["system", "light", "dark"].into_iter().map(|mode| {
            (
                format!("Appearance mode: {mode}"),
                Command::Appearance(mode.into()),
            )
        }));
        if self.data.session.is_some() {
            commands.extend([
                ("Edit this session…".into(), Command::EditSession),
                ("Open SSO portal".into(), Command::Portal),
                ("Delete this session…".into(), Command::DeleteSession),
                (
                    if self.authenticated() {
                        "Sign out…"
                    } else {
                        "Sign in"
                    }
                    .into(),
                    if self.authenticated() {
                        Command::SignOut
                    } else {
                        Command::Login
                    },
                ),
            ]);
        }
        if self.account.is_some() {
            commands.extend([
                ("Copy account ID".into(), Command::CopyAccount),
                ("Copy account name".into(), Command::CopyName),
            ]);
            if self.role(cx).is_some() {
                commands.push(("Open AWS Console".into(), Command::Console));
                if self.authenticated() && !self.preferences_dirty(cx) {
                    commands.push(("Set credentials".into(), Command::SetCredentials));
                }
            }
        }
        if self.credential(cx).is_some() {
            commands.extend([
                (
                    "Remove credential profile…".into(),
                    Command::RemoveCredential,
                ),
                ("Copy CLI profile".into(), Command::CopyProfile),
                ("Copy account ID".into(), Command::CopyAccount),
                ("Copy account name".into(), Command::CopyName),
            ]);
        }
        let query = self.command_search.read(cx).value().to_lowercase();
        commands.retain(|(label, _)| {
            query
                .split_whitespace()
                .all(|part| label.to_lowercase().contains(part))
        });
        commands
    }

    fn inspect(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.screen != Screen::Accounts {
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
            if reset {
                self.pending = None;
            }
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
            state.set_items(account.roles.clone().into(), window, cx);
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
        if self.modal() {
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
        self.pending = None;
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
                    cx.new(|cx| {
                        InputState::new(window, cx)
                            .default_value(value)
                            .placeholder(match label {
                                "startUrl" => "Organization short name or full URL",
                                _ => "",
                            })
                    }),
                )
            })
            .collect();
        let subscriptions = fields
            .iter()
            .map(|(key, input)| {
                let start_url = key == "startUrl";
                cx.subscribe_in(
                    input,
                    window,
                    move |this, input, event: &InputEvent, window, cx| {
                        if matches!(event, InputEvent::Change) {
                            cx.notify();
                        }
                        if start_url && matches!(event, InputEvent::Blur) {
                            let value = input.read(cx).value();
                            let url = sso_start_url(&value);
                            if value.as_str() != url {
                                input.update(cx, |input, cx| input.set_value(url, window, cx));
                            }
                        }
                        if matches!(event, InputEvent::PressEnter { .. }) {
                            this.dispatch(Command::Confirm, window, cx);
                        }
                    },
                )
            })
            .collect();
        if let Some((_, input)) = fields.first() {
            input.update(cx, |input, cx| {
                let end = input.text().offset_to_position(input.text().len());
                input.set_cursor_position(end, window, cx);
            });
        } else {
            self.focus.focus(window);
        }
        self.form = Some(Form {
            title: title.into(),
            description: description.into(),
            fields,
            operation,
            args,
            destructive: matches!(
                operation,
                "removeSession" | "signOut" | "clearCredential" | "clearAllCredentials"
            ),
            _subscriptions: subscriptions,
        });
        self.error = false;
        cx.notify();
    }

    fn dispatch(&mut self, command: Command, window: &mut Window, cx: &mut Context<Self>) {
        self.popup = None;
        if matches!(command, Command::Cancel) {
            if let Some(login) = self.login.take() {
                self.requests
                    .retain(|(operation, _)| !matches!(*operation, "startLogin" | "pollLogin"));
                self.request("cancelLogin", json!({"name": login.name}), cx);
            }
            self.form = None;
            self.palette = false;
            self.pending = None;
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
        if self.login.is_some() {
            return;
        }
        if self.form.is_some() && !matches!(command, Command::Confirm) {
            return;
        }
        if self.palette {
            self.focus.focus(window);
        }
        self.palette = false;
        if let Command::ItemAction(position, command) = command {
            self.selected = Some(position);
            self.focus.focus(window);
            if self.screen == Screen::Accounts
                && matches!(*command, Command::CopyAccount | Command::CopyName)
            {
                let account = self
                    .visible(cx)
                    .get(position)
                    .and_then(|index| self.data.accounts.get(*index))
                    .cloned();
                if let Some(account) = account {
                    let reset = self
                        .account
                        .as_ref()
                        .is_none_or(|previous| previous.account_id != account.account_id);
                    self.sync_inspector(account, reset, window, cx);
                }
            } else {
                self.inspect(window, cx);
            }
            if matches!(*command, Command::SetCredentials | Command::Console)
                && self.authenticated()
                && self
                    .account
                    .as_ref()
                    .is_some_and(|account| !account.roles_loaded)
            {
                if let (Some(name), Some(account)) = (&self.data.session, &self.account) {
                    self.pending = Some((name.clone(), Some(account.account_id.clone()), *command));
                }
            } else {
                self.dispatch(*command, window, cx);
            }
            cx.notify();
            return;
        }
        if let Command::SessionAction(name, command) = command {
            if matches!(*command, Command::Login) {
                self.open_session(name, window, cx);
                self.dispatch(*command, window, cx);
                return;
            }
            if self.data.session.as_ref() == Some(&name) {
                self.dispatch(*command, window, cx);
                return;
            }
            self.screen = Screen::Accounts;
            self.reset_search(window, cx);
            self.data.session = Some(name.clone());
            self.data.accounts.clear();
            self.account = None;
            self.pending = Some((name.clone(), None, *command));
            self.request("snapshot", json!({"name": name}), cx);
            return;
        }
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
                if !self.authenticated() {
                    self.error = true;
                    self.message = "Sign in before setting credentials.".into();
                } else if self.account.is_some() && role.is_none() {
                    self.roles.update(cx, |state, cx| state.focus(window, cx));
                    self.message = "Choose a role before setting credentials.".into();
                }
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
                if self.screen == Screen::Settings {
                    self.request("getAppearance", json!({}), cx);
                }
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
                } else if self.account.is_some() {
                    self.roles.update(cx, |state, cx| state.focus(window, cx));
                    self.message = "Choose a role before opening the AWS Console.".into();
                }
            }
            Command::Portal => {
                if name.is_some() {
                    self.request("consoleUrl", json!({"name": name}), cx);
                }
            }
            Command::Login => {
                if let Some(name) = name {
                    self.login = Some(Login {
                        name: name.clone(),
                        url: String::new(),
                        code: String::new(),
                    });
                    self.focus.focus(window);
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
            Command::ClearAllCredentials => {
                self.show_form("Clear all active credentials?", "Removes all awsesh-tracked local AWS credential profiles across organizations. Other profiles and SSO sign-ins remain. This cannot be undone.", vec![], "clearAllCredentials", json!({"name": name}), window, cx);
            }
            Command::Confirm => {
                if let Some(form) = &self.form {
                    let mut args = form.args.clone();
                    for (key, input) in &form.fields {
                        let value = input.read(cx).value();
                        args[key] = json!(if key == "startUrl" {
                            sso_start_url(&value)
                        } else {
                            value.trim().to_owned()
                        });
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
                self.command_selected = 0;
                self.command_search.update(cx, |state, cx| {
                    state.set_value("", window, cx);
                    state.focus(window, cx);
                });
            }
            Command::Appearance(appearance) => {
                self.request("setAppearance", json!({"mode": appearance}), cx)
            }
            Command::Theme(theme) => self.request("setAppearance", json!({"theme": theme}), cx),
            Command::OpenThemeDirectory => self.request("openThemeDirectory", json!({}), cx),
            Command::Dithering(dithering) => {
                self.request("setAppearance", json!({"dithering": dithering}), cx)
            }
            Command::ToggleSidebar => {
                let from = self.sidebar_progress();
                self.sidebar_visible = !self.sidebar_visible;
                self.sidebar_transition =
                    (!platform::reduced_motion()).then(|| (from, Instant::now()));
                self.focus.focus(window);
                self.request(
                    "setAppearance",
                    json!({"sidebarVisible": self.sidebar_visible}),
                    cx,
                );
            }
            Command::SidebarWidth(value) => {
                self.sidebar_width = value.clamp(192., 400.);
                let width = self.sidebar_width;
                self.sidebar_save = Some(cx.spawn(async move |this, cx| {
                    cx.background_executor()
                        .timer(std::time::Duration::from_millis(150))
                        .await;
                    let _ = this.update(cx, |this, cx| {
                        this.sidebar_save = None;
                        this.request("setAppearance", json!({"sidebarWidth": width}), cx);
                    });
                }));
            }
            Command::Translucency(value) => {
                let amount = value.clamp(0., 100.);
                self.translucency
                    .update(cx, |state, cx| state.set_value(amount, window, cx));
                theme::apply_translucency(amount, window, cx);
                window.refresh();
                self.translucency_save = Some(cx.spawn(async move |this, cx| {
                    cx.background_executor()
                        .timer(std::time::Duration::from_millis(150))
                        .await;
                    let _ = this.update(cx, |this, cx| {
                        this.translucency_save = None;
                        this.request("setAppearance", json!({"translucency": amount}), cx);
                    });
                }));
            }
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
            Command::CopyName => {
                let value = self
                    .credential(cx)
                    .map(|value| value.account_name)
                    .or_else(|| self.account.as_ref().map(|value| value.name.clone()));
                if let Some(value) = value {
                    cx.write_to_clipboard(ClipboardItem::new_string(value));
                    self.message = "Account name copied".into();
                }
            }
            Command::Cancel
            | Command::OpenLogin
            | Command::ItemAction(..)
            | Command::SessionAction(..) => {}
        }
        cx.notify();
    }
}

fn main() {
    Application::new()
        .with_assets(ui::Assets)
        .run(|cx: &mut App| {
            gpui_component::init(cx);
            platform::apply_appearance("system", None, cx);
            platform::configure(cx);
            cx.bind_keys([
                KeyBinding::new("down", Next, Some("Sesh && !Input && !Select")),
                KeyBinding::new("up", Previous, Some("Sesh && !Input && !Select")),
                KeyBinding::new("enter", Select, Some("Sesh && !Input && !Select")),
                KeyBinding::new("escape", Back, Some("Sesh")),
                KeyBinding::new("space", ToggleDithering, Some("Sesh && DitherTexture")),
                KeyBinding::new("enter", ToggleDithering, Some("Sesh && DitherTexture")),
            ]);
            let bounds = Bounds::centered(None, size(px(1200.), px(780.)), cx);
            let result = cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    window_min_size: Some(size(px(960.), px(620.))),
                    titlebar: Some(platform::titlebar_options()),
                    ..Default::default()
                },
                |window, cx| {
                    platform::configure_window(window);
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

#[cfg(test)]
mod tests {
    use super::sso_start_url;

    #[test]
    fn resolves_sso_short_names_without_rewriting_urls() {
        for (input, expected) in [
            ("  my-org  ", "https://my-org.awsapps.com/start"),
            ("my_org", "https://my_org.awsapps.com/start"),
            (
                "https://example.awsapps.com/start",
                "https://example.awsapps.com/start",
            ),
            (
                "https://start.cn-north-1.home.awsapps.cn/directory/example#/",
                "https://start.cn-north-1.home.awsapps.cn/directory/example#/",
            ),
            ("http://example.com", "http://example.com"),
            ("invalid name", "invalid name"),
            ("", ""),
        ] {
            assert_eq!(sso_start_url(input), expected);
        }
    }
}
