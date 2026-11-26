use anyhow::{Context, Result, bail};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::mpsc::{self, Receiver},
};

#[cfg(debug_assertions)]
use std::path::PathBuf;

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub name: String,
    pub start_url: String,
    pub sso_region: String,
    pub default_region: String,
    pub authenticated: bool,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub account_id: String,
    pub name: String,
    pub roles: Vec<String>,
    pub roles_loaded: bool,
    pub preferred_role: Option<String>,
    pub region: Option<String>,
    pub profiles: std::collections::HashMap<String, String>,
    pub last_profile: Option<String>,
    pub pinned: bool,
    pub group: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credential {
    pub profile_name: String,
    pub account_id: String,
    pub account_name: String,
    pub role_name: String,
    pub session_name: String,
    pub expiration: String,
    pub is_default: bool,
    pub region: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub sessions: Vec<Session>,
    pub session: Option<String>,
    pub accounts: Vec<Account>,
    pub collapsed_groups: Vec<String>,
    pub credentials: Vec<Credential>,
    pub last_account: Option<String>,
    pub last_session: Option<String>,
}

pub struct Sdk {
    child: Child,
    input: ChildStdin,
    replies: Receiver<Result<Value>>,
}

pub enum RefreshEvent {
    Complete(u64, Result<Value>),
    Disconnected,
}

fn read_replies(
    output: ChildStdout,
    replies: mpsc::Sender<Result<Value>>,
    refresh: impl Fn(RefreshEvent),
) {
    for line in BufReader::new(output).lines() {
        let Ok(line) = line else { break };
        let result = serde_json::from_str::<Value>(&line).context("Invalid SDK response");
        let id = result.as_ref().ok().and_then(|value| value["id"].as_u64());
        let result = result.and_then(|response| {
            if let Some(error) = response["error"].as_str() {
                bail!("{error}");
            }
            response
                .get("result")
                .cloned()
                .context("Missing SDK result")
        });
        if let Some(id) = id {
            refresh(RefreshEvent::Complete(id, result));
        } else if replies.send(result).is_err() {
            break;
        }
    }
    refresh(RefreshEvent::Disconnected);
}

impl Sdk {
    pub fn start(refresh: impl Fn(RefreshEvent) + Send + 'static) -> Result<Self> {
        let executable = std::env::current_exe()?;
        let bundled = executable
            .parent()
            .context("Missing application directory")?
            .join(if cfg!(target_os = "windows") {
                "awsesh-sdk.exe"
            } else {
                "awsesh-sdk"
            });
        let mut command = if bundled.is_file() {
            Command::new(bundled)
        } else {
            #[cfg(debug_assertions)]
            {
                let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bridge/index.ts");
                let mut command =
                    Command::new(std::env::var_os("AWSESH_BUN").unwrap_or_else(|| "bun".into()));
                command.arg("run").arg(source);
                command
            }
            #[cfg(not(debug_assertions))]
            {
                bail!("The bundled SDK helper is missing beside the application. Reinstall Sesh.");
            }
        };
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context(
                "Cannot start the SDK helper. Install Bun for development, or use a packaged build with the bundled helper.",
            )?;
        let input = child.stdin.take().context("Missing SDK input")?;
        let output = child.stdout.take().context("Missing SDK output")?;
        let (sender, replies) = mpsc::channel();
        std::thread::spawn(move || read_replies(output, sender, refresh));
        Ok(Self {
            child,
            input,
            replies,
        })
    }

    fn send(&mut self, operation: &str, args: Value, id: Option<u64>) -> Result<()> {
        let mut request = json!({ "operation": operation, "args": args });
        if let Some(id) = id {
            request["id"] = json!(id);
        }
        serde_json::to_writer(&mut self.input, &request)?;
        self.input.write_all(b"\n")?;
        self.input.flush()?;
        Ok(())
    }

    pub fn request(&mut self, operation: &str, args: Value) -> Result<Value> {
        self.send(operation, args, None)?;
        self.replies
            .recv()
            .context("The SDK helper stopped unexpectedly. Restart Sesh.")?
    }

    pub fn revalidate_accounts(&mut self, id: u64, args: Value) -> Result<()> {
        self.send("revalidateAccounts", args, Some(id))
    }
}

impl Drop for Sdk {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
