# awsesh for Claude Code

A Claude Code mod that lets Claude use AWS through awsesh, within a scope you approve per project. Each Claude session has its own account, Claude switches accounts itself when a task needs another one, and the scope decides which accounts it may use and which it must ask you about first.

Proof of concept. Requires Claude Code 2.1.287 or later, and an `awsesh` on PATH with the `agent` commands. Until a release has them, build this branch and load the mod from the repo:

```sh
bun run --cwd packages/awsesh build --single
PATH="$PWD/packages/awsesh/dist/awsesh-darwin-arm64/bin:$PATH" claude --plugin-dir plugins/claude-code
```

Use the `dist` folder for your platform.

## The scope

`.sesh/scope.json` in the project, found from any subfolder:

```json
{
  "default": "my-org/dev/Developer",
  "allow": [
    "my-org/dev/*",
    "my-org/*-sandbox/*",
    { "match": "my-org/prod/ReadOnly", "ask": false },
    { "match": "my-org/prod/*", "ask": true }
  ]
}
```

- Each rule is `org/account/role`, with `*` wildcards. The first rule that matches decides.
- `ask: true` makes Claude ask you before each switch to that account. Other rules let it switch freely.
- New sessions start on `default`.
- awsesh enforces the scope: anything outside it is refused, whoever asks.

Without a scope, Claude can't use any account. The first time a task needs AWS, or you type `/sesh`, it looks up your SSO sessions and accounts and proposes a scope. You approve it in a dialog before it's saved. Claude can't edit `.sesh/` itself.

## Use it

- Ask Claude to do something in an account. It switches within the scope, asking first where a rule says so.
- `/sesh` shows the current account and the scope. Without a scope it starts the setup instead, and `/sesh <org> <account>` starts it from that account.
- `/sesh <org> <account> [role]` or `/sesh <account> [role]` switches directly, without a question, still within the scope. The typeahead completes each word, and while you type `/sesh ` the band above the prompt lists what can come next.
- The line under the prompt shows the current account.

## How it works

- When a session starts, the mod runs `awsesh agent register`. awsesh writes an AWS config for the session whose `credential_process` is `awsesh agent creds --id <session>`, and the mod points the session's environment at it.
- Every AWS command in the session asks awsesh for keys. awsesh looks up the session's current account, reuses cached keys while they're fresh, and otherwise gets new ones with your SSO login.
- Switching only changes the session's record in awsesh, so the next AWS command uses the new account.
- Claude's commands that pick credentials another way, or touch `.sesh/`, are refused.

The scope is a guard rail against mistakes, not a security boundary: the session runs as you. Scoped IAM roles are the real limit.
