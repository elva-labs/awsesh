#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod platform;
mod sdk;
mod select;
mod theme;
mod ui;
mod window_state;

use gpui::{
    App, Application, Bounds, ClipboardItem, Context, Entity, FocusHandle, Focusable, KeyBinding,
    Pixels, SharedString, Subscription, UniformListScrollHandle, Window, WindowBounds,
    WindowOptions, actions, prelude::*, px, size,
};
use gpui_component::{
    Root, VirtualListScrollHandle,
    input::{InputEvent, InputState, RopeExt},
    select::{SearchableVec, SelectEvent, SelectState},
    slider::{SliderEvent, SliderState, SliderValue},
};
use sdk::{Account, Credential, Sdk, Snapshot};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
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
        ToggleSidebar,
        TogglePin
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
    RoleMenu,
    SelectRole(String),
    PreferRole,
    Console,
    Portal,
    NewSession,
    EditSession,
    DeleteSession,
    SignOut,
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
    UseWslWorkspace(bool),
    RecordShortcut(&'static str),
    ClearShortcut(&'static str),
    ResetShortcuts,
    Confirm,
    Cancel,
    Login,
    OpenLogin,
    CopyAccount,
    CopyProfile,
    CopyName,
    TogglePin,
    Pin(bool),
    ClearSelection,
    GroupMenu,
    NewGroup,
    SetGroup(Option<String>),
    ToggleGroup(String),
    RenameGroup(String),
    RemoveGroup(String),
    SessionAction(String, Box<Command>),
    ItemAction(usize, Box<Command>),
}

#[derive(Clone, Debug, PartialEq)]
enum Entry {
    Heading {
        group: Option<String>,
        count: usize,
        collapsed: bool,
    },
    Account(usize),
}

fn sections(
    accounts: &[Account],
    matches: Vec<usize>,
    collapsed: &[String],
    searching: bool,
) -> Vec<Entry> {
    if !accounts
        .iter()
        .any(|account| account.pinned || account.group.is_some())
    {
        return matches.into_iter().map(Entry::Account).collect();
    }
    let mut groups: Vec<(Option<String>, Vec<usize>)> = vec![];
    for index in matches {
        let account = &accounts[index];
        let key = (!account.pinned).then(|| account.group.clone().unwrap_or_default());
        match groups.iter_mut().find(|(group, _)| *group == key) {
            Some((_, members)) => members.push(index),
            None => groups.push((key, vec![index])),
        }
    }
    groups.sort_by_key(|(group, _)| match group.as_deref() {
        None => (0, String::new(), String::new()),
        Some("") => (2, String::new(), String::new()),
        Some(group) => (1, group.to_lowercase(), group.to_owned()),
    });
    groups
        .into_iter()
        .flat_map(|(group, members)| {
            let collapsed = !searching
                && group
                    .as_ref()
                    .is_some_and(|group| collapsed.contains(group));
            let heading = Entry::Heading {
                count: members.len(),
                group,
                collapsed,
            };
            let members = if collapsed { vec![] } else { members };
            std::iter::once(heading).chain(members.into_iter().map(Entry::Account))
        })
        .collect()
}

/// The group every account is in, when they all share one; `Some(None)` when none are grouped.
fn shared_group(accounts: &[Account]) -> Option<Option<String>> {
    let (first, rest) = accounts.split_first()?;
    rest.iter()
        .all(|account| account.group == first.group)
        .then(|| first.group.clone())
}

struct Form {
    title: String,
    description: String,
    fields: Vec<(String, Entity<InputState>)>,
    operation: &'static str,
    args: Value,
    submission: Option<Value>,
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
    /// Account IDs picked with ⌘/Ctrl- or Shift-click for bulk operations.
    marked: BTreeSet<String>,
    account: Option<Account>,
    search: Entity<InputState>,
    role: Option<String>,
    role_focus: FocusHandle,
    role_bounds: Bounds<Pixels>,
    list_width: Pixels,
    dragging: Vec<String>,
    drop_section: Option<Option<String>>,
    region: Entity<InputState>,
    profile: Entity<InputState>,
    preferences: BTreeMap<&'static str, Value>,
    preference_save: Option<gpui::Task<()>>,
    focus: FocusHandle,
    scroll: VirtualListScrollHandle,
    busy: bool,
    active: Option<(&'static str, Value)>,
    requests: VecDeque<(&'static str, Value)>,
    message: String,
    error: bool,
    form: Option<Form>,
    login: Option<Login>,
    palette: bool,
    popup: Option<(
        gpui::Point<gpui::Pixels>,
        Entity<select::Dropdown>,
        Subscription,
    )>,
    command_search: Entity<InputState>,
    command_selected: usize,
    command_scroll: UniformListScrollHandle,
    pending: Option<(String, Option<String>, Command)>,
    appearance: theme::Appearance,
    themes: Entity<SelectState<SearchableVec<String>>>,
    translucency: Entity<SliderState>,
    translucency_focus: FocusHandle,
    translucency_save: Option<gpui::Task<()>>,
    window_save: Option<gpui::Task<()>>,
    texture: Arc<gpui::Image>,
    shortcuts: BTreeMap<String, String>,
    fixed_bindings: Vec<KeyBinding>,
    wsl_available: bool,
    wsl_enabled: bool,
    recording: Option<&'static str>,
    shortcut_release: Option<String>,
    shortcut_error: Option<String>,
    _subscriptions: Vec<Subscription>,
}

impl Sesh {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let search =
            cx.new(|cx| InputState::new(window, cx).placeholder("Search accounts, IDs or roles"));
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
        let view = cx.entity().downgrade();
        let subscriptions = vec![
            cx.intercept_keystrokes(move |event, window, cx| {
                let _ = view.update(cx, |this, cx| {
                    if this.shortcut_release.as_deref() == Some(event.keystroke.key.as_str()) {
                        cx.stop_propagation();
                        return;
                    }
                    this.shortcut_release = None;
                    if this.recording.is_none() {
                        return;
                    }
                    let stroke = &event.keystroke;
                    if (stroke.key == "tab"
                        && !(stroke.modifiers.control
                            || stroke.modifiers.platform
                            || stroke.modifiers.alt
                            || stroke.modifiers.function))
                        || (stroke.modifiers.number_of_modifiers() == 0
                            && matches!(stroke.key.as_str(), "enter" | "space"))
                    {
                        return;
                    }
                    cx.stop_propagation();
                    this.record_shortcut(stroke, window, cx);
                });
            }),
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
                        this.flush_preferences(cx);
                        this.selected = None;
                        this.marked.clear();
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
                &region,
                window,
                |this, _, event: &InputEvent, window, cx| {
                    if matches!(event, InputEvent::Change) {
                        this.schedule_preference("setRegion", window, cx);
                    }
                    if matches!(event, InputEvent::Blur | InputEvent::PressEnter { .. }) {
                        this.flush_preferences(cx);
                    }
                },
            ),
            cx.subscribe_in(
                &profile,
                window,
                |this, _, event: &InputEvent, window, cx| {
                    if matches!(event, InputEvent::Change) {
                        this.schedule_preference("setProfile", window, cx);
                    }
                    if matches!(event, InputEvent::Blur | InputEvent::PressEnter { .. }) {
                        this.flush_preferences(cx);
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
            cx.observe_window_bounds(window, |this, window, cx| {
                this.schedule_window_save(window, cx)
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
            marked: BTreeSet::new(),
            account: None,
            search,
            role: None,
            role_focus: cx.focus_handle(),
            role_bounds: Bounds::default(),
            list_width: px(0.),
            dragging: Vec::new(),
            drop_section: None,
            region,
            profile,
            preferences: BTreeMap::new(),
            preference_save: None,
            focus: cx.focus_handle(),
            scroll: VirtualListScrollHandle::new(),
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
            window_save: None,
            texture: Arc::new(gpui::Image::from_bytes(
                gpui::ImageFormat::Svg,
                include_bytes!("../assets/dither.svg").to_vec(),
            )),
            shortcuts: BTreeMap::new(),
            fixed_bindings: cx.key_bindings().borrow().bindings().cloned().collect(),
            wsl_available: false,
            wsl_enabled: false,
            recording: None,
            shortcut_release: None,
            shortcut_error: None,
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
        if let Err(error) = view.update_shortcuts(&BTreeMap::new(), cx) {
            view.error = true;
            view.message = format!("Cannot configure shortcuts: {error}");
        }
        view
    }

    fn modal(&self) -> bool {
        self.form.is_some() || self.login.is_some() || self.palette || self.recording.is_some()
    }

    fn update_shortcuts(
        &mut self,
        overrides: &BTreeMap<String, String>,
        cx: &mut Context<Self>,
    ) -> anyhow::Result<()> {
        let shortcuts = platform::validate_shortcuts(overrides, &self.fixed_bindings)?;
        platform::apply_shortcuts(&shortcuts, &self.fixed_bindings, cx)?;
        self.shortcuts = shortcuts;
        Ok(())
    }

    fn save_shortcuts(
        &mut self,
        shortcuts: BTreeMap<String, String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let Err(error) = self.update_shortcuts(&shortcuts, cx) {
            self.shortcut_error = Some(error.to_string());
            cx.notify();
            return;
        }
        self.recording = None;
        self.shortcut_error = None;
        self.focus.focus(window);
        self.request("setAppearance", json!({"shortcuts": self.shortcuts}), cx);
    }

    fn record_shortcut(
        &mut self,
        stroke: &gpui::Keystroke,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(id) = self.recording else {
            return;
        };
        if stroke.key == "escape" && stroke.modifiers.number_of_modifiers() == 0 {
            self.dispatch(Command::Cancel, window, cx);
            return;
        }
        if matches!(
            stroke.key.as_str(),
            "shift" | "control" | "alt" | "platform" | "function"
        ) {
            return;
        }
        let mut shortcuts = self.shortcuts.clone();
        shortcuts.insert(id.into(), stroke.unparse());
        self.save_shortcuts(shortcuts, window, cx);
        self.shortcut_release = Some(stroke.key.clone());
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
        if matches!(
            operation,
            "setRegion" | "setProfile" | "collapseAccountGroup"
        ) {
            if self
                .requests
                .iter()
                .rev()
                .chain(self.active.iter())
                .find(|(current, _)| *current == operation)
                .is_some_and(|(_, values)| *values == args)
            {
                return;
            }
        } else if operation != "setAppearance"
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

    fn schedule_preference(
        &mut self,
        operation: &'static str,
        window: &Window,
        cx: &mut Context<Self>,
    ) {
        let Some(account) = &self.account else {
            return;
        };
        let role = self.role(cx);
        let (input, field, saved) = match operation {
            "setRegion" => (
                &self.region,
                "region",
                account.region.as_deref().unwrap_or(""),
            ),
            "setProfile" => (
                &self.profile,
                "profile",
                role.as_ref()
                    .and_then(|role| account.profiles.get(role))
                    .map(String::as_str)
                    .unwrap_or(""),
            ),
            _ => return,
        };
        if self.screen != Screen::Accounts
            || !input.read(cx).focus_handle(cx).is_focused(window)
            || (operation == "setProfile" && role.is_none())
        {
            return;
        }
        let value = input.read(cx).value().trim().to_owned();
        let mut args = json!({"name": self.data.session, "accountId": account.account_id});
        if operation == "setProfile" {
            args["role"] = json!(role);
        }
        let outstanding =
            self.active
                .iter()
                .chain(self.requests.iter())
                .any(|(current, values)| {
                    *current == operation
                        && values["name"] == args["name"]
                        && values["accountId"] == args["accountId"]
                        && values["role"] == args["role"]
                });
        if value == saved && !outstanding {
            self.preferences.remove(operation);
            if self.preferences.is_empty() {
                self.preference_save = None;
            }
            cx.notify();
            return;
        }
        args[field] = json!(value);
        self.preferences.insert(operation, args);
        self.preference_save = Some(cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(400))
                .await;
            let _ = this.update(cx, |this, cx| this.flush_preferences(cx));
        }));
        cx.notify();
    }

    fn flush_preferences(&mut self, cx: &mut Context<Self>) {
        self.preference_save = None;
        for (operation, args) in std::mem::take(&mut self.preferences) {
            self.request(operation, args, cx);
        }
        cx.notify();
    }

    /// Records the window geometry and writes it out once the window settles, so
    /// the size and position survive even if the app is quit without a clean close.
    fn schedule_window_save(&mut self, window: &Window, cx: &mut Context<Self>) {
        window_state::note(window);
        self.window_save = Some(cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(500))
                .await;
            let _ = this.update(cx, |this, _| {
                this.window_save = None;
                window_state::persist();
            });
        }));
    }

    fn preferences_saving(&self, cx: &App) -> bool {
        let Some(account) = &self.account else {
            return false;
        };
        let role = self.role(cx);
        let saving = |operation: &str, args: &Value| {
            matches!(operation, "setRegion" | "setProfile")
                && args["name"].as_str() == self.data.session.as_deref()
                && args["accountId"].as_str() == Some(account.account_id.as_str())
                && (operation != "setProfile" || args["role"].as_str() == role.as_deref())
        };
        self.preferences
            .iter()
            .any(|(operation, args)| saving(operation, args))
            || self
                .active
                .iter()
                .chain(self.requests.iter())
                .any(|(operation, args)| saving(operation, args))
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
        let request = args.clone();
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
                        Ok(value) => this.receive(operation, value, &request, window, cx),
                        Err(error) => {
                            if let Some(form) = &mut this.form
                                && form.operation == operation
                                && form.submission.as_ref() == Some(&request)
                            {
                                form.submission = None;
                            }
                            if operation == "setAppearance" {
                                this.themes.update(cx, |state, cx| {
                                    state.set_selected_value(&this.appearance.theme, window, cx);
                                });
                                this.apply_appearance(window, cx);
                                let shortcuts = this.appearance.shortcuts.clone();
                                let _ = this.update_shortcuts(&shortcuts, cx);
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
        request: &Value,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let submitted = self.form.as_ref().is_some_and(|form| {
            form.operation == operation && form.submission.as_ref() == Some(request)
        });
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
                    if !self.requests.iter().any(|(operation, args)| {
                        *operation == "setAppearance" && args.get("shortcuts").is_some()
                    }) {
                        let shortcuts = self.appearance.shortcuts.clone();
                        if let Err(error) = self.update_shortcuts(&shortcuts, cx) {
                            self.error = true;
                            self.message = format!("Cannot apply shortcuts: {error}");
                        }
                    }
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
            if !self.initialized
                || current
                || (submitted && matches!(operation, "saveSession" | "removeSession"))
            {
                let collapsed = self
                    .requests
                    .iter()
                    .any(|(operation, args)| {
                        *operation == "collapseAccountGroup"
                            && args["name"].as_str() == data.session.as_deref()
                    })
                    .then(|| self.data.collapsed_groups.clone());
                self.data = data;
                if let Some(collapsed) = collapsed {
                    self.data.collapsed_groups = collapsed;
                }
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
            if submitted && matches!(operation, "saveSession" | "removeSession") {
                let created = self
                    .form
                    .as_ref()
                    .and_then(|form| form.fields.iter().find(|(key, _)| key == "name"))
                    .map(|(_, input)| input.read(cx).value().to_string());
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
                if submitted {
                    self.form = None;
                    self.focus.focus(window);
                }
                self.message = "Local credentials removed".into();
            }
            if matches!(
                operation,
                "setAccountGroup" | "renameAccountGroup" | "removeAccountGroup"
            ) && submitted
            {
                self.form = None;
                self.focus.focus(window);
            }
            if self.screen == Screen::Accounts && self.account.is_some() {
                self.reselect(cx);
                if matches!(operation, "pinAccount" | "setAccountGroup") {
                    self.scroll_to_selection(gpui::ScrollStrategy::Center, cx);
                }
            } else if let Some(selected) = self.selected {
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
        } else if matches!(operation, "wslStatus" | "setUseWslWorkspace") {
            if let Some(available) = value["available"].as_bool() {
                self.wsl_available = available;
            }
            if let Some(enabled) = value["enabled"].as_bool() {
                self.wsl_enabled = enabled;
            }
            if operation == "setUseWslWorkspace" {
                self.data = Snapshot::default();
                self.initialized = false;
                self.account = None;
                self.selected = None;
                self.pending = None;
                self.preferences.clear();
                self.preference_save = None;
                self.reset_search(window, cx);
                self.receive(
                    "snapshot",
                    value["snapshot"].clone(),
                    &json!({}),
                    window,
                    cx,
                );
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
        self.entries(cx)
            .into_iter()
            .filter_map(|entry| match entry {
                Entry::Account(index) => Some(index),
                Entry::Heading { .. } => None,
            })
            .collect()
    }

    fn entries(&self, cx: &App) -> Vec<Entry> {
        let query = self.search.read(cx).value().to_lowercase();
        let matches = |text: String| {
            let text = text.to_lowercase();
            query.split_whitespace().all(|part| text.contains(part))
        };
        match self.screen {
            Screen::Accounts => sections(
                &self.data.accounts,
                self.data
                    .accounts
                    .iter()
                    .enumerate()
                    .filter(|(_, value)| {
                        matches(format!(
                            "{} {} {} {} {} {}",
                            value.name,
                            value.account_id,
                            value.roles.join(" "),
                            value.region.as_deref().unwrap_or(""),
                            value.last_profile.as_deref().unwrap_or(""),
                            value.group.as_deref().unwrap_or("")
                        ))
                    })
                    .map(|(index, _)| index)
                    .collect(),
                &self.data.collapsed_groups,
                !query.trim().is_empty(),
            ),
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
                .map(|(index, _)| Entry::Account(index))
                .collect(),
            Screen::Settings => vec![],
        }
    }

    fn groups(&self) -> Vec<String> {
        let mut groups: Vec<String> = self
            .data
            .accounts
            .iter()
            .filter_map(|account| account.group.clone())
            .collect();
        groups.sort_by(|a, b| {
            a.to_lowercase()
                .cmp(&b.to_lowercase())
                .then_with(|| a.cmp(b))
        });
        groups.dedup();
        groups
    }

    fn reselect(&mut self, cx: &App) {
        if let Some(account) = &self.account {
            self.selected = self
                .visible(cx)
                .iter()
                .position(|index| self.data.accounts[*index].account_id == account.account_id);
        }
    }

    /// Accounts an account operation applies to: the visible multi-selection when there is
    /// one, otherwise the inspected account.
    fn targets(&self, cx: &App) -> Vec<Account> {
        if self.screen == Screen::Accounts && self.marked.len() > 1 {
            let accounts: Vec<Account> = self
                .visible(cx)
                .into_iter()
                .map(|index| &self.data.accounts[index])
                .filter(|account| self.marked.contains(&account.account_id))
                .cloned()
                .collect();
            if accounts.len() > 1 {
                return accounts;
            }
        }
        self.account.clone().into_iter().collect()
    }

    fn scroll_to_selection(&self, strategy: gpui::ScrollStrategy, cx: &App) {
        let Some(selected) = self.selected else {
            return;
        };
        let entry = self
            .entries(cx)
            .iter()
            .enumerate()
            .filter(|(_, entry)| matches!(entry, Entry::Account(_)))
            .nth(selected)
            .map(|(position, _)| position);
        if let Some(entry) = entry {
            self.scroll.scroll_to_item(entry, strategy);
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

    fn role(&self, _cx: &App) -> Option<String> {
        self.role.clone()
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
        let targets = self.targets(cx);
        if targets.len() > 1 {
            let count = targets.len();
            let current = shared_group(&targets);
            commands.extend([
                (format!("Copy {count} account IDs"), Command::CopyAccount),
                (format!("Copy {count} account names"), Command::CopyName),
                if targets.iter().all(|account| account.pinned) {
                    (
                        format!("Remove {count} accounts from favorites"),
                        Command::Pin(false),
                    )
                } else {
                    (
                        format!("Add {count} accounts to favorites"),
                        Command::Pin(true),
                    )
                },
            ]);
            commands.extend(
                self.groups()
                    .into_iter()
                    .filter(|group| current.as_ref() != Some(&Some(group.clone())))
                    .map(|group| {
                        (
                            format!("Move {count} accounts to {group}"),
                            Command::SetGroup(Some(group)),
                        )
                    }),
            );
            commands.push((
                format!("Move {count} accounts to a new group…"),
                Command::NewGroup,
            ));
            if targets.iter().any(|account| account.group.is_some()) {
                commands.push((
                    format!("Remove {count} accounts from their groups"),
                    Command::SetGroup(None),
                ));
            }
            commands.push(("Clear selection".into(), Command::ClearSelection));
        } else if let Some(account) = &self.account {
            commands.extend([
                ("Copy account ID".into(), Command::CopyAccount),
                ("Copy account name".into(), Command::CopyName),
                (
                    if account.pinned {
                        "Remove account from favorites"
                    } else {
                        "Add account to favorites"
                    }
                    .into(),
                    Command::TogglePin,
                ),
            ]);
            commands.extend(
                self.groups()
                    .into_iter()
                    .filter(|group| account.group.as_ref() != Some(group))
                    .map(|group| {
                        (
                            format!("Move account to {group}"),
                            Command::SetGroup(Some(group)),
                        )
                    }),
            );
            commands.push(("Move account to a new group…".into(), Command::NewGroup));
            if account.group.is_some() {
                commands.push(("Remove account from group".into(), Command::SetGroup(None)));
            }
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
        }
        .or_else(|| account.roles.first().cloned());
        if reset || self.role(cx) != role {
            self.flush_preferences(cx);
        }
        self.role = role.clone();
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
        self.scroll_to_selection(gpui::ScrollStrategy::Center, cx);
        self.focus.focus(window);
        self.inspect(window, cx);
        cx.notify();
    }

    fn reset_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.flush_preferences(cx);
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
                                "group" | "renamed" => "e.g. Production",
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
            submission: None,
            destructive: matches!(
                operation,
                "removeSession"
                    | "signOut"
                    | "clearCredential"
                    | "clearAllCredentials"
                    | "removeAccountGroup"
            ),
            _subscriptions: subscriptions,
        });
        self.error = false;
        cx.notify();
    }

    fn dispatch(&mut self, command: Command, window: &mut Window, cx: &mut Context<Self>) {
        if self
            .active
            .as_ref()
            .is_some_and(|(operation, _)| *operation == "setUseWslWorkspace")
        {
            return;
        }
        let dismissed = self.popup.take().is_some()
            || self.form.is_some()
            || self.palette
            || self.login.is_some()
            || self.recording.is_some();
        if matches!(command, Command::Cancel) {
            if !dismissed {
                self.marked.clear();
            }
            self.recording = None;
            self.shortcut_error = None;
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
        if self.recording.is_some() && !matches!(command, Command::ClearShortcut(_)) {
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
                && matches!(
                    *command,
                    Command::CopyAccount
                        | Command::CopyName
                        | Command::TogglePin
                        | Command::Pin(_)
                        | Command::GroupMenu
                        | Command::SetGroup(_)
                        | Command::NewGroup
                )
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
            Command::RecordShortcut(id) => {
                self.recording = Some(id);
                self.shortcut_error = None;
                self.focus.focus(window);
            }
            Command::ClearShortcut(id) => {
                let mut shortcuts = self.shortcuts.clone();
                shortcuts.insert(id.into(), String::new());
                self.save_shortcuts(shortcuts, window, cx);
            }
            Command::ResetShortcuts => self.save_shortcuts(BTreeMap::new(), window, cx),
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
                    self.role_focus.focus(window);
                }
            }
            Command::SetCredentials => {
                self.flush_preferences(cx);
                if !self.authenticated() {
                    self.error = true;
                    self.message = "Sign in before setting credentials.".into();
                } else if self.account.is_some() && role.is_none() {
                    self.role_focus.focus(window);
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
                            "Region and profile changes must finish saving before setting credentials.".into();
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
                    self.request("wslStatus", json!({}), cx);
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
            Command::RoleMenu => self.show_roles(window, cx),
            Command::SelectRole(role) => {
                if !self
                    .account
                    .as_ref()
                    .is_some_and(|account| account.roles.contains(&role))
                {
                    return;
                }
                self.flush_preferences(cx);
                let value = self
                    .account
                    .as_ref()
                    .and_then(|account| account.profiles.get(&role))
                    .cloned()
                    .unwrap_or_default();
                self.role = Some(role);
                self.profile
                    .update(cx, |input, cx| input.set_value(value, window, cx));
                self.role_focus.focus(window);
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
                    self.role_focus.focus(window);
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
                    if form.submission.is_some() {
                        return;
                    }
                    let operation = form.operation;
                    let mut args = form.args.clone();
                    for (key, input) in &form.fields {
                        let value = input.read(cx).value();
                        args[key] = json!(if key == "startUrl" {
                            sso_start_url(&value)
                        } else if key == "name" {
                            value.to_string()
                        } else {
                            value.trim().to_owned()
                        });
                    }
                    // A bulk form saves each account in turn, and closes once the last one saves.
                    if let Some(Value::Array(ids)) = args
                        .as_object_mut()
                        .and_then(|args| args.remove("accountIds"))
                        && let Some((last, rest)) = ids.split_last()
                    {
                        for id in rest {
                            let mut each = args.clone();
                            each["accountId"] = id.clone();
                            self.request(operation, each, cx);
                        }
                        args["accountId"] = last.clone();
                    }
                    if let Some(form) = &mut self.form {
                        form.submission = Some(args.clone());
                    }
                    self.request(operation, args, cx);
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
            Command::UseWslWorkspace(enabled) => {
                if self.busy
                    || self.modal()
                    || !self.requests.is_empty()
                    || self.preference_save.is_some()
                {
                    return;
                }
                self.request("setUseWslWorkspace", json!({"enabled": enabled}), cx);
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
                let targets = self.targets(cx);
                if targets.len() > 1 {
                    let ids: Vec<&str> = targets
                        .iter()
                        .map(|value| value.account_id.as_str())
                        .collect();
                    cx.write_to_clipboard(ClipboardItem::new_string(ids.join("\n")));
                    self.message = format!("{} account IDs copied", ids.len());
                    return cx.notify();
                }
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
                let targets = self.targets(cx);
                if targets.len() > 1 {
                    let names: Vec<&str> =
                        targets.iter().map(|value| value.name.as_str()).collect();
                    cx.write_to_clipboard(ClipboardItem::new_string(names.join("\n")));
                    self.message = format!("{} account names copied", names.len());
                    return cx.notify();
                }
                let value = self
                    .credential(cx)
                    .map(|value| value.account_name)
                    .or_else(|| self.account.as_ref().map(|value| value.name.clone()));
                if let Some(value) = value {
                    cx.write_to_clipboard(ClipboardItem::new_string(value));
                    self.message = "Account name copied".into();
                }
            }
            Command::TogglePin => {
                let targets = self.targets(cx);
                if !targets.is_empty() {
                    let pinned = !targets.iter().all(|account| account.pinned);
                    self.dispatch(Command::Pin(pinned), window, cx);
                }
            }
            Command::Pin(pinned) => {
                for account in self.targets(cx) {
                    if account.pinned != pinned {
                        self.request(
                            "pinAccount",
                            json!({"name": name, "accountId": account.account_id, "pinned": pinned}),
                            cx,
                        );
                    }
                }
            }
            Command::ClearSelection => self.marked.clear(),
            Command::GroupMenu => {
                let targets = self.targets(cx);
                if targets.is_empty() {
                    return;
                }
                let current = shared_group(&targets).flatten();
                let grouped = targets.iter().any(|account| account.group.is_some());
                let groups = self.groups();
                if groups.is_empty() {
                    self.dispatch(Command::NewGroup, window, cx);
                    return;
                }
                let mut items: Vec<(SharedString, Command, bool)> = groups
                    .into_iter()
                    .map(|group| {
                        let disabled = current.as_ref() == Some(&group);
                        (
                            group.clone().into(),
                            Command::SetGroup(Some(group)),
                            disabled,
                        )
                    })
                    .collect();
                items.push(("New group…".into(), Command::NewGroup, false));
                if grouped {
                    items.push(("Remove from group".into(), Command::SetGroup(None), false));
                }
                cx.defer_in(window, move |this, window, cx| {
                    this.show_menu(items, window, cx)
                });
            }
            Command::NewGroup => {
                let targets = self.targets(cx);
                if targets.len() > 1 {
                    let description = format!(
                        "Move {} accounts into a new group. Groups are kept per organization.",
                        targets.len()
                    );
                    let ids: Vec<&str> = targets
                        .iter()
                        .map(|account| account.account_id.as_str())
                        .collect();
                    self.show_form(
                        "New group",
                        &description,
                        vec![("group", String::new())],
                        "setAccountGroup",
                        json!({"name": name, "accountIds": ids}),
                        window,
                        cx,
                    );
                } else if let Some(account) = &self.account {
                    let description = format!(
                        "Move ‘{}’ into a new group. Groups are kept per organization.",
                        account.name
                    );
                    let args = json!({"name": name, "accountId": account.account_id});
                    self.show_form(
                        "New group",
                        &description,
                        vec![("group", String::new())],
                        "setAccountGroup",
                        args,
                        window,
                        cx,
                    );
                }
            }
            Command::SetGroup(group) => {
                for account in self.targets(cx) {
                    if account.group != group {
                        self.request(
                            "setAccountGroup",
                            json!({"name": name, "accountId": account.account_id, "group": group.clone().unwrap_or_default()}),
                            cx,
                        );
                    }
                }
            }
            Command::ToggleGroup(group) => {
                if name.is_some() {
                    let collapsed = !self.data.collapsed_groups.contains(&group);
                    self.data.collapsed_groups.retain(|value| *value != group);
                    if collapsed {
                        self.data.collapsed_groups.push(group.clone());
                    }
                    self.reselect(cx);
                    self.request(
                        "collapseAccountGroup",
                        json!({"name": name, "group": group, "collapsed": collapsed}),
                        cx,
                    );
                }
            }
            Command::RenameGroup(group) => {
                if name.is_some() {
                    self.show_form(
                        "Rename group",
                        &format!("Rename ‘{group}’ for all of its accounts. Using another group’s name merges the two."),
                        vec![("renamed", group.clone())],
                        "renameAccountGroup",
                        json!({"name": name, "group": group}),
                        window,
                        cx,
                    );
                }
            }
            Command::RemoveGroup(group) => {
                if name.is_some() {
                    let count = self
                        .data
                        .accounts
                        .iter()
                        .filter(|account| account.group.as_ref() == Some(&group))
                        .count();
                    self.show_form(
                        "Remove group?",
                        &format!("Its {count} accounts move to Other accounts. Favorites stay in Favorites."),
                        vec![],
                        "removeAccountGroup",
                        json!({"name": name, "group": group}),
                        window,
                        cx,
                    );
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

fn restored_bounds(state: window_state::WindowState, cx: &App) -> Bounds<Pixels> {
    let mut bounds = state.bounds();
    let minimum = size(px(960.), px(620.));
    if bounds.size.width < minimum.width {
        bounds.size.width = minimum.width;
    }
    if bounds.size.height < minimum.height {
        bounds.size.height = minimum.height;
    }
    let visible = cx.displays().iter().any(|display| {
        let area = display.bounds();
        bounds.origin.x < area.origin.x + area.size.width
            && bounds.origin.x + bounds.size.width > area.origin.x
            && bounds.origin.y < area.origin.y + area.size.height
            && bounds.origin.y + bounds.size.height > area.origin.y
    });
    if visible {
        bounds
    } else {
        Bounds::centered(None, bounds.size, cx)
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
            let saved = window_state::load();
            let bounds = saved
                .map(|state| restored_bounds(state, cx))
                .unwrap_or_else(|| Bounds::centered(None, size(px(1200.), px(780.)), cx));
            let result = cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    window_min_size: Some(size(px(960.), px(620.))),
                    titlebar: Some(platform::titlebar_options()),
                    ..Default::default()
                },
                |window, cx| {
                    platform::configure_window(window);
                    let view = cx.new(|cx| {
                        let mut view = Sesh::new(window, cx);
                        view.request("getAppearance", json!({}), cx);
                        view.request("wslStatus", json!({}), cx);
                        view.request("snapshot", json!({}), cx);
                        view
                    });
                    cx.new(|cx| Root::new(view, window, cx))
                },
            );
            let handle = match result {
                Ok(handle) => handle,
                Err(error) => {
                    platform::fatal(&format!("Cannot open Sesh: {error}"));
                    cx.quit();
                    return;
                }
            };
            handle
                .update(cx, |_, window, _| {
                    window_state::note(window);
                    window_state::persist();
                    if saved.is_some_and(|state| state.maximized) {
                        platform::maximize(window);
                    }
                })
                .ok();
            cx.on_window_closed(|cx| {
                if cx.windows().is_empty() {
                    window_state::persist();
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

    #[gpui::test]
    fn completed_save_does_not_close_a_replacement_form(cx: &mut gpui::TestAppContext) {
        use super::*;
        cx.update(gpui_component::init);
        let mut view = None;
        let (_, cx) = cx.add_window_view(|window, cx| {
            let state = cx.new(|cx| {
                let mut state = Sesh::new(window, cx);
                state.busy = true;
                state.initialized = true;
                state.appearance.mode = "dark".into();
                state
            });
            view = Some(state.clone());
            Root::new(state, window, cx)
        });
        let view = view.unwrap();
        cx.update(|window, cx| {
            view.update(cx, |view, cx| {
                view.dispatch(Command::NewSession, window, cx)
            })
        });
        cx.simulate_input("First session");
        cx.simulate_keystrokes("enter enter");
        view.read_with(cx, |view, _| assert_eq!(view.requests.len(), 1));
        let request = view.read_with(cx, |view, _| view.requests[0].1.clone());
        cx.update(|window, cx| {
            view.update(cx, |view, cx| {
                view.dispatch(Command::Cancel, window, cx);
                view.dispatch(Command::NewSession, window, cx);
            })
        });
        cx.simulate_input("Replacement draft");
        cx.update(|window, cx| view.update(cx, |view, cx| view.receive("saveSession", json!({
            "sessions": [{"name":"First session","startUrl":"https://example.awsapps.com/start","ssoRegion":"eu-north-1","defaultRegion":"eu-north-1","authenticated":false}],
            "accounts": [], "credentials": [], "collapsedGroups": []
        }), &request, window, cx)));
        view.read_with(cx, |view, cx| {
            let form = view
                .form
                .as_ref()
                .expect("The replacement form must remain open");
            assert_eq!(
                form.fields[0].1.read(cx).value().as_str(),
                "Replacement draft"
            );
        });
        cx.simulate_keystrokes("enter enter");
        let request = view.read_with(cx, |view, _| {
            assert_eq!(view.requests.len(), 2);
            view.requests[1].1.clone()
        });
        cx.update(|window, cx| view.update(cx, |view, cx| view.receive("saveSession", json!({
            "sessions": [{"name":"Replacement draft","startUrl":"https://example.awsapps.com/start","ssoRegion":"eu-north-1","defaultRegion":"eu-north-1","authenticated":false}],
            "accounts": [], "credentials": [], "collapsedGroups": []
        }), &request, window, cx)));
        view.read_with(cx, |view, _| {
            assert!(view.form.is_none());
            assert_eq!(view.data.session.as_deref(), Some("Replacement draft"));
        });
        cx.dispatch_action(Search);
        cx.simulate_input("missing account");
        cx.simulate_keystrokes("enter enter");
        view.read_with(cx, |view, cx| {
            assert_eq!(view.search.read(cx).value().as_str(), "missing account");
            assert!(view.account.is_none());
        });
    }

    /// An account list rendered as Favorites (account-0), Prod (account-1), then Other accounts
    /// (account-2 and account-3), with requests queued rather than sent to the SDK.
    fn account_list(
        cx: &mut gpui::TestAppContext,
    ) -> (gpui::Entity<super::Sesh>, &mut gpui::VisualTestContext) {
        use super::*;
        cx.update(gpui_component::init);
        let mut view = None;
        let (_, cx) = cx.add_window_view(|window, cx| {
            let state = cx.new(|cx| {
                let mut state = Sesh::new(window, cx);
                state.busy = true;
                state.initialized = true;
                state.appearance.mode = "dark".into();
                state.data = serde_json::from_value(json!({
                    "sessions": [{"name":"Org","startUrl":"https://example.awsapps.com/start","ssoRegion":"eu-north-1","defaultRegion":"eu-north-1","authenticated":true}],
                    "session": "Org",
                    "accounts": [
                        {"accountId":"1","name":"Favorite","roles":[],"rolesLoaded":false,"profiles":{},"pinned":true,"group":null},
                        {"accountId":"2","name":"Grouped","roles":[],"rolesLoaded":false,"profiles":{},"pinned":false,"group":"Prod"},
                        {"accountId":"3","name":"Loose","roles":[],"rolesLoaded":false,"profiles":{},"pinned":false,"group":null},
                        {"accountId":"4","name":"Other","roles":[],"rolesLoaded":false,"profiles":{},"pinned":false,"group":null}
                    ],
                    "collapsedGroups": [], "credentials": []
                }))
                .unwrap();
                state
            });
            view = Some(state.clone());
            Root::new(state, window, cx)
        });
        cx.run_until_parked();
        (view.unwrap(), cx)
    }

    fn drag(cx: &mut gpui::VisualTestContext, from: &'static str, to: &'static str) {
        use gpui::{Modifiers, MouseButton, px};
        let from = cx.debug_bounds(from).expect(from).center();
        let to = cx.debug_bounds(to).expect(to).center();
        let none = Modifiers::none();
        cx.simulate_mouse_down(from, MouseButton::Left, none);
        cx.simulate_mouse_move(from + gpui::point(px(0.), px(8.)), MouseButton::Left, none);
        cx.simulate_mouse_move(to, MouseButton::Left, none);
        cx.simulate_mouse_up(to, MouseButton::Left, none);
        cx.run_until_parked();
    }

    /// Takes the queued group and favorite changes, without the session name.
    fn account_moves(
        view: &gpui::Entity<super::Sesh>,
        cx: &mut gpui::VisualTestContext,
    ) -> Vec<(&'static str, serde_json::Value)> {
        view.update(cx, |view, _| {
            let moves = view
                .requests
                .iter()
                .filter(|(operation, _)| matches!(*operation, "setAccountGroup" | "pinAccount"))
                .map(|(operation, args)| {
                    let mut args = args.clone();
                    args.as_object_mut().unwrap().remove("name");
                    (*operation, args)
                })
                .collect();
            view.requests.clear();
            moves
        })
    }

    #[gpui::test]
    fn dragging_accounts_moves_them_between_sections(cx: &mut gpui::TestAppContext) {
        use super::*;
        use gpui::{Modifiers, MouseButton};
        let (view, cx) = account_list(cx);
        let moves = |cx: &mut gpui::VisualTestContext| account_moves(&view, cx);

        drag(cx, "account-2", "section-Prod");
        assert_eq!(
            moves(cx),
            [("setAccountGroup", json!({"accountId":"3","group":"Prod"}))],
            "Dropping on a group heading moves the account into it"
        );

        drag(cx, "account-1", "account-3");
        assert_eq!(
            moves(cx),
            [("setAccountGroup", json!({"accountId":"2","group":""}))],
            "Dropping on another section's account moves the account there"
        );

        drag(cx, "account-0", "account-3");
        assert_eq!(
            moves(cx),
            [("pinAccount", json!({"accountId":"1","pinned":false}))],
            "Leaving Favorites unpins the account"
        );

        drag(cx, "account-3", "section-Favorites");
        assert_eq!(
            moves(cx),
            [("pinAccount", json!({"accountId":"4","pinned":true}))],
            "Dropping on Favorites pins the account"
        );

        drag(cx, "account-2", "account-3");
        assert!(
            moves(cx).is_empty(),
            "Dropping within a section does nothing"
        );

        // Mid-drag, the row lifts out as a same-sized copy and leaves a faded placeholder.
        let row = cx.debug_bounds("account-2").unwrap();
        let none = Modifiers::none();
        cx.simulate_mouse_down(row.center(), MouseButton::Left, none);
        cx.simulate_mouse_move(
            row.center() + gpui::point(px(0.), px(8.)),
            MouseButton::Left,
            none,
        );
        cx.simulate_mouse_move(
            row.center() + gpui::point(px(0.), px(48.)),
            MouseButton::Left,
            none,
        );
        cx.run_until_parked();
        let preview = cx.debug_bounds("account-drag").expect("drag preview");
        assert_eq!(preview.size, row.size);
        assert_eq!(preview.origin, row.origin + gpui::point(px(0.), px(40.)));
        view.read_with(cx, |view, _| {
            assert_eq!(view.dragging, ["3"]);
            assert_eq!(
                view.drop_section, None,
                "A row's own section is not a target"
            );
        });
        // Hovering any part of another section outlines it, heading and rows alike.
        for (item, section) in [("section-Prod", Some("Prod")), ("account-0", None)] {
            let point = cx.debug_bounds(item).unwrap().center();
            cx.simulate_mouse_move(point, MouseButton::Left, none);
            cx.run_until_parked();
            view.read_with(cx, |view, _| {
                assert_eq!(
                    view.drop_section,
                    Some(section.map(str::to_owned)),
                    "{item}"
                )
            });
        }
        cx.simulate_mouse_move(row.center(), MouseButton::Left, none);
        cx.run_until_parked();
        view.read_with(cx, |view, _| assert_eq!(view.drop_section, None));
        cx.simulate_mouse_up(row.center(), MouseButton::Left, none);
        cx.run_until_parked();
        assert!(
            moves(cx).is_empty(),
            "Dropping a row back in place does nothing"
        );

        let row = cx.debug_bounds("account-3").unwrap().center();
        cx.simulate_click(row, Modifiers::none());
        cx.run_until_parked();
        view.read_with(cx, |view, _| assert_eq!(view.selected, Some(3)));
        assert!(moves(cx).is_empty(), "Clicking an account does not move it");
    }

    #[gpui::test]
    fn selected_accounts_are_moved_together(cx: &mut gpui::TestAppContext) {
        use super::*;
        use gpui::Modifiers;
        let (view, cx) = account_list(cx);
        let moves = |cx: &mut gpui::VisualTestContext| account_moves(&view, cx);
        let click = |cx: &mut gpui::VisualTestContext, row: &'static str, modifiers: Modifiers| {
            let point = cx.debug_bounds(row).expect(row).center();
            cx.simulate_click(point, modifiers);
            cx.run_until_parked();
        };
        let selection = |cx: &mut gpui::VisualTestContext| {
            view.update(cx, |view, cx| {
                view.targets(cx)
                    .into_iter()
                    .map(|account| account.account_id)
                    .collect::<Vec<_>>()
            })
        };
        let run = |cx: &mut gpui::VisualTestContext, command: Command| {
            cx.update(|window, cx| view.update(cx, |view, cx| view.dispatch(command, window, cx)));
            cx.run_until_parked();
        };

        click(cx, "account-2", Modifiers::none());
        click(cx, "account-3", Modifiers::secondary_key());
        assert_eq!(selection(cx), ["3", "4"], "⌘-click adds to the clicked row");
        assert!(
            cx.debug_bounds("bulk-inspector").is_some(),
            "The inspector offers bulk actions"
        );

        run(cx, Command::SetGroup(Some("Prod".into())));
        assert_eq!(
            moves(cx),
            [
                ("setAccountGroup", json!({"accountId":"3","group":"Prod"})),
                ("setAccountGroup", json!({"accountId":"4","group":"Prod"})),
            ]
        );

        drag(cx, "account-3", "section-Favorites");
        assert_eq!(
            moves(cx),
            [
                ("pinAccount", json!({"accountId":"3","pinned":true})),
                ("pinAccount", json!({"accountId":"4","pinned":true})),
            ],
            "Dragging a selected row moves the whole selection"
        );

        click(cx, "account-0", Modifiers::none());
        assert_eq!(selection(cx), ["1"], "A plain click clears the selection");
        click(cx, "account-3", Modifiers::shift());
        assert_eq!(
            selection(cx),
            ["1", "2", "3", "4"],
            "Shift-click selects a range"
        );

        // Leaving Favorites unpins only the favorite; accounts already ungrouped stay put.
        run(cx, Command::SetGroup(None));
        assert_eq!(
            moves(cx),
            [("setAccountGroup", json!({"accountId":"2","group":""}))]
        );
        run(cx, Command::Pin(false));
        assert_eq!(
            moves(cx),
            [("pinAccount", json!({"accountId":"1","pinned":false}))]
        );

        run(cx, Command::NewGroup);
        cx.simulate_input("Dev");
        run(cx, Command::Confirm);
        assert_eq!(
            moves(cx),
            ["1", "2", "3", "4"]
                .map(|id| ("setAccountGroup", json!({"accountId":id,"group":"Dev"}))),
            "A new group saves every selected account"
        );
        view.read_with(cx, |view, _| {
            assert_eq!(
                view.form.as_ref().and_then(|form| form.submission.as_ref()),
                Some(&json!({"name":"Org","accountId":"4","group":"Dev"})),
                "The form closes once the last account saves"
            )
        });

        run(cx, Command::Cancel);
        assert_eq!(selection(cx).len(), 4, "Escape closes the form first");
        run(cx, Command::Cancel);
        assert_eq!(selection(cx).len(), 1, "Escape then clears the selection");

        click(cx, "account-1", Modifiers::secondary_key());
        click(cx, "account-1", Modifiers::secondary_key());
        assert_eq!(selection(cx), ["1"], "⌘-click toggles an account back out");
        view.read_with(cx, |view, _| assert_eq!(view.selected, Some(0)));

        drag(cx, "account-2", "section-Prod");
        assert_eq!(
            moves(cx),
            [("setAccountGroup", json!({"accountId":"3","group":"Prod"}))],
            "Dragging an unselected row moves only that row"
        );
    }

    #[test]
    fn validates_shortcut_overrides_and_replaces_bindings() -> anyhow::Result<()> {
        use crate::{Search, platform};
        use gpui::{KeyBinding, Keymap, Keystroke};
        use std::collections::BTreeMap;

        let fixed = [KeyBinding::new(&platform::shortcut("q"), crate::Quit, None)];
        let selection = |id: &str, key: &str| BTreeMap::from([(id.to_owned(), key.to_owned())]);
        let command = if cfg!(target_os = "macos") {
            "cmd"
        } else {
            "ctrl"
        };
        let alt_command_f = format!("{command}-alt-f");
        let alt_command_f_normalized = Keystroke::parse(&alt_command_f)?.unparse();
        for (id, key) in [
            ("unknown", "alt-f"),
            ("search", "a"),
            ("search", "cmd"),
            ("search", "cmd-invalid"),
            ("search", "cmd-\0"),
            ("search", "cmd-f cmd-k"),
        ] {
            assert!(platform::validate_shortcuts(&selection(id, key), &fixed).is_err());
        }
        assert!(
            platform::validate_shortcuts(&selection("search", &platform::shortcut("q")), &fixed)
                .is_err()
        );
        assert!(
            platform::validate_shortcuts(&selection("search", &platform::shortcut("r")), &fixed)
                .is_err()
        );
        assert!(
            platform::validate_shortcuts(&selection("search", &platform::shortcut("f")), &fixed)?
                .is_empty()
        );
        let overrides = platform::validate_shortcuts(&selection("search", &alt_command_f), &fixed)?;
        assert_eq!(overrides["search"], alt_command_f_normalized);
        assert_eq!(
            platform::shortcut_label("search", &overrides),
            gpui_component::kbd::Kbd::format(&Keystroke::parse(&alt_command_f_normalized)?)
        );
        let keymap = Keymap::new(platform::shortcut_bindings(&overrides)?);
        let actions: [(&dyn gpui::Action, &str); 2] =
            [(&crate::ToggleSidebar, "b"), (&crate::Console, "o")];
        for (action, key) in actions {
            assert_eq!(
                keymap
                    .bindings_for_action(action)
                    .next()
                    .map(|binding| binding.keystrokes()[0].inner().unparse()),
                Some(platform::shortcut(key))
            );
        }
        assert_eq!(
            keymap
                .bindings_for_action(&crate::Palette)
                .next()
                .map(|binding| binding.keystrokes()[0].inner().unparse()),
            Some(platform::shortcut("k"))
        );
        assert!(
            keymap
                .all_bindings_for_input(&[Keystroke::parse(&platform::shortcut("f"))?])
                .is_empty()
        );
        assert_eq!(keymap.bindings_for_action(&Search).count(), 1);
        assert_eq!(
            keymap
                .all_bindings_for_input(&[Keystroke::parse(&alt_command_f_normalized)?])
                .len(),
            1
        );
        let disabled = selection("search", "");
        assert!(
            Keymap::new(platform::shortcut_bindings(&disabled)?)
                .bindings_for_action(&Search)
                .next()
                .is_none()
        );
        assert_eq!(platform::shortcut_label("search", &disabled), "Unassigned");
        assert!(platform::validate_shortcuts(&selection("search", "f8"), &fixed).is_ok());
        Ok(())
    }

    #[test]
    fn filters_dropdown_options_with_prefix_matches_and_actions() {
        use crate::select::{SelectOption, filter_options};

        let mut action = SelectOption::new("new".into(), "New group…".into());
        action.action = true;
        let options = vec![
            SelectOption::new("read".into(), "ReadOnlyAdmin".into()),
            SelectOption::new("write".into(), "Writer".into()),
            SelectOption::new("admin".into(), "Administrator".into()),
            action,
        ];
        assert_eq!(filter_options(&options, " ADMIN "), vec![2, 0, 3]);
        assert_eq!(filter_options(&options, "missing"), vec![3]);
        assert_eq!(filter_options(&options, ""), vec![0, 1, 2, 3]);
        assert!(filter_options(&[], "admin").is_empty());
    }

    #[test]
    fn arranges_pinned_grouped_and_remaining_accounts() {
        use crate::{Entry, sdk::Account, sections};

        let account = |name: &str, pinned: bool, group: Option<&str>| Account {
            name: name.into(),
            pinned,
            group: group.map(Into::into),
            ..Default::default()
        };
        let heading = |group: Option<&str>, count, collapsed| Entry::Heading {
            group: group.map(Into::into),
            count,
            collapsed,
        };
        let flat = [account("a", false, None), account("b", false, None)];
        assert_eq!(
            sections(&flat, vec![1], &[], false),
            vec![Entry::Account(1)]
        );

        let accounts = [
            account("api prod", true, Some("prod")),
            account("billing", false, None),
            account("data dev", false, Some("dev")),
            account("data prod", false, Some("prod")),
            account("sandbox", false, None),
            account("web prod", false, Some("Prod")),
        ];
        let all: Vec<_> = (0..accounts.len()).collect();
        assert_eq!(
            sections(&accounts, all.clone(), &[], false),
            vec![
                heading(None, 1, false),
                Entry::Account(0),
                heading(Some("dev"), 1, false),
                Entry::Account(2),
                heading(Some("Prod"), 1, false),
                Entry::Account(5),
                heading(Some("prod"), 1, false),
                Entry::Account(3),
                heading(Some(""), 2, false),
                Entry::Account(1),
                Entry::Account(4),
            ]
        );

        let collapsed = ["dev".to_owned(), String::new()];
        assert_eq!(
            sections(&accounts, vec![0, 1, 2], &collapsed, false),
            vec![
                heading(None, 1, false),
                Entry::Account(0),
                heading(Some("dev"), 1, true),
                heading(Some(""), 1, true),
            ]
        );
        assert_eq!(
            sections(&accounts, vec![2, 4], &collapsed, true),
            vec![
                heading(Some("dev"), 1, false),
                Entry::Account(2),
                heading(Some(""), 1, false),
                Entry::Account(4),
            ]
        );
    }

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
