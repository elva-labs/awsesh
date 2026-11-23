#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod platform;
mod sdk;
mod select;
mod theme;
mod ui;
mod window_state;

use rune::{App, AppSpec, Key, KeyEvent, TextEdit, Tx, Waker};
use rune_kit::{ComboboxState, ShortcutRecorderState};
use sdk::{Account, Credential, Snapshot};
use serde_json::{Value, json};
use std::cell::{OnceCell, Ref, RefCell};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::Duration;

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
    RemoveSelectedCredentials,
    Palette,
    Appearance(String),
    Theme(String),
    OpenThemeDirectory,
    Translucency(f32),
    Dithering(bool),
    ToggleSidebar,
    SidebarWidth(f32),
    CompactAccounts(bool),
    UseWslWorkspace(bool),
    ClearShortcut(&'static str),
    ResetShortcuts,
    Confirm,
    Cancel,
    Login,
    OpenLogin,
    CopyLoginLink,
    CopyAccount,
    CopyText(String),
    CopyProfile,
    CopyName,
    TogglePin,
    Pin(bool),
    ClearSelection,
    NewGroup,
    SetGroup(Option<String>),
    ToggleGroup(String),
    RenameGroup(String),
    RemoveGroup(String),
    SessionAction(String, Box<Command>),
    ItemAction(usize, Box<Command>),
    AccountAction(String, Box<Command>),
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
            std::iter::once(heading).chain(
                if collapsed { vec![] } else { members }
                    .into_iter()
                    .map(Entry::Account),
            )
        })
        .collect()
}

