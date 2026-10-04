use anyhow::{Context, Result, bail};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

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
    pub credentials: Vec<Credential>,
    pub last_account: Option<String>,
    pub last_session: Option<String>,
}

pub struct Sdk {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}

impl Sdk {
    pub fn start() -> Result<Self> {
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
            let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bridge/index.ts");
            let mut command =
                Command::new(std::env::var_os("AWSESH_BUN").unwrap_or_else(|| "bun".into()));
            command.arg("run").arg(source);
            command
        };
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context(
                "Cannot start the SDK helper. Install Bun for development, or build Sesh.app",
            )?;
        let input = child.stdin.take().context("Missing SDK input")?;
        let output = BufReader::new(child.stdout.take().context("Missing SDK output")?);
        Ok(Self {
            child,
            input,
            output,
        })
    }

    pub fn request(&mut self, operation: &str, args: Value) -> Result<Value> {
        serde_json::to_writer(
            &mut self.input,
            &json!({ "operation": operation, "args": args }),
        )?;
        self.input.write_all(b"\n")?;
        self.input.flush()?;
        let mut line = String::new();
        if self.output.read_line(&mut line)? == 0 {
            bail!("The SDK helper stopped unexpectedly. Restart Sesh.");
        }
        let response: Value = serde_json::from_str(&line).context("Invalid SDK response")?;
        if let Some(error) = response.get("error").and_then(Value::as_str) {
            bail!("{error}");
        }
        response
            .get("result")
            .cloned()
            .context("Missing SDK result")
    }
}

impl Drop for Sdk {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