fn shared_group(accounts: &[&Account]) -> Option<Option<String>> {
    let (first, rest) = accounts.split_first()?;
    rest.iter()
        .all(|account| account.group == first.group)
        .then(|| first.group.clone())
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

struct Form {
    id: u64,
    title: String,
    description: String,
    fields: Vec<(String, TextEdit)>,
    operation: &'static str,
    args: Value,
    submission: Option<u64>,
    destructive: bool,
}

struct Login {
    name: String,
    url: String,
    code: String,
    link_copied: bool,
}

#[derive(Clone)]
struct Request {
    id: u64,
    operation: &'static str,
    args: Value,
    form: Option<u64>,
}

struct Response {
    request: Request,
    result: Result<Value, String>,
}

struct PendingPreference {
    args: Value,
    due: f64,
}

#[derive(Clone)]
struct ContextMenu {
    point: rune::PointerPress,
    items: Vec<(String, Command)>,
}

struct AccountDrag {
    ids: Vec<String>,
    label: String,
    rect: [f32; 4],
    pointer: [f32; 2],
    target: Option<Option<String>>,
    active: bool,
    marked: BTreeSet<String>,
    selected: Option<String>,
    origin: [f32; 2],
}

#[derive(Default)]
struct DataIndex {
    account_search: Vec<String>,
    credential_search: Vec<String>,
    groups: Vec<String>,
}

struct ListProjection {
    valid: bool,
    screen: Screen,
    query: String,
    entries: Vec<Entry>,
    visible: Vec<usize>,
}

impl Default for ListProjection {
    fn default() -> Self {
        Self {
            valid: false,
            screen: Screen::Accounts,
            query: String::new(),
            entries: vec![],
            visible: vec![],
        }
    }
}

struct Sesh {
    data: Snapshot,
    index: DataIndex,
    list: RefCell<ListProjection>,
    initialized: bool,
    screen: Screen,
    appearance: theme::Appearance,
    selected: Option<usize>,
    marked: BTreeSet<String>,
    marked_credentials: BTreeSet<String>,
    account: Option<Account>,
    search: TextEdit,
    region: TextEdit,
    profile: TextEdit,
    inactive_edit: TextEdit,
    role: Option<String>,
    roles: ComboboxState,
    themes: ComboboxState,
    groups: ComboboxState,
    palette: bool,
    command_search: TextEdit,
    command_selected: usize,
    form: Option<Form>,
    login: Option<Login>,
    context_menu: Option<ContextMenu>,
    bulk_copy_notice: Option<(String, f64)>,
    dragging: Option<AccountDrag>,
    suppress_account_press: bool,
    section_bounds: BTreeMap<String, [f32; 4]>,
    pending: Option<(String, String, Command)>,
    message: String,
    error: bool,
    active: Option<Request>,
    requests: VecDeque<Request>,
    sender: Option<Sender<Request>>,
    receiver: Option<Receiver<Response>>,
    sequence: u64,
    preferences: BTreeMap<&'static str, PendingPreference>,
    appearance_pending: BTreeMap<String, Value>,
    appearance_due: Option<f64>,
    recorders: BTreeMap<&'static str, ShortcutRecorderState>,
    wsl_available: bool,
    wsl_enabled: bool,
    clock: f64,
    refresh_due: f64,
    window: Option<rune::WindowHandle>,
    application: Option<rune::AppHandle<Sesh>>,
    geometry_due: f64,
    preview: bool,
    texture: OnceCell<rune::Pixels>,
}

impl Default for Sesh {
    fn default() -> Self {
        Self {
            data: Snapshot::default(),
            index: DataIndex::default(),
            list: RefCell::new(ListProjection::default()),
            initialized: false,
            screen: Screen::Accounts,
            appearance: theme::Appearance::default(),
            selected: None,
            marked: BTreeSet::new(),
            marked_credentials: BTreeSet::new(),
            account: None,
            search: TextEdit::new(""),
            region: TextEdit::new(""),
            profile: TextEdit::new(""),
            inactive_edit: TextEdit::new(""),
            role: None,
            roles: ComboboxState::default(),
            themes: ComboboxState::default(),
            groups: ComboboxState::default(),
            palette: false,
            command_search: TextEdit::new(""),
            command_selected: 0,
            form: None,
            login: None,
            context_menu: None,
            bulk_copy_notice: None,
            dragging: None,
            suppress_account_press: false,
            section_bounds: BTreeMap::new(),
            pending: None,
            message: String::new(),
            error: false,
            active: None,
            requests: VecDeque::new(),
            sender: None,
            receiver: None,
            sequence: 0,
            preferences: BTreeMap::new(),
            appearance_pending: BTreeMap::new(),
            appearance_due: None,
            recorders: platform::shortcuts()
                .into_iter()
                .map(|definition| (definition.id, ShortcutRecorderState::default()))
                .collect(),
            wsl_available: false,
            wsl_enabled: false,
            clock: 0.,
            refresh_due: 30.,
            window: None,
            application: None,
            geometry_due: 0.,
            preview: false,
            texture: OnceCell::new(),
        }
    }
}

impl Sesh {
    fn next_id(&mut self) -> u64 {
        self.sequence += 1;
        self.sequence
    }

    fn authenticated(&self) -> bool {
        self.data.sessions.iter().any(|session| {
            Some(&session.name) == self.data.session.as_ref() && session.authenticated
        })
    }

    fn busy(&self) -> bool {
        self.active.is_some() || !self.requests.is_empty()
    }

    fn roles_loading(&self, account_id: &str) -> bool {
        self.active.iter().chain(&self.requests).any(|request| {
            request.operation == "loadRoles"
                && request.args["name"].as_str() == self.data.session.as_deref()
                && request.args["accountId"].as_str() == Some(account_id)
        })
    }

    fn modal(&self) -> bool {
        self.form.is_some()
            || self.login.is_some()
            || self.palette
            || self
                .recorders
                .values()
                .any(ShortcutRecorderState::is_recording)
    }

    fn request(&mut self, operation: &'static str, args: Value) {
        self.request_for_form(operation, args, None);
    }

    fn request_for_form(&mut self, operation: &'static str, args: Value, form: Option<u64>) -> u64 {
        if form.is_none()
            && matches!(operation, "snapshot" | "selectSession" | "loadRoles")
            && let Some(request) = self
                .requests
                .iter()
                .rev()
                .chain(self.active.iter())
                .find(|request| request.operation == operation && request.args == args)
        {
            return request.id;
        }
        let id = self.next_id();
        self.requests.push_back(Request {
            id,
            operation,
            args,
            form,
        });
        self.start_request();
        id
    }

    fn start_request(&mut self) {
        if self.active.is_some() {
            return;
        }
        let Some(sender) = &self.sender else { return };
        let Some(request) = self.requests.pop_front() else {
            return;
        };
        if sender.send(request.clone()).is_err() {
            self.error = true;
            self.message = "SDK worker stopped. Restart Sesh.".into();
            return;
        }
        if !matches!(
            request.operation,
            "snapshot" | "getAppearance" | "wslStatus" | "pollLogin"
        ) {
            self.error = false;
            self.message = match request.operation {
                "assumeRole" => "Setting credentials…",
                "selectSession" => "Loading accounts…",
                "loadRoles" => "Loading roles…",
                _ => "Saving…",
            }
            .into();
        }
        self.active = Some(request);
    }

    fn receive(&mut self, response: Response, tx: &mut Tx) {
        let request = response.request;
        self.active = None;
        let submitted = self.form.as_ref().is_some_and(|form| {
            Some(form.id) == request.form && form.submission == Some(request.id)
        });
        let value = match response.result {
            Ok(value) => value,
            Err(error) => {
                if let Some(id) = request.form {
                    self.requests.retain(|pending| pending.form != Some(id));
                }
                if let Some(form) = &mut self.form
                    && Some(form.id) == request.form
                {
                    form.submission = None;
                }
                if matches!(request.operation, "startLogin" | "pollLogin")
                    && self.login.as_ref().is_some_and(|login| {
                        Some(login.name.as_str()) == request.args["name"].as_str()
                    })
                {
                    self.login = None;
                }
                self.pending = None;
                self.error = true;
                self.message = error;
                if request.operation == "setAppearance" {
                    self.request("getAppearance", json!({}));
                }
                self.start_request();
                return;
            }
        };
        if !matches!(
            request.operation,
            "snapshot" | "getAppearance" | "wslStatus" | "pollLogin"
        ) {
            self.error = false;
            self.message.clear();
        }
        if request.operation == "clearCredential"
            && let Some(form) = &mut self.form
            && Some(form.id) == request.form
            && let Some(credentials) = form.args["credentials"].as_array_mut()
        {
            credentials.retain(|credential| *credential != request.args);
        }
        match request.operation {
            "getAppearance" | "setAppearance" => {
                match serde_json::from_value::<theme::Appearance>(value) {
                    Ok(mut appearance) => {
                        let mut pending = self.appearance_pending.clone();
                        for request in &self.requests {
                            if request.operation == "setAppearance"
                                && let Some(values) = request.args.as_object()
                            {
                                pending.extend(
                                    values
                                        .iter()
                                        .map(|(key, value)| (key.clone(), value.clone())),
                                );
                            }
                        }
                        if pending.contains_key("sidebarVisible") {
                            appearance.sidebar_visible = self.appearance.sidebar_visible;
                        }
                        if pending.contains_key("sidebarWidth") {
                            appearance.sidebar_width = self.appearance.sidebar_width;
                        }
                        if pending.contains_key("compactAccounts") {
                            appearance.compact_accounts = self.appearance.compact_accounts;
                        }
                        if pending.contains_key("translucency") {
                            appearance.translucency = self.appearance.translucency;
                        }
                        if pending.contains_key("dithering") {
                            appearance.dithering = self.appearance.dithering;
                        }
                        if pending.contains_key("shortcuts") {
                            appearance.shortcuts = self.appearance.shortcuts.clone();
                        }
                        match platform::validate_shortcuts(&appearance.shortcuts) {
                            Ok(shortcuts) => appearance.shortcuts = shortcuts,
                            Err(error) => {
                                self.error = true;
                                self.message = format!("Cannot apply shortcuts: {error}");
                                appearance.shortcuts.clear();
                            }
                        }
                        if !appearance.warnings.is_empty() {
                            self.error = true;
                            self.message = appearance.warnings.join(" · ");
                        }
                        self.appearance = appearance;
                        self.sync_recorders();
                    }
                    Err(error) => {
                        self.error = true;
                        self.message = format!("Invalid appearance: {error}");
                    }
                }
            }
            "consoleUrl" => {
                if let Some(url) = value.as_str() {
                    self.open_url(url, tx);
                }
            }
            "openThemeDirectory" => {
                if let Some(path) = value.as_str()
                    && let Err(error) = platform::reveal_directory(path)
                {
                    self.error = true;
                    self.message = error.to_string();
                }
            }
            "wslStatus" | "setUseWslWorkspace" => {
                if let Some(available) = value["available"].as_bool() {
                    self.wsl_available = available;
                }
                if let Some(enabled) = value["enabled"].as_bool() {
                    self.wsl_enabled = enabled;
                }
                if request.operation == "setUseWslWorkspace" {
                    self.data = Snapshot::default();
                    self.initialized = false;
                    self.reset_search(tx);
                    self.account = None;
                    self.apply_snapshot(value["snapshot"].clone(), &request, tx);
                }
            }
            "startLogin" => {
                if let Some(login) = &mut self.login
                    && Some(login.name.as_str()) == request.args["name"].as_str()
                {
                    if let (Some(url), Some(code)) = (value["url"].as_str(), value["code"].as_str())
                    {
                        login.url = url.to_owned();
                        login.code = code.to_owned();
                        let (name, url) = (login.name.clone(), login.url.clone());
                        if !url.is_empty() {
                            self.open_url(&url, tx);
                        }
                        self.request("pollLogin", json!({"name": name}));
                    } else {
                        let name = login.name.clone();
                        self.login = None;
                        self.request("cancelLogin", json!({"name": name}));
                    }
                }
            }
            "pollLogin" => {
                if let Some(login) = &self.login
                    && Some(login.name.as_str()) == request.args["name"].as_str()
                {
                    let name = login.name.clone();
                    if value["complete"].as_bool() == Some(true) {
                        self.login = None;
                        self.request("selectSession", json!({"name": name, "refresh": true}));
                    } else {
                        self.request("pollLogin", json!({"name": name}));
                    }
                }
            }
            _ => {
                if value.get("sessions").is_some() {
                    self.apply_snapshot(value, &request, tx);
                }
            }
        }
        if submitted && request.operation != "startLogin" {
            let created = self.form.as_ref().and_then(|form| {
                form.fields
                    .iter()
                    .find(|(key, _)| key == "name")
                    .map(|(_, edit)| edit.text.to_owned())
            });
            self.form = None;
            tx.focus("account-list", false);
            if request.operation == "saveSession" {
                if let Some(name) = created {
                    self.open_session(name, tx);
                }
            } else if request.operation == "removeSession" {
                if let Some(name) = self
                    .data
                    .sessions
                    .first()
                    .map(|session| session.name.clone())
                {
                    self.open_session(name, tx);
                } else {
                    self.account = None;
                    self.data.session = None;
                    self.data.accounts.clear();
                    self.rebuild_index();
                }
            }
        }
        if request.operation == "assumeRole" {
            self.message = "Credentials set".into();
        }
        if matches!(
            request.operation,
            "clearCredential" | "clearAllCredentials" | "signOut"
        ) {
            self.message = "Local credentials removed".into();
        }
        self.start_request();
    }

    fn apply_snapshot(&mut self, value: Value, request: &Request, tx: &mut Tx) {
        let selected_credential = self.credential().map(Self::credential_key);
        let data = match serde_json::from_value::<Snapshot>(value) {
            Ok(data) => data,
            Err(error) => {
                self.error = true;
                self.message = format!("Invalid SDK state: {error}");
                return;
            }
        };
        let current = data.session == self.data.session;
        let submitted = self.form.as_ref().is_some_and(|form| {
            Some(form.id) == request.form && form.submission == Some(request.id)
        });
        if !self.initialized
            || current
            || (submitted && matches!(request.operation, "saveSession" | "removeSession"))
        {
            let collapsed = self
                .requests
                .iter()
                .any(|r| {
                    r.operation == "collapseAccountGroup"
                        && r.args["name"].as_str() == data.session.as_deref()
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
        self.rebuild_index();
        if self.screen == Screen::Credentials {
            let keys: BTreeSet<_> = self
                .data
                .credentials
                .iter()
                .map(Self::credential_key)
                .collect();
            self.marked_credentials.retain(|key| keys.contains(key));
            let selected = self.visible().iter().position(|index| {
                selected_credential
                    .as_ref()
                    .is_some_and(|key| *key == Self::credential_key(&self.data.credentials[*index]))
            });
            self.selected = selected;
        }
        if !self.initialized {
            self.initialized = true;
            let name = self
                .data
                .last_session
                .clone()
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
            if let Some(name) = name {
                self.open_session(name, tx);
            }
            return;
        }
        if current {
            if let Some(previous) = &self.account {
                let updated = self
                    .data
                    .accounts
                    .iter()
                    .find(|a| a.account_id == previous.account_id)
                    .cloned();
                if let Some(account) = updated {
                    self.sync_inspector(account, false);
                } else {
                    self.account = None;
                    self.selected = None;
                    self.marked.clear();
                }
            } else if request.operation == "selectSession"
                && self.screen == Screen::Accounts
                && self.search.text.is_empty()
            {
                self.selected = self
                    .data
                    .last_account
                    .as_ref()
                    .and_then(|id| {
                        self.visible()
                            .iter()
                            .position(|index| self.data.accounts[*index].account_id == *id)
                    })
                    .or_else(|| (!self.visible().is_empty()).then_some(0));
                self.inspect();
            }
            if let Some(account) = &self.account {
                let selected = self
                    .visible()
                    .iter()
                    .position(|index| self.data.accounts[*index].account_id == account.account_id);
                self.selected = selected;
            }
            if self.pending.as_ref().is_some_and(|(name, id, _)| {
                self.data.session.as_ref() == Some(name)
                    && self
                        .account
                        .as_ref()
                        .is_some_and(|a| a.account_id == *id && a.roles_loaded)
            }) && let Some((_, _, command)) = self.pending.take()
            {
                self.dispatch(command, tx);
            }
        }
    }

    fn sync_recorders(&mut self) {
        for definition in platform::shortcuts() {
            if self
                .recorders
                .get(definition.id)
                .is_some_and(ShortcutRecorderState::is_recording)
            {
                continue;
            }
            let shortcut = platform::shortcut_value(&definition, &self.appearance.shortcuts);
            self.recorders.insert(
                definition.id,
                ShortcutRecorderState::new(
                    platform::normalize_shortcut(&shortcut)
                        .parse::<rune::Shortcut>()
                        .ok(),
                ),
            );
        }
        self.update_menus();
    }

    fn update_menus(&mut self) {
        if cfg!(target_os = "macos")
            && let Some(application) = &self.application
            && let Err(error) =
                application.set_menu(platform::menu_items(&self.appearance.shortcuts))
        {
            self.error = true;
            self.message = error.to_string();
        }
    }

    fn open_url(&mut self, url: &str, tx: &mut Tx) {
        if let Err(error) = tx.open_url(url) {
            self.error = true;
            self.message = error.to_string();
        }
    }

    fn rebuild_index(&mut self) {
        self.index.account_search = self
            .data
            .accounts
            .iter()
            .map(|account| {
                format!(
                    "{} {} {} {} {} {}",
                    account.name,
                    account.account_id,
                    account.roles.join(" "),
                    account.region.as_deref().unwrap_or(""),
                    account.last_profile.as_deref().unwrap_or(""),
                    account.group.as_deref().unwrap_or("")
                )
                .to_lowercase()
            })
            .collect();
        self.index.credential_search = self
            .data
            .credentials
            .iter()
            .map(|credential| {
                format!(
                    "{} {} {} {}",
                    credential.account_name,
                    credential.account_id,
                    credential.role_name,
                    credential.profile_name
                )
                .to_lowercase()
            })
            .collect();
        let mut groups: Vec<_> = self
            .data
            .accounts
            .iter()
            .filter_map(|account| account.group.as_ref())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .cloned()
            .collect();
        groups.sort_by_cached_key(|group| (group.to_lowercase(), group.clone()));
        self.index.groups = groups;
        self.invalidate_list();
    }

    fn invalidate_list(&self) {
        self.list.borrow_mut().valid = false;
    }

    fn projection(&self) -> Ref<'_, ListProjection> {
        let rebuild = {
            let list = self.list.borrow();
            !list.valid || list.screen != self.screen || list.query != self.search.text
        };
        if rebuild {
            let query = self.search.text.to_lowercase();
            let words: Vec<_> = query.split_whitespace().collect();
            let search: &[String] = match self.screen {
                Screen::Accounts => &self.index.account_search,
                Screen::Credentials => &self.index.credential_search,
                Screen::Settings => &[],
            };
            let matches: Vec<_> = if words.is_empty() {
                (0..search.len()).collect()
            } else {
                search
                    .iter()
                    .enumerate()
                    .filter(|(_, value)| words.iter().all(|word| value.contains(word)))
                    .map(|(index, _)| index)
                    .collect()
            };
            let entries = if self.screen == Screen::Accounts {
                sections(
                    &self.data.accounts,
                    matches,
                    &self.data.collapsed_groups,
                    !words.is_empty(),
                )
            } else {
                matches.into_iter().map(Entry::Account).collect()
            };
            let visible = entries
                .iter()
                .filter_map(|entry| match entry {
                    Entry::Account(index) => Some(*index),
                    _ => None,
                })
                .collect();
            *self.list.borrow_mut() = ListProjection {
                valid: true,
                screen: self.screen,
                query: self.search.text.clone(),
                entries,
                visible,
            };
        }
        self.list.borrow()
    }

    fn entries(&self) -> Ref<'_, Vec<Entry>> {
        Ref::map(self.projection(), |list| &list.entries)
    }

    fn visible(&self) -> Ref<'_, Vec<usize>> {
        Ref::map(self.projection(), |list| &list.visible)
    }

    fn account_position(&self, id: &str) -> Option<usize> {
        if self.screen != Screen::Accounts {
            return None;
        }
        self.visible()
            .iter()
            .position(|index| self.data.accounts[*index].account_id == id)
    }

    fn account_row_key(id: &str) -> String {
        format!("account-{id}")
    }

    fn groups(&self) -> &[String] {
        &self.index.groups
    }

    fn targets(&self) -> Vec<&Account> {
        if self.screen == Screen::Accounts && self.marked.len() > 1 {
            let accounts: Vec<_> = self
                .visible()
                .iter()
                .map(|index| &self.data.accounts[*index])
                .filter(|a| self.marked.contains(&a.account_id))
                .collect();
            if accounts.len() > 1 {
                return accounts;
            }
        }
        self.account.iter().collect()
    }

    fn credential(&self) -> Option<&Credential> {
        if self.screen != Screen::Credentials {
            return None;
        }
        self.selected.and_then(|selected| {
            self.visible()
                .get(selected)
                .and_then(|index| self.data.credentials.get(*index))
        })
    }

    fn account_args(&self) -> Value {
        json!({"name": self.data.session, "accountId": self.account.as_ref().map(|a| &a.account_id), "role": self.role})
    }

    fn credential_key(credential: &Credential) -> String {
        json!([
            credential.session_name,
            credential.account_id,
            credential.role_name,
            credential.profile_name
        ])
        .to_string()
    }

    fn selected_credentials(&self) -> Vec<Credential> {
        if self.screen != Screen::Credentials {
            return vec![];
        }
        if !self.marked_credentials.is_empty() {
            return self
                .visible()
                .iter()
                .filter_map(|index| self.data.credentials.get(*index))
                .filter(|credential| {
                    self.marked_credentials
                        .contains(&Self::credential_key(credential))
                })
                .cloned()
                .collect();
        }
        self.credential().cloned().into_iter().collect()
    }

    fn inspect(&mut self) {
        if self.screen != Screen::Accounts {
            return;
        }
        let account = self.selected.and_then(|selected| {
            self.visible()
                .get(selected)
                .and_then(|index| self.data.accounts.get(*index))
                .cloned()
        });
        if let Some(account) = account {
            let load = !account.roles_loaded && self.authenticated();
            let id = account.account_id.clone();
            let reset = self.account.as_ref().is_none_or(|a| a.account_id != id);
            if reset {
                self.pending = None;
            }
            self.sync_inspector(account, reset);
            if load {
                self.load_roles(&id);
            }
        }
    }

    fn load_roles(&mut self, account_id: &str) {
        self.request(
            "loadRoles",
            json!({"name": self.data.session, "accountId": account_id}),
        );
    }

    fn sync_inspector(&mut self, account: Account, reset: bool) {
        let role = if reset {
            account.preferred_role.clone()
        } else {
            self.role
                .clone()
                .filter(|role| account.roles.contains(role))
                .or_else(|| account.preferred_role.clone())
        }
        .or_else(|| account.roles.first().cloned());
        let role_changed = self.role != role;
        if reset || role_changed {
            self.flush_preferences();
        }
        self.role = role.clone();
        if reset {
            self.region = TextEdit::new(account.region.as_deref().unwrap_or(""));
        }
        if reset
            || role_changed
            || self
                .account
                .as_ref()
                .is_some_and(|old| old.roles != account.roles)
        {
            self.profile = TextEdit::new(
                role.as_ref()
                    .and_then(|role| account.profiles.get(role))
                    .map(String::as_str)
                    .unwrap_or(""),
            );
        }
        self.account = Some(account);
    }

    fn select_account(&mut self, position: usize, tx: &mut Tx) {
        if self.suppress_account_press {
            self.suppress_account_press = false;
            return;
        }
        let visible = self.visible().clone();
        let Some(index) = visible.get(position) else {
            return;
        };
        if self.screen == Screen::Credentials {
            let key = Self::credential_key(&self.data.credentials[*index]);
            if tx.mods().shift {
                let start = self.selected.unwrap_or(position);
                for index in visible
                    .iter()
                    .take(start.max(position) + 1)
                    .skip(start.min(position))
                {
                    self.marked_credentials
                        .insert(Self::credential_key(&self.data.credentials[*index]));
                }
            } else if tx.mods().cmd {
                if self.marked_credentials.is_empty()
                    && let Some(credential) = self.credential()
                {
                    self.marked_credentials
                        .insert(Self::credential_key(credential));
                }
                if !self.marked_credentials.insert(key.clone()) {
                    self.marked_credentials.remove(&key);
                }
                self.selected = visible.iter().position(|index| {
                    self.marked_credentials
                        .contains(&Self::credential_key(&self.data.credentials[*index]))
                });
                return;
            } else {
                self.marked_credentials.clear();
            }
        } else if self.screen == Screen::Accounts {
            let id = self.data.accounts[*index].account_id.clone();
            if tx.mods().shift {
                let start = self.selected.unwrap_or(position);
                for index in visible
                    .iter()
                    .take(start.max(position) + 1)
                    .skip(start.min(position))
                {
                    self.marked
                        .insert(self.data.accounts[*index].account_id.clone());
                }
            } else if tx.mods().cmd {
                if self.marked.is_empty()
                    && let Some(account) = &self.account
                {
                    self.marked.insert(account.account_id.clone());
                }
                if !self.marked.insert(id.clone()) {
                    self.marked.remove(&id);
                }
            } else {
                self.marked.clear();
            }
        }
        self.selected = Some(position);
        self.inspect();
        if self.screen == Screen::Accounts
            && !self.marked.is_empty()
            && self
                .account
                .as_ref()
                .is_some_and(|account| !self.marked.contains(&account.account_id))
        {
            self.selected = visible
                .iter()
                .position(|index| self.marked.contains(&self.data.accounts[*index].account_id));
            self.inspect();
        }
    }

    fn reset_search(&mut self, tx: &mut Tx) {
        self.suppress_account_press = false;
        self.flush_preferences();
        self.pending = None;
        self.search.clear();
        self.selected = None;
        self.marked.clear();
        self.marked_credentials.clear();
        self.roles.close();
        self.groups.close();
        tx.scroll_to_instant("account-scroll", 0., 0.);
    }

    fn open_session(&mut self, name: String, tx: &mut Tx) {
        if self.data.session.as_ref() == Some(&name)
            && self.initialized
            && !self.data.accounts.is_empty()
        {
            self.screen = Screen::Accounts;
            return;
        }
        self.reset_search(tx);
        self.screen = Screen::Accounts;
        self.data.session = Some(name.clone());
        self.data.accounts.clear();
        self.rebuild_index();
        self.account = None;
        self.request(
            if self.authenticated() {
                "selectSession"
            } else {
                "snapshot"
            },
            json!({"name": name}),
        );
    }

    fn schedule_preference(&mut self, operation: &'static str, tx: &mut Tx) {
        if self.account.is_none() || (operation == "setProfile" && self.role.is_none()) {
            return;
        }
        let mut args = self.account_args();
        if operation == "setRegion" {
            args["region"] = json!(self.region.text.trim());
        } else {
            args["profile"] = json!(self.profile.text.trim());
        }
        self.preferences.insert(
            operation,
            PendingPreference {
                args,
                due: self.clock + 0.4,
            },
        );
        tx.wake_after(Duration::from_millis(400));
    }

    fn flush_preferences(&mut self) {
        for (operation, pending) in std::mem::take(&mut self.preferences) {
            self.request(operation, pending.args);
        }
    }

    fn preferences_dirty(&self) -> bool {
        let Some(account) = &self.account else {
            return false;
        };
        !self.preferences.is_empty()
            || self.requests.iter().chain(self.active.iter()).any(|r| {
                matches!(r.operation, "setProfile" | "setRegion" | "preferRole")
                    && r.args["name"].as_str() == self.data.session.as_deref()
                    && r.args["accountId"].as_str() == Some(account.account_id.as_str())
            })
            || self.region.text.trim() != account.region.as_deref().unwrap_or("")
            || self.profile.text.trim()
                != self
                    .role
                    .as_ref()
                    .and_then(|role| account.profiles.get(role))
                    .map(String::as_str)
                    .unwrap_or("")
    }

    fn save_appearance(&mut self, key: &str, value: Value, tx: &mut Tx) {
        self.appearance_pending.insert(key.into(), value);
        self.appearance_due = Some(self.clock + 0.15);
        tx.wake_after(Duration::from_millis(150));
    }

    fn show_form(
        &mut self,
        title: &str,
        description: &str,
        fields: Vec<(&str, String)>,
        operation: &'static str,
        args: Value,
        tx: &mut Tx,
    ) {
        let id = self.next_id();
        self.form = Some(Form {
            id,
            title: title.into(),
            description: description.into(),
            fields: fields
                .into_iter()
                .map(|(name, value)| (name.into(), TextEdit::new(&value)))
                .collect(),
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
        });
        self.error = false;
        tx.focus_when_shown(format!("form-{id}-field-0"), false);
    }

    fn dispatch(&mut self, command: Command, tx: &mut Tx) {
        if self
            .active
            .as_ref()
            .is_some_and(|r| r.operation == "setUseWslWorkspace")
        {
            return;
        }
        self.context_menu = None;
        if matches!(command, Command::Cancel) {
            let dismissed = self.modal();
            for recorder in self.recorders.values_mut() {
                recorder.cancel();
            }
            if let Some(login) = self.login.take() {
                self.requests
                    .retain(|r| !matches!(r.operation, "startLogin" | "pollLogin"));
                self.request("cancelLogin", json!({"name": login.name}));
            }
            self.form = None;
            self.palette = false;
            self.pending = None;
            if !dismissed {
                self.marked.clear();
                self.marked_credentials.clear();
            }
            tx.focus("account-list", false);
            return;
        }
        if matches!(command, Command::OpenLogin | Command::CopyLoginLink) {
            if let Some(login) = self.login.as_mut().filter(|login| !login.url.is_empty()) {
                if matches!(command, Command::CopyLoginLink) {
                    tx.copy(login.url.clone());
                    login.link_copied = true;
                } else {
                    let url = login.url.clone();
                    self.open_url(&url, tx);
                }
            }
            return;
        }
        if self.login.is_some() || (self.form.is_some() && !matches!(command, Command::Confirm)) {
            return;
        }
        self.palette = false;
        self.command_search.focused = false;
        if let Command::AccountAction(id, command) = command {
            if let Some(position) = self.account_position(&id) {
                self.dispatch(Command::ItemAction(position, command), tx);
            }
            return;
        }
        if let Command::ItemAction(position, command) = command {
            if self.screen == Screen::Accounts
                && self.marked.len() > 1
                && self.visible().get(position).is_some_and(|index| {
                    !self.marked.contains(&self.data.accounts[*index].account_id)
                })
            {
                self.marked.clear();
            }
            self.selected = Some(position);
            self.inspect();
            if matches!(*command, Command::SetCredentials | Command::Console)
                && self.authenticated()
                && self.account.as_ref().is_some_and(|a| !a.roles_loaded)
            {
                if let (Some(name), Some(account)) = (&self.data.session, &self.account) {
                    self.pending = Some((name.clone(), account.account_id.clone(), *command));
                }
            } else {
                self.dispatch(*command, tx);
            }
            return;
        }
        if let Command::SessionAction(name, command) = command {
            if self.data.session.as_ref() != Some(&name) {
                self.open_session(name.clone(), tx);
                if !matches!(*command, Command::Login) {
                    self.request("snapshot", json!({"name": name}));
                }
            }
            self.dispatch(*command, tx);
            return;
        }
        let name = self.data.session.clone();
        let args = self.account_args();
        match command {
            Command::Session(name) => self.open_session(name, tx),
            Command::Inspect => { if self.selected.is_none() { self.selected = Some(0); } self.inspect(); tx.focus("role-trigger", true); }
            Command::Accounts | Command::Credentials | Command::Settings => {
                self.reset_search(tx); self.account = None;
                self.screen = match command { Command::Credentials => Screen::Credentials, Command::Settings => Screen::Settings, _ => Screen::Accounts };
                self.request("snapshot", json!({"name": name}));
                if self.screen == Screen::Settings { self.request("getAppearance", json!({})); self.request("wslStatus", json!({})); }
            }
            Command::Refresh => self.request(if self.screen == Screen::Accounts && self.authenticated() { "selectSession" } else { "snapshot" },
                json!({"name": name, "refresh": true})),
            Command::LoadRoles => if self.authenticated() && let Some(id) = self.account.as_ref().map(|account| account.account_id.clone()) { self.load_roles(&id); },
            Command::SelectRole(role) => {
                if !self.account.as_ref().is_some_and(|a| a.roles.contains(&role)) { return; }
                self.flush_preferences();
                self.profile = TextEdit::new(self.account.as_ref().and_then(|a| a.profiles.get(&role)).map(String::as_str).unwrap_or(""));
                self.role = Some(role); self.roles.close();
            }
            Command::PreferRole => if self.role.is_some() { self.request("preferRole", args); },
            Command::SetCredentials => {
                self.flush_preferences();
                if !self.authenticated() { self.error = true; self.message = "Sign in before setting credentials.".into(); }
                else if self.role.is_none() { self.message = "Choose a role before setting credentials.".into(); tx.focus("role-trigger", true); }
                else if self.preferences_dirty() { self.error = true; self.message = "Wait for region and profile changes to finish saving.".into(); }
                else if self.account.is_some() { self.request("assumeRole", args); }
            }
            Command::Console => if self.role.is_some() && self.account.is_some() { self.request("consoleUrl", args); }
                else { self.message = "Choose a role before opening the AWS Console.".into(); },
            Command::Portal => if name.is_some() { self.request("consoleUrl", json!({"name": name})); },
            Command::Login => if let Some(name) = name {
                self.login = Some(Login { name: name.clone(), url: String::new(), code: String::new(), link_copied: false });
                self.request("startLogin", json!({"name": name}));
            },
            Command::NewSession | Command::EditSession => {
                let editing = matches!(command, Command::EditSession);
                let session = self.data.sessions.iter().find(|s| Some(&s.name) == name.as_ref()).cloned();
                if editing && session.is_none() { return; }
                let session = if editing { session.unwrap_or_default() } else { Default::default() };
                self.show_form(if editing { "Edit SSO session" } else { "Add SSO session" },
                    "Connect an AWS IAM Identity Center organization.",
                    vec![("name", session.name.clone()), ("startUrl", session.start_url),
                        ("ssoRegion", if session.sso_region.is_empty() { "eu-north-1".into() } else { session.sso_region }),
                        ("defaultRegion", if session.default_region.is_empty() { "eu-north-1".into() } else { session.default_region })],
                    "saveSession", json!({"creating": !editing, "originalName": if editing { Some(session.name) } else { None }}), tx);
            }
            Command::DeleteSession => if name.is_some() {
                self.show_form("Delete SSO session?", "Removes its configuration only. Existing credential profiles remain; sign out first to remove them.",
                    vec![], "removeSession", json!({"name": name}), tx);
            },
            Command::SignOut => if name.is_some() {
                self.show_form("Sign out of this organization?", "Removes its local access token and tracked AWS credential profiles. Your browser session is not signed out.",
                    vec![], "signOut", json!({"name": name}), tx);
            },
            Command::RemoveCredential => if let Some(c) = self.credential() {
                self.show_form("Remove credential profile?", &format!("Removes ‘{}’ from your AWS credentials file. This cannot be undone.", c.profile_name),
                    vec![], "clearCredential", json!({"name": c.session_name, "accountId": c.account_id, "role": c.role_name, "profile": c.profile_name}), tx);
            },
            Command::RemoveSelectedCredentials => {
                let credentials = self.selected_credentials();
                if credentials.is_empty() { return; }
                let items: Vec<_> = credentials.iter().map(|c| json!({"name": c.session_name, "accountId": c.account_id, "role": c.role_name, "profile": c.profile_name})).collect();
                self.show_form(&format!("Remove {} credential profiles?", items.len()),
                    "Removes only the selected profiles from your AWS credentials file. Other profiles and SSO sign-ins remain. This cannot be undone.",
                    vec![], "clearCredential", json!({"credentials": items}), tx);
            }
            Command::ClearAllCredentials => self.show_form("Clear all active credentials?",
                "Removes all awsesh-tracked local AWS credential profiles across organizations. Other profiles and SSO sign-ins remain. This cannot be undone.",
                vec![], "clearAllCredentials", json!({"name": name}), tx),
            Command::Confirm => {
                let Some(form) = &self.form else { return };
                if form.submission.is_some() { return; }
                let (id, operation, mut args) = (form.id, form.operation, form.args.clone());
                for (key, edit) in &form.fields {
                    args[key] = json!(if key == "startUrl" { sso_start_url(&edit.text) }
                        else if key == "name" { edit.text.to_owned() } else { edit.text.trim().to_owned() });
                }
                if let Some(Value::Array(credentials)) = args.as_object_mut().and_then(|args| args.remove("credentials")) {
                    let Some((last, rest)) = credentials.split_last() else { return; };
                    for credential in rest { self.request_for_form(operation, credential.clone(), Some(id)); }
                    args = last.clone();
                }
                if let Some(Value::Array(ids)) = args.as_object_mut().and_then(|args| args.remove("accountIds"))
                    && let Some((last, rest)) = ids.split_last() {
                    for account_id in rest {
                        let mut each = args.clone(); each["accountId"] = account_id.clone(); self.request(operation, each);
                    }
                    args["accountId"] = last.clone();
                }
                let request = self.request_for_form(operation, args, Some(id));
                if let Some(form) = &mut self.form { form.submission = Some(request); }
            }
            Command::Palette => {
                self.palette = true; self.command_search.clear(); self.command_selected = 0;
                tx.focus_when_shown("command-search", false);
            }
            Command::Appearance(mode) => self.request("setAppearance", json!({"mode": mode})),
            Command::Theme(theme) => self.request("setAppearance", json!({"theme": theme})),
            Command::OpenThemeDirectory => self.request("openThemeDirectory", json!({})),
            Command::Translucency(value) => {
                self.appearance.translucency = value.clamp(0., 100.);
                self.save_appearance("translucency", json!(self.appearance.translucency), tx);
            }
            Command::Dithering(enabled) => {
                self.appearance.dithering = enabled; self.save_appearance("dithering", json!(enabled), tx);
            }
            Command::ToggleSidebar => {
                tx.animated();
                self.appearance.sidebar_visible = !self.appearance.sidebar_visible;
                self.save_appearance("sidebarVisible", json!(self.appearance.sidebar_visible), tx);
            }
            Command::SidebarWidth(width) => {
                self.appearance.sidebar_width = width.clamp(192., 400.);
                self.save_appearance("sidebarWidth", json!(self.appearance.sidebar_width), tx);
            }
            Command::CompactAccounts(compact) => {
                self.appearance.compact_accounts = compact;
                self.save_appearance("compactAccounts", json!(compact), tx);
            }
            Command::UseWslWorkspace(enabled) => {
                if !self.busy() && self.preferences.is_empty() && !self.modal() {
                    self.request("setUseWslWorkspace", json!({"enabled": enabled}));
                }
            }
            Command::ClearShortcut(id) => {
                let mut shortcuts = self.appearance.shortcuts.clone(); shortcuts.insert(id.into(), String::new());
                self.save_shortcuts(shortcuts, tx);
            }
            Command::ResetShortcuts => self.save_shortcuts(BTreeMap::new(), tx),
            Command::CopyAccount | Command::CopyName | Command::CopyProfile => {
                let mut count = 0;
                let text = if let Some(c) = self.credential() {
                    match command { Command::CopyName => c.account_name.clone(), Command::CopyProfile => c.profile_name.clone(), _ => c.account_id.clone() }
                } else {
                    let targets = self.targets();
                    count = targets.len();
                    targets.iter().map(|a| if matches!(command, Command::CopyName) { a.name.as_str() } else { a.account_id.as_str() }).collect::<Vec<_>>().join("\n")
                };
                if !text.is_empty() {
                    tx.copy(text);
                    if count > 1 && self.screen == Screen::Accounts {
                        let kind = if matches!(command, Command::CopyName) { "names" } else { "IDs" };
                        self.bulk_copy_notice = Some((format!("Copied {count} {kind}"), tx.clock() + 2.));
                        tx.wake_after(Duration::from_secs(2));
                    } else {
                        self.message = "Copied to clipboard".into();
                    }
                }
            }
            Command::TogglePin => {
                let targets = self.targets();
                if !targets.is_empty() { self.dispatch(Command::Pin(!targets.iter().all(|a| a.pinned)), tx); }
            }
            Command::Pin(pinned) => {
                let requests: Vec<_> = self.targets().into_iter().filter(|account| account.pinned != pinned)
                    .map(|account| json!({"name": name, "accountId": account.account_id, "pinned": pinned})).collect();
                for args in requests { self.request("pinAccount", args); }
            },
            Command::ClearSelection => {
                self.bulk_copy_notice = None;
                self.marked.clear();
                self.marked_credentials.clear();
                self.selected = None;
                self.account = None;
            },
            Command::CopyText(value) => {
                if !value.is_empty() {
                    tx.copy(value);
                    self.message = "Copied to clipboard".into();
                }
            },
            Command::NewGroup => {
                let targets = self.targets(); if targets.is_empty() { return; }
                let ids: Vec<_> = targets.iter().map(|a| &a.account_id).collect();
                self.show_form("New group", &format!("Move {} accounts into a new group. Groups are kept per organization.", ids.len()),
                    vec![("group", String::new())], "setAccountGroup", json!({"name": name, "accountIds": ids}), tx);
            }
            Command::SetGroup(group) => {
                let requests: Vec<_> = self.targets().into_iter().filter(|account| account.group != group)
                    .map(|account| json!({"name": name, "accountId": account.account_id, "group": group.clone().unwrap_or_default()})).collect();
                for args in requests { self.request("setAccountGroup", args); }
            },
            Command::ToggleGroup(group) => {
                let collapsed = !self.data.collapsed_groups.contains(&group);
                self.data.collapsed_groups.retain(|value| *value != group);
                if collapsed { self.data.collapsed_groups.push(group.clone()); }
                self.invalidate_list();
                self.request("collapseAccountGroup", json!({"name": name, "group": group, "collapsed": collapsed}));
            }
            Command::RenameGroup(group) => self.show_form("Rename group",
                "Using another group's name merges the two.", vec![("renamed", group.clone())],
                "renameAccountGroup", json!({"name": name, "group": group}), tx),
            Command::RemoveGroup(group) => self.show_form("Remove group?",
                "Its accounts move to Other accounts. Favorites stay in Favorites.", vec![],
                "removeAccountGroup", json!({"name": name, "group": group}), tx),
            Command::Cancel | Command::OpenLogin | Command::CopyLoginLink | Command::ItemAction(..) | Command::AccountAction(..) | Command::SessionAction(..) => {}
        }
    }

    fn save_shortcuts(&mut self, shortcuts: BTreeMap<String, String>, tx: &mut Tx) {
        match platform::validate_shortcuts(&shortcuts) {
            Ok(shortcuts) => {
                self.appearance.shortcuts = shortcuts;
                self.save_appearance("shortcuts", json!(self.appearance.shortcuts), tx);
                self.sync_recorders();
            }
            Err(error) => {
                self.error = true;
                self.message = error.to_string();
            }
        }
    }

    fn commands(&self) -> Vec<(String, Command)> {
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
            (
                if self.appearance.sidebar_visible {
                    "Hide sidebar"
                } else {
                    "Show sidebar"
                }
                .into(),
                Command::ToggleSidebar,
            ),
        ];
        commands.extend(self.data.sessions.iter().map(|s| {
            (
                format!("Switch to {}", s.name),
                Command::Session(s.name.clone()),
            )
        }));
        commands.extend(
            self.appearance
                .themes
                .iter()
                .map(|theme| (format!("Theme: {theme}"), Command::Theme(theme.clone()))),
        );
        commands.extend(["system", "light", "dark"].map(|mode| {
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
        let targets = self.targets();
        if !targets.is_empty() {
            commands.extend([
                ("Copy account IDs".into(), Command::CopyAccount),
                ("Copy account names".into(), Command::CopyName),
                ("Toggle favorites".into(), Command::TogglePin),
                ("Move to a new group…".into(), Command::NewGroup),
                ("Remove from group".into(), Command::SetGroup(None)),
            ]);
            commands.extend(
                self.groups()
                    .iter()
                    .cloned()
                    .map(|group| (format!("Move to {group}"), Command::SetGroup(Some(group)))),
            );
            if targets.len() > 1 {
                commands.push(("Clear selection".into(), Command::ClearSelection));
            }
        }
        if self.account.is_some() && self.role.is_some() {
            commands.push(("Open AWS Console".into(), Command::Console));
            if self.authenticated() && !self.preferences_dirty() {
                commands.push(("Set credentials".into(), Command::SetCredentials));
            }
            commands.push(("Use this role by default".into(), Command::PreferRole));
        }
        if self.credential().is_some() {
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
        if self.selected_credentials().len() > 1 {
            commands.push((
                "Remove selected credential profiles…".into(),
                Command::RemoveSelectedCredentials,
            ));
        }
        let query = self.command_search.text.to_lowercase();
        commands.retain(|(label, _)| {
            query
                .split_whitespace()
                .all(|part| label.to_lowercase().contains(part))
        });
        commands
    }
}

fn setup(state: &mut Sesh, waker: Waker) {
    if state.preview {
        return;
    }
    let (sender, requests) = mpsc::channel::<Request>();
    let (responses, receiver) = mpsc::channel();
    state.sender = Some(sender);
    state.receiver = Some(receiver);
    std::thread::spawn(move || {
        let mut sdk = None;
        while let Ok(request) = requests.recv() {
            let result = (|| -> anyhow::Result<Value> {
                if sdk.is_none() {
                    sdk = Some(sdk::Sdk::start()?);
                }
                sdk.as_mut()
                    .ok_or_else(|| anyhow::anyhow!("SDK unavailable"))?
                    .request(request.operation, request.args.clone())
            })()
            .map_err(|error| error.to_string());
            if responses.send(Response { request, result }).is_err() {
                break;
            }
            waker();
        }
    });
    state.request("getAppearance", json!({}));
    state.request("wslStatus", json!({}));
    state.request("snapshot", json!({}));
}

fn poll(state: &mut Sesh, clock: f64, tx: &mut Tx) -> bool {
    state.clock = clock;
    let mut changed = false;
    if state.bulk_copy_notice.as_ref().is_some_and(|(_, until)| clock >= *until) {
        state.bulk_copy_notice = None;
        changed = true;
    }
    while let Some(response) = state
        .receiver
        .as_ref()
        .and_then(|receiver| receiver.try_recv().ok())
    {
        state.receive(response, tx);
        changed = true;
    }
    let due: Vec<_> = state
        .preferences
        .iter()
        .filter(|(operation, pending)| {
            pending.due <= clock
                || (**operation == "setRegion" && !state.region.focused)
                || (**operation == "setProfile" && !state.profile.focused)
        })
        .map(|(operation, _)| *operation)
        .collect();
    for operation in due {
        if let Some(pending) = state.preferences.remove(operation) {
            state.request(operation, pending.args);
            changed = true;
        }
    }
    if state.appearance_due.is_some_and(|due| due <= clock) {
        state.appearance_due = None;
        let values = std::mem::take(&mut state.appearance_pending);
        if !values.is_empty() {
            state.request("setAppearance", json!(values));
            changed = true;
        }
    }
    if clock >= state.refresh_due && !state.preview {
        state.refresh_due = clock + 30.;
        if !state.busy() && !state.modal() {
            state.request("snapshot", json!({"name": state.data.session}));
        }
    }
    if clock >= state.geometry_due {
        state.geometry_due = clock + 0.5;
        if !state.preview
            && let Some(window) = &state.window
        {
            window_state::save(window);
        }
    }
    tx.wake_after(Duration::from_millis(500));
    changed
}

fn on_key(state: &mut Sesh, event: &KeyEvent, tx: &mut Tx) -> bool {
    if state
        .recorders
        .values()
        .any(ShortcutRecorderState::is_recording)
    {
        return false;
    }
    if event.key == Key::Escape {
        state.dispatch(Command::Cancel, tx);
        return true;
    }
    if rune::Chord::parse("mod+q").is_ok_and(|chord| chord.matches_tx(event, tx)) {
        if !state.preview
            && let Some(window) = &state.window
        {
            window_state::save(window);
        }
        tx.quit();
        return true;
    }
    if let Some(action) = platform::shortcut_action(event, tx, &state.appearance.shortcuts) {
        if action == "search" {
            tx.focus("account-search", true);
        } else if let Some(command) = platform::command(action) {
            state.dispatch(command, tx);
        }
        return true;
    }
    if state.palette {
        let count = state.commands().len();
        match event.key {
            Key::Down => {
                state.command_selected = (state.command_selected + 1).min(count.saturating_sub(1));
            }
            Key::Up => {
                state.command_selected = state.command_selected.saturating_sub(1);
            }
            Key::Enter => {
                if let Some((_, command)) = state.commands().get(state.command_selected).cloned() {
                    state.dispatch(command, tx);
                }
            }
            _ => return false,
        }
        tx.scroll_into_view(format!("command-{}", state.command_selected));
        return true;
    }
    if state.modal() {
        return false;
    }
    if tx.focused().is_none()
        || tx
            .focused()
            .is_some_and(|key| key == "account-list" || key.starts_with("account-"))
    {
        let count = state.visible().len();
        if count == 0 {
            return false;
        }
        match event.key {
            Key::Down => {
                state.selected = Some(state.selected.map_or(0, |index| (index + 1).min(count - 1)))
            }
            Key::Up => state.selected = Some(state.selected.unwrap_or(0).saturating_sub(1)),
            Key::Enter => {
                state.dispatch(Command::Inspect, tx);
                return true;
            }
            _ => return false,
        }
        state.marked.clear();
        state.marked_credentials.clear();
        state.inspect();
        if let Some(position) = state.selected {
            let key = if state.screen == Screen::Accounts {
                state
                    .visible()
                    .get(position)
                    .map(|index| Sesh::account_row_key(&state.data.accounts[*index].account_id))
            } else {
                Some(format!("account-{position}"))
            };
            if let Some(key) = key {
                tx.scroll_into_view(key);
            }
        }
        return true;
    }
    false
}

fn main() {
    let saved = window_state::load();
    let size = saved
        .map(|state| (state.width.max(960.), state.height.max(620.)))
        .unwrap_or((1200., 780.));
    let preview = std::env::args().any(|argument| argument == "--preview");
    let mut app = App::new(AppSpec {
        min_size: Some((960., 620.)),
        setup: Some(setup),
        poll: Some(poll),
        on_key: Some(on_key),
        scenes: &[
            ("expanded", ui::preview),
            ("authenticated", ui::preview_authenticated),
            ("large", |s| {
                ui::preview_authenticated(s);
                s.data.accounts = (0..1000)
                    .map(|index| Account {
                        account_id: format!("{index:012}"),
                        name: format!("Account {index:04}"),
                        roles: vec!["AdministratorAccess".into(), "ReadOnlyAccess".into()],
                        roles_loaded: true,
                        group: Some(format!("Group {:02}", index / 100)),
                        ..Default::default()
                    })
                    .collect();
                s.selected = Some(0);
                s.account = s.data.accounts.first().cloned();
                s.rebuild_index();
            }),
            ("session-form", |s| {
                ui::preview(s);
                s.dispatch(Command::NewSession, &mut Tx::default());
            }),
            ("commands", |s| {
                ui::preview_authenticated(s);
                s.palette = true;
            }),
            ("translucent", |s| {
                ui::preview_authenticated(s);
                s.appearance.translucency = 10.;
            }),
            ("light", |s| {
                ui::preview_authenticated(s);
                s.appearance.mode = "light".into();
            }),
            ("credentials-selected", |s| {
                ui::preview_authenticated(s);
                let mut credential = s.data.credentials[0].clone();
                credential.profile_name = "security-read-only".into();
                credential.role_name = "ReadOnlyAccess".into();
                s.data.credentials.push(credential);
                s.rebuild_index();
                s.screen = Screen::Credentials;
                s.selected = Some(0);
                s.account = None;
                s.marked_credentials = s
                    .data
                    .credentials
                    .iter()
                    .map(Sesh::credential_key)
                    .collect();
            }),
            ("folded", |s| {
                ui::preview(s);
                s.appearance.sidebar_visible = false;
            }),
            ("settings", |s| {
                ui::preview(s);
                s.screen = Screen::Settings;
            }),
            ("credentials", |s| {
                ui::preview_authenticated(s);
                s.screen = Screen::Credentials;
                s.account = None;
                s.selected = Some(0);
            }),
        ],
        families: ("system-ui, Inter", "ui-monospace"),
        ..AppSpec::new("Sesh", size, Sesh::default, ui::view)
    })
    .init(move || {
        let mut state = Sesh::default();
        if preview {
            ui::preview(&mut state);
        }
        state
    })
    .chrome(rune::Chrome {
        full_size_content: true,
        traffic_lights: Some((18., 14.)),
        drag_regions: true,
    })
    .titlebar(rune::Titlebar::new(40.))
    .window_options(rune::WindowOptions {
        transparent: true,
        ..Default::default()
    })
    .maximized(saved.is_some_and(|state| state.maximized))
    .standard_menus()
    .on_close(|state, _| {
        if !state.preview
            && let Some(window) = &state.window
        {
            window_state::save(window);
        }
    });
    app = platform::menus(app);
    let handle = app.handle();
    if let Some(saved) = saved {
        handle.set_position((saved.x.round() as i32, saved.y.round() as i32));
    }
    app.on_window(move |window| {
        platform::configure_window(window);
        window_state::restore_visible(window);
        let native = window.clone();
        let application = handle.clone();
        handle.update(move |state, _| {
            state.window = Some(native);
            state.application = Some(application);
            state.update_menus();
        });
    })
    .run();
}

#[cfg(test)]
mod tests {
    use super::*;

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

    #[test]
    fn arranges_pinned_grouped_and_remaining_accounts() {
        let account = |pinned, group: Option<&str>| Account {
            pinned,
            group: group.map(Into::into),
            ..Default::default()
        };
        let accounts = [
            account(true, Some("prod")),
            account(false, None),
            account(false, Some("dev")),
            account(false, Some("prod")),
        ];
        assert_eq!(
            sections(&accounts, vec![0, 1, 2, 3], &[], false),
            vec![
                Entry::Heading {
                    group: None,
                    count: 1,
                    collapsed: false
                },
                Entry::Account(0),
                Entry::Heading {
                    group: Some("dev".into()),
                    count: 1,
                    collapsed: false
                },
                Entry::Account(2),
                Entry::Heading {
                    group: Some("prod".into()),
                    count: 1,
                    collapsed: false
                },
                Entry::Account(3),
                Entry::Heading {
                    group: Some("".into()),
                    count: 1,
                    collapsed: false
                },
                Entry::Account(1),
            ]
        );
        assert!(!sections(&accounts, vec![2], &["dev".into()], false).contains(&Entry::Account(2)));
        assert!(sections(&accounts, vec![2], &["dev".into()], true).contains(&Entry::Account(2)));
    }

    #[test]
    fn validates_shortcut_overrides_and_replaces_bindings() -> anyhow::Result<()> {
        for (id, key) in [
            ("unknown", "alt-f"),
            ("search", "a"),
            ("search", "cmd"),
            ("search", "cmd-invalid"),
            ("search", "cmd-\0"),
            ("search", "cmd-f cmd-k"),
            ("search", "mod+q"),
            ("search", "mod+r"),
        ] {
            assert!(
                platform::validate_shortcuts(&BTreeMap::from([(id.into(), key.into())])).is_err(),
                "{key}"
            );
        }
        assert!(
            platform::validate_shortcuts(&BTreeMap::from([("search".into(), "mod+f".into())]))?
                .is_empty()
        );
        assert!(
            platform::validate_shortcuts(&BTreeMap::from([("search".into(), "f8".into())])).is_ok()
        );
        assert_eq!(
            platform::shortcut_label("search", &BTreeMap::from([("search".into(), "".into())])),
            "Unassigned"
        );
        Ok(())
    }

    #[test]
    fn completed_save_does_not_close_a_replacement_form() {
        let mut state = Sesh::default();
        ui::preview(&mut state);
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.frame(0.);
        runtime.update(|state, tx| {
            state.dispatch(Command::NewSession, tx);
            if let Some(form) = &mut state.form {
                form.fields[0].1 = TextEdit::new("First session");
            }
            state.dispatch(Command::Confirm, tx);
        });
        let request = runtime
            .state
            .requests
            .back()
            .cloned()
            .expect("Submitted form");
        runtime.update(|state, tx| {
            state.dispatch(Command::Cancel, tx);
            state.dispatch(Command::NewSession, tx);
            if let Some(form) = &mut state.form { form.fields[0].1 = TextEdit::new("Replacement draft"); }
            state.receive(Response { request, result: Ok(json!({
                "sessions": [{"name": "First session", "startUrl": "https://example.awsapps.com/start",
                    "ssoRegion": "eu-north-1", "defaultRegion": "eu-north-1", "authenticated": false}],
                "accounts": [], "credentials": [], "collapsedGroups": []
            })) }, tx);
        });
        assert_eq!(
            runtime
                .state
                .form
                .as_ref()
                .expect("Replacement form remains open")
                .fields[0]
                .1
                .text,
            "Replacement draft"
        );
        assert!(
            runtime
                .state
                .form
                .as_ref()
                .expect("Replacement form")
                .submission
                .is_none()
        );
    }

    #[test]
    fn selected_accounts_are_moved_together() {
        let mut state = Sesh::default();
        ui::preview(&mut state);
        state.data.accounts[0].pinned = true;
        state.data.accounts[1].group = Some("Prod".into());
        state.rebuild_index();
        state.marked = BTreeSet::from([
            state.data.accounts[2].account_id.clone(),
            state.data.accounts[3].account_id.clone(),
        ]);
        let ids: Vec<_> = state.marked.iter().cloned().collect();
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.frame(0.);
        assert!(runtime.find("bulk-inspector").is_some());
        runtime.update(|state, tx| state.dispatch(Command::SetGroup(Some("Prod".into())), tx));
        let requests: Vec<_> = runtime
            .state
            .requests
            .iter()
            .filter(|request| request.operation == "setAccountGroup")
            .collect();
        assert_eq!(requests.len(), 2);
        assert!(requests.iter().all(|request| {
            ids.contains(&request.args["accountId"].as_str().unwrap_or("").to_owned())
        }));
        assert!(
            requests
                .iter()
                .all(|request| request.args["group"] == "Prod")
        );
        runtime.update(|state, tx| {
            state.requests.clear();
            state.dispatch(Command::NewGroup, tx);
            if let Some(form) = &mut state.form {
                form.fields[0].1 = TextEdit::new("Dev");
            }
            state.dispatch(Command::Confirm, tx);
        });
        assert_eq!(runtime.state.requests.len(), 2);
        assert!(
            runtime
                .state
                .requests
                .iter()
                .all(|request| request.args["group"] == "Dev")
        );
        let last = runtime.state.requests.back().expect("Last account saves");
        assert_eq!(
            runtime.state.form.as_ref().expect("Bulk form").submission,
            Some(last.id)
        );
        runtime.update(|state, tx| state.dispatch(Command::Cancel, tx));
        assert_eq!(
            runtime.state.marked.len(),
            2,
            "Escape closes the form first"
        );
        runtime.update(|state, tx| state.dispatch(Command::Cancel, tx));
        assert!(
            runtime.state.marked.is_empty(),
            "Escape then clears the selection"
        );
    }

    #[test]
    fn dragging_accounts_moves_them_between_sections() {
        let mut state = Sesh::default();
        ui::preview(&mut state);
        state.data.accounts[0].pinned = true;
        state.data.accounts[1].group = Some("Prod".into());
        let id = state.data.accounts[2].account_id.clone();
        state.rebuild_index();
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.frame(0.);
        let (x, y) = runtime
            .find(&Sesh::account_row_key(&id))
            .expect("Ungrouped row");
        let (target_x, target_y) = runtime.find("heading-group:Prod").expect("Prod heading");
        runtime.pointer_down(x, y);
        runtime.frame(1. / 60.);
        runtime.pointer_move(x, y + 8.);
        runtime.frame(1. / 60.);
        runtime.pointer_move(target_x, target_y);
        runtime.frame(1. / 60.);
        assert!(
            runtime
                .state
                .dragging
                .as_ref()
                .is_some_and(|drag| drag.active)
        );
        assert!(runtime.find("account-drag").is_some());
        runtime.pointer_up(target_x, target_y);
        runtime.frame(1. / 60.);
        let request = runtime
            .state
            .requests
            .iter()
            .find(|request| request.operation == "setAccountGroup")
            .expect("Group move requested");
        assert_eq!(request.args["accountId"], id);
        assert_eq!(request.args["group"], "Prod");
        assert!(runtime.state.dragging.is_none());
    }

    #[test]
    fn sidebar_folds_under_stationary_native_control_clearance_and_reverses() {
        let mut state = Sesh::default();
        ui::preview(&mut state);
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.set_titlebar_inset(78.);
        runtime.frame(0.);
        let before = runtime
            .presented("native-control-clearance")
            .expect("Native clearance")
            .0;
        let initial = runtime.presented("sidebar-viewport").expect("Sidebar").0[2];
        let (x, y) = runtime.find("toolbar-sidebar").expect("Sidebar toggle");
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        for _ in 0..5 {
            runtime.frame(1. / 60.);
        }
        let middle = runtime.presented("sidebar-viewport").expect("Sidebar").0[2];
        let account_left = runtime.presented("account-list").expect("Account pane").0[0];
        assert!(
            (account_left - middle).abs() <= 1.1,
            "Account pane tracks the sidebar edge: {account_left} / {middle}"
        );
        assert!(
            middle > 0. && middle < initial,
            "Sidebar transitions rather than disappearing"
        );
        assert_eq!(
            runtime
                .presented("native-control-clearance")
                .expect("Native clearance")
                .0,
            before
        );
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        for _ in 0..60 {
            runtime.frame(1. / 60.);
        }
        assert!(
            (runtime.presented("sidebar-viewport").expect("Sidebar").0[2] - initial).abs() < 0.1
        );
        assert_eq!(
            runtime
                .presented("native-control-clearance")
                .expect("Native clearance")
                .0,
            before
        );
    }

    #[test]
    fn search_and_command_palette_route_keyboard_input() {
        let mut state = Sesh::default();
        ui::preview(&mut state);
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.on_key = Some(on_key);
        runtime.frame(0.);
        let modifiers = rune::Mods {
            cmd: true,
            logo: cfg!(target_os = "macos"),
            ctrl: !cfg!(target_os = "macos"),
            ..Default::default()
        };
        runtime.key(KeyEvent {
            key: Key::Command('f'),
            mods: modifiers,
        });
        runtime.frame(1. / 60.);
        runtime.key(Key::Text("missing account".into()).into());
        runtime.frame(1. / 60.);
        assert_eq!(runtime.state.search.text, "missing account");
        assert!(runtime.state.visible().is_empty());
        runtime.key(KeyEvent {
            key: Key::Command('k'),
            mods: modifiers,
        });
        runtime.frame(1. / 60.);
        assert!(runtime.state.palette);
        runtime.key(Key::Text("settings".into()).into());
        runtime.frame(1. / 60.);
        assert_eq!(runtime.state.command_search.text, "settings");
        runtime.key(Key::Enter.into());
        runtime.frame(1. / 60.);
        assert!(runtime.state.screen == Screen::Settings);
        assert!(!runtime.state.palette);
    }

    #[test]
    fn no_op_drag_preserves_account_selection() {
        for outside in [false, true] {
            let mut state = Sesh::default();
            ui::preview(&mut state);
            state.marked = state
                .data
                .accounts
                .iter()
                .take(2)
                .map(|account| account.account_id.clone())
                .collect();
            state.selected = Some(0);
            state.account = state.data.accounts.first().cloned();
            let expected = state.marked.clone();
            let mut runtime = rune::Runtime::new(
                state,
                ui::view,
                (1200., 780.),
                rune::Env {
                    system_dark: true,
                    scale: 1.,
                },
            );
            runtime.frame(0.);
            let key = Sesh::account_row_key(&runtime.state.data.accounts[0].account_id);
            let (x, y) = runtime.find(&key).expect("Account row");
            runtime.pointer_down(x, y);
            runtime.frame(1. / 60.);
            runtime.pointer_move(x + 8., y + 8.);
            runtime.frame(1. / 60.);
            let target = if outside { (20., 400.) } else { (x, y) };
            runtime.pointer_move(target.0, target.1);
            runtime.frame(1. / 60.);
            runtime.pointer_up(target.0, target.1);
            runtime.frame(1. / 60.);
            assert_eq!(runtime.state.marked, expected);
            assert_eq!(runtime.state.selected, Some(0));
            assert!(runtime.state.requests.is_empty());
        }
    }

    #[test]
    fn bulk_credential_removal_uses_complete_identity_and_stops_on_failure() {
        let mut state = Sesh::default();
        ui::preview_authenticated(&mut state);
        state.screen = Screen::Credentials;
        let mut second = state.data.credentials[0].clone();
        second.profile_name = "read-only".into();
        second.session_name = "Elva".into();
        second.role_name = "ReadOnlyAccess".into();
        state.data.credentials.push(second);
        state.rebuild_index();
        state.marked_credentials = state
            .data
            .credentials
            .iter()
            .map(Sesh::credential_key)
            .collect();
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.frame(0.);
        runtime.update(|state, tx| {
            state.dispatch(Command::RemoveSelectedCredentials, tx);
            assert!(state.requests.is_empty(), "Confirmation is required");
            state.dispatch(Command::Confirm, tx);
        });
        assert_eq!(runtime.state.requests.len(), 2);
        let first = runtime.state.requests.pop_front().expect("First profile");
        assert_eq!(first.args["profile"], "security-management");
        let second = runtime.state.requests.back().expect("Second profile");
        assert_eq!(second.args["name"], "Elva");
        assert_eq!(second.args["profile"], "read-only");
        assert_eq!(second.args["role"], "ReadOnlyAccess");
        runtime.update(|state, tx| {
            state.receive(
                Response {
                    request: first,
                    result: Err("Credential file unavailable".into()),
                },
                tx,
            )
        });
        assert!(runtime.state.requests.is_empty());
        assert!(
            runtime
                .state
                .form
                .as_ref()
                .is_some_and(|form| form.submission.is_none())
        );
        assert!(runtime.state.error);
    }

    #[test]
    fn inspector_values_copy_without_changing_credentials() {
        let mut state = Sesh::default();
        ui::preview_authenticated(&mut state);
        state.screen = Screen::Credentials;
        state.selected = Some(0);
        let clipboard = rune::clipboard::memory();
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.use_clipboard(&clipboard);
        runtime.set_titlebar_inset(78.);
        runtime.frame(0.);
        let heading = runtime
            .presented("inspector-heading")
            .expect("Inspector heading")
            .0;
        assert!(heading[1] < 1. && heading[3] <= 40.);
        for (key, expected) in [
            ("copy-credential-profile", "security-management"),
            ("copy-credential-name", "Management"),
            ("copy-credential-account", "365474014391"),
            ("copy-credential-role", "AdministratorAccess"),
            ("copy-credential-session", "Donedev"),
            ("copy-credential-region", "eu-north-1"),
        ] {
            let (x, y) = runtime.find(key).expect("Copyable value");
            runtime.pointer_down(x, y);
            runtime.pointer_up(x, y);
            runtime.frame(1. / 60.);
            assert_eq!(
                clipboard.text().map(|text| text.to_string()).as_deref(),
                Some(expected)
            );
        }
        assert!(runtime.state.requests.is_empty());
        let (x, y) = runtime
            .find("clear-credential-selection")
            .expect("Clear selection");
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        assert!(runtime.state.selected_credentials().is_empty());
        assert_eq!(runtime.state.data.credentials.len(), 1);
        assert!(runtime.state.requests.is_empty());
        runtime.update(|state, _| {
            state.screen = Screen::Accounts;
            state.selected = Some(3);
            state.account = state.data.accounts.get(3).cloned();
        });
        runtime.frame(1. / 60.);
        for (key, expected) in [
            ("copy-account-name", "Management"),
            ("copy-account-id", "365474014391"),
        ] {
            let (x, y) = runtime.find(key).expect("Copyable account metadata");
            runtime.pointer_down(x, y);
            runtime.pointer_up(x, y);
            runtime.frame(1. / 60.);
            assert_eq!(
                clipboard.text().map(|text| text.to_string()).as_deref(),
                Some(expected)
            );
        }
    }

    #[test]
    fn selected_account_inspector_keeps_its_layout_while_roles_load() {
        let mut state = Sesh::default();
        ui::preview_authenticated(&mut state);
        let (sender, requests) = mpsc::channel();
        state.sender = Some(sender);
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.frame(0.);
        let fields = ["role-trigger", "region", "profile", "set-credentials"];
        let ready = fields.map(|key| runtime.presented(key).expect(key).0);
        let account_id = "258109618380";
        let (x, y) = runtime
            .find(&Sesh::account_row_key(account_id))
            .expect("Galleri account row");
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        assert!(runtime.elements().iter().any(|element| {
            element.key.as_deref() == Some("copy-account-name")
                && element.label.as_deref() == Some("Copy Galleri")
        }));
        assert!(runtime.elements().iter().any(|element| {
            element.role == "status" && element.label.as_deref() == Some("Loading roles…")
        }));
        assert_eq!(
            fields.map(|key| runtime.presented(key).expect(key).0),
            ready
        );
        let request = requests.try_recv().expect("Role request");
        runtime.update(|state, tx| {
            state.receive(
                Response {
                    request,
                    result: Err("Could not load roles".into()),
                },
                tx,
            );
        });
        runtime.frame(1. / 60.);
        assert!(runtime.elements().iter().any(|element| {
            element.role == "button" && element.label.as_deref() == Some("Retry loading roles")
        }));
        assert_eq!(
            fields.map(|key| runtime.presented(key).expect(key).0),
            ready
        );
        let (x, y) = runtime.find("role-trigger").expect("Retry role loading");
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        let retry = requests.try_recv().expect("Retry role request");
        runtime.update(|state, tx| {
            state.receive(
                Response {
                    request: retry,
                    result: Ok(json!({
                        "sessions": [{
                            "name": "Donedev", "startUrl": "", "ssoRegion": "",
                            "defaultRegion": "", "authenticated": true
                        }],
                        "session": "Donedev",
                        "accounts": [{
                            "accountId": account_id, "name": "Galleri",
                            "roles": ["ReadOnlyAccess"], "rolesLoaded": true,
                            "profiles": {}, "pinned": false
                        }],
                        "collapsedGroups": [], "credentials": []
                    })),
                },
                tx,
            );
        });
        runtime.frame(1. / 60.);
        assert!(runtime.elements().iter().any(|element| {
            element.text.as_deref() == Some("ReadOnlyAccess")
                && element.path.contains("inspector-pane")
        }));
        assert_eq!(
            fields.map(|key| runtime.presented(key).expect(key).0),
            ready
        );
    }

    #[test]
    fn session_dialog_uses_full_window_shading_and_standard_inputs() {
        let mut state = Sesh::default();
        ui::preview(&mut state);
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.frame(0.);
        runtime.update(|state, tx| state.dispatch(Command::NewSession, tx));
        runtime.frame(1. / 60.);
        let scrim = runtime.presented("form-scrim").expect("Dialog shading").0;
        assert_eq!(scrim, [0., 0., 1200., 780.]);
        let id = runtime.state.form.as_ref().expect("Session form").id;
        for index in 0..4 {
            let bounds = runtime
                .presented(&format!("form-{id}-field-{index}"))
                .expect("Session field")
                .0;
            let button_height = runtime.presented("form-confirm").unwrap().0[3];
            assert!((bounds[3] - button_height).abs() < 0.1);
        }
    }

    #[test]
    fn session_dialog_previews_the_resolved_url_without_replacing_the_input() {
        let mut state = Sesh::default();
        let (sender, requests) = mpsc::channel();
        state.sender = Some(sender);
        let mut runtime = rune::Runtime::new(state, ui::view, (960., 620.), rune::Env::new(false, 1.));
        runtime.frame(0.);
        runtime.update(|state, tx| {
            state.dispatch(Command::NewSession, tx);
            let form = state.form.as_mut().unwrap();
            form.fields[0].1 = TextEdit::new("Example");
            form.fields[1].1 = TextEdit::new("example-org");
            poll(state, 1., tx);
        });
        runtime.frame(1. / 60.);
        let form = runtime.state.form.as_ref().unwrap();
        assert_eq!(form.fields[1].1.text, "example-org");
        let input = runtime.presented(&format!("form-{}-field-1", form.id)).unwrap().0;
        let preview = runtime.presented("sso-url-preview").unwrap().0;
        assert!(preview[1] >= input[1] + input[3]);
        assert!(runtime.elements().iter().any(|element| {
            element.text.as_deref() == Some("Resolves to: https://example-org.awsapps.com/start")
        }));
        runtime.update(|state, tx| state.dispatch(Command::Confirm, tx));
        let request = requests.try_recv().unwrap();
        assert_eq!(request.operation, "saveSession");
        assert_eq!(request.args["startUrl"], "https://example-org.awsapps.com/start");
        assert_eq!(runtime.state.form.as_ref().unwrap().fields[1].1.text, "example-org");
    }

    #[test]
    fn sign_in_centers_the_code_and_copies_the_complete_url_from_the_action_row() {
        let mut state = Sesh::default();
        ui::preview(&mut state);
        let (sender, requests) = mpsc::channel();
        state.sender = Some(sender);
        let clipboard = rune::clipboard::memory();
        let mut runtime = rune::Runtime::new(state, ui::view, (960., 620.), rune::Env::new(false, 1.));
        runtime.use_clipboard(&clipboard);
        runtime.frame(0.);
        runtime.update(|state, tx| state.dispatch(Command::Login, tx));
        let request = requests.try_recv().unwrap();
        assert_eq!(request.operation, "startLogin");
        let url = "https://example.awsapps.com/verify?user_code=ABCD-EFGH";
        runtime.update(|state, tx| {
            state.receive(Response {
                request,
                result: Ok(json!({"url": url, "code": "ABCD-EFGH"})),
            }, tx);
        });
        assert_eq!(requests.try_recv().unwrap().operation, "pollLogin");
        runtime.frame(1. / 60.);
        assert_eq!(runtime.take_url_requests(), [url]);
        let bounds = |key: &str| runtime.presented(key).unwrap().0;
        let dialog = bounds("login-dialog");
        let code = bounds("login-code");
        assert!((code[0] + code[2] / 2. - dialog[0] - dialog[2] / 2.).abs() < 1.);
        let cancel = bounds("cancel-login");
        let copy = bounds("copy-login-link");
        let open = bounds("open-login");
        assert!(cancel[1] + cancel[3] <= code[1]);
        assert!(cancel[0] > dialog[0] + dialog[2] / 2.);
        assert_eq!(copy[1], open[1]);
        assert_eq!([copy[3], open[3]], [36.; 2]);
        assert!(copy[0] + copy[2] <= open[0]);
        assert!(open[0] + open[2] <= dialog[0] + dialog[2]);
        let (x, y) = runtime.find("copy-login-link").unwrap();
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        assert_eq!(clipboard.text().as_deref().map(String::as_str), Some(url));
        assert!(runtime.state.login.as_ref().unwrap().link_copied);
        let (x, y) = runtime.find("open-login").unwrap();
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        assert_eq!(runtime.take_url_requests(), [url]);
        let (x, y) = runtime.find("cancel-login").unwrap();
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        assert!(runtime.state.login.is_none());
    }

    #[test]
    fn inputs_and_closed_dropdowns_match_standard_button_height() {
        let mut state = Sesh::default();
        ui::preview_authenticated(&mut state);
        let mut runtime = rune::Runtime::new(state, ui::view, (1200., 780.), rune::Env::new(false, 1.));
        runtime.frame(0.);
        let role = runtime.presented("role-trigger").unwrap().0;
        for key in ["region", "profile", "set-credentials"] {
            assert_eq!(role[3], runtime.presented(key).unwrap().0[3], "{key}");
        }
        runtime.update(|state, tx| state.dispatch(Command::Settings, tx));
        runtime.frame(1. / 60.);
        let theme = runtime.presented("theme-dropdown").unwrap().0;
        assert_eq!(theme[3], runtime.presented("theme-directory").unwrap().0[3]);
        let (x, y) = runtime.find("theme-dropdown").unwrap();
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        assert!(runtime.state.themes.is_open());
    }

    #[test]
    fn sidebar_highlights_only_the_current_destination() {
        let mut state = Sesh::default();
        ui::preview(&mut state);
        let mut runtime = rune::Runtime::new(state, ui::view, (960., 620.), rune::Env::new(false, 1.));
        let keys = ["session-Donedev", "credentials-navigation", "settings-navigation"];
        runtime.frame(0.);
        for (index, command) in [Command::Accounts, Command::Credentials, Command::Settings]
            .into_iter()
            .enumerate()
        {
            runtime.update(|state, tx| state.dispatch(command, tx));
            runtime.frame(1. / 60.);
            let elements = runtime.elements();
            for (position, key) in keys.into_iter().enumerate() {
                let item = elements.iter().find(|element| element.key.as_deref() == Some(key)).unwrap();
                assert_eq!(item.item_selected, position == index, "{key}");
            }
        }
    }

    #[test]
    fn bulk_inspector_groups_actions_and_reports_clipboard_count() {
        let mut state = Sesh::default();
        ui::preview_authenticated(&mut state);
        let selected = &state.data.accounts[..3];
        let ids = selected.iter().map(|account| account.account_id.clone()).collect::<Vec<_>>();
        state.marked = ids.iter().cloned().collect();
        let clipboard = rune::clipboard::memory();
        let mut runtime = rune::Runtime::new(state, ui::view, (960., 620.), rune::Env::new(false, 1.));
        runtime.use_clipboard(&clipboard);
        runtime.frame(0.);
        let ids_bounds = runtime.presented("bulk-copy-ids").unwrap().0;
        let names_bounds = runtime.presented("bulk-copy-names").unwrap().0;
        assert_eq!(ids_bounds[1], names_bounds[1]);
        assert!(ids_bounds[0] + ids_bounds[2] <= names_bounds[0]);
        let click = |runtime: &mut rune::Runtime<Sesh>, key| {
            let (x, y) = runtime.find(key).unwrap();
            runtime.pointer_down(x, y);
            runtime.pointer_up(x, y);
            runtime.frame(1. / 60.);
        };
        let add = runtime.presented("bulk-pin").unwrap().0;
        let remove = runtime.presented("bulk-unpin").unwrap().0;
        assert_eq!(add[1], remove[1]);
        assert_eq!((add[0], add[2]), (ids_bounds[0], ids_bounds[2]));
        assert_eq!((remove[0], remove[2]), (names_bounds[0], names_bounds[2]));
        assert!(add[2] > 100.);
        click(&mut runtime, "bulk-unpin");
        assert!(runtime.state.requests.is_empty());
        click(&mut runtime, "bulk-pin");
        assert_eq!(runtime.state.requests.iter().filter(|request| {
            request.operation == "pinAccount" && request.args["pinned"] == json!(true)
        }).count(), 3);
        click(&mut runtime, "bulk-copy-ids");
        let text = clipboard.text().unwrap();
        assert_eq!(text.lines().collect::<BTreeSet<_>>(), ids.iter().map(String::as_str).collect());
        assert!(runtime.elements().iter().any(|element| {
            element.key.as_deref() == Some("bulk-copy-notice")
                && element.label.as_deref() == Some("Copied 3 IDs")
        }));
        runtime.update(|s, tx| {
            let until = s.bulk_copy_notice.as_ref().unwrap().1;
            assert!(poll(s, until, tx));
        });
        runtime.frame(1. / 60.);
        assert!(runtime.find("bulk-copy-notice").is_none());
        click(&mut runtime, "bulk-clear");
        assert!(runtime.state.marked.is_empty());
        assert!(runtime.find("bulk-inspector").is_none());
    }

    #[test]
    fn cached_search_tracks_query_collapse_and_snapshot_changes() {
        let mut state = Sesh::default();
        ui::preview_authenticated(&mut state);
        state.data.accounts[0].group = Some("Production".into());
        state.rebuild_index();
        state.search = TextEdit::new("MANAGEMENT administratoraccess");
        assert_eq!(*state.visible(), vec![3]);
        state.search.clear();
        assert_eq!(state.visible().len(), 8);
        let mut tx = Tx::default();
        state.dispatch(Command::ToggleGroup("Production".into()), &mut tx);
        assert!(!state.visible().contains(&0));
        state.search = TextEdit::new("GALLERI");
        assert_eq!(
            *state.visible(),
            vec![0],
            "Search includes collapsed groups"
        );
        state.search = TextEdit::new("renamed");
        assert!(state.visible().is_empty());
        state.apply_snapshot(
            json!({
                "session": "Donedev", "sessions": [], "credentials": [], "collapsedGroups": [],
                "accounts": [{"accountId": "258109618380", "name": "Renamed", "roles": [],
                    "rolesLoaded": true, "profiles": {}, "pinned": false, "group": "Operations"}]
            }),
            &Request {
                id: 0,
                operation: "snapshot",
                args: json!({}),
                form: None,
            },
            &mut tx,
        );
        assert_eq!(*state.visible(), vec![0]);
        assert_eq!(state.groups(), &["Operations".to_owned()]);
    }

    #[test]
    fn lazy_account_rows_keep_identity_after_reordering_and_scroll_to_unmounted_items() {
        let mut state = Sesh::default();
        ui::preview_authenticated(&mut state);
        state.data.accounts = (0..1000)
            .map(|index| Account {
                account_id: format!("{index:012}"),
                name: format!("Account {index:04}"),
                roles: vec!["ReadOnlyAccess".into()],
                roles_loaded: true,
                ..Default::default()
            })
            .collect();
        state.selected = Some(0);
        state.account = state.data.accounts.first().cloned();
        state.rebuild_index();
        let mut runtime = rune::Runtime::new(
            state,
            ui::view,
            (1200., 780.),
            rune::Env {
                system_dark: true,
                scale: 1.,
            },
        );
        runtime.frame(0.);
        let first = Sesh::account_row_key("000000000000");
        let last = Sesh::account_row_key("000000000999");
        assert!(runtime.find(&first).is_some());
        assert!(runtime.find(&last).is_none());
        runtime.update(|state, tx| {
            state.data.accounts.swap(0, 1);
            state.rebuild_index();
            tx.instant();
        });
        runtime.frame(1. / 60.);
        let (x, y) = runtime.find(&first).expect("Retained account row");
        runtime.pointer_down(x, y);
        runtime.pointer_up(x, y);
        runtime.frame(1. / 60.);
        assert_eq!(runtime.state.selected, Some(1));
        assert_eq!(
            runtime
                .state
                .account
                .as_ref()
                .map(|account| account.account_id.as_str()),
            Some("000000000000")
        );
        assert_eq!(runtime.presented(&first).unwrap().0[3], 74.);
        runtime.update(|state, tx| state.dispatch(Command::CompactAccounts(true), tx));
        runtime.frame(1. / 60.);
        assert_eq!(runtime.presented(&first).unwrap().0[3], 48.);
        assert_eq!(runtime.state.selected, Some(1));
        assert_eq!(runtime.state.appearance_pending["compactAccounts"], json!(true));
        runtime.update(|_, tx| tx.scroll_into_view(last.clone()));
        for _ in 0..90 {
            runtime.frame(1. / 60.);
        }
        assert!(
            runtime.find(&last).is_some(),
            "Keyboard navigation reaches an unmounted row"
        );
        assert!(
            runtime
                .elements()
                .iter()
                .filter(|element| element.role == "row")
                .count()
                < 100
        );
    }
}
