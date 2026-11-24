import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'
import { fuzzy } from './fuzzy'

type Api = Parameters<Hook<'session.start'>>[0]

// What `awsesh agent` keeps for this session
type AgentSession = { id: string; configFile: string; org?: string; accountName?: string; role?: string; region?: string }

// The project's .sesh/scope.json, as awsesh reads it
type ScopeRule = { match: string; ask: boolean }
type Scope = { path: string; default?: string; allow: ScopeRule[] }

// What a switch would land on, from `awsesh agent use --check`
type Resolved = { org: string; accountName: string; role: string; ask: boolean; rule?: string; scoped: boolean; loggedIn: boolean }

type Org = { name: string; authenticated: boolean }
type CachedAccount = { accountId: string; name: string; roles?: string[] }
type Suggestion = { text: string; description?: string }
type Outcome<T> = { ok: true; value: T } | { ok: false; message: string }

// awsesh on PATH, which needs the `agent` commands
const AWSESH = 'awsesh'
// The slash command you type to show or switch the account
const COMMAND = 'sesh'
const COMMAND_PREFIX = `/${COMMAND} `
const STATUS_POLL_MS = 3000
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000
const MAX_SUGGESTIONS = 20
const MAX_BAND_ROWS = 12
const TOOLS = {
  list: 'list_aws_accounts',
  scope: 'set_aws_scope',
  use: 'use_aws_account',
} as const
const toolName = <N extends string,>(name: N) => `mcp__awsesh__${name}` as const

// Ways a Bash command could pick other credentials than the session's, or change the scope behind the user's back.
// Assignments only count where the shell would run them, not inside quoted text.
const ASSIGNS_CREDENTIALS =
  /(?:^|[;&|(]|\b(?:export|env))\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*AWS_(?:PROFILE|CONFIG_FILE|ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)=/
const PICKS_CREDENTIALS = /--profile(?:\s|=)|\b(?:awsesh|sesh)\s+(?:set|session|agent)\b|\.sesh\b/
const bypassesMod = (command: string) => ASSIGNS_CREDENTIALS.test(command) || PICKS_CREDENTIALS.test(command)

const draft = atom({ plugin: 'awsesh', key: 'draft' } as const, '')

let sessionId: string | undefined
let root: string | undefined
let current: AgentSession | undefined
let scope: Scope | undefined
let toldModel: string | undefined
let switchedHere: string | undefined
let draftIsCommand = false
let orgCache: Org[] | undefined
const accountCache = new Map<string, CachedAccount[]>()

const label = (s: { org?: string; accountName?: string; role?: string } | undefined) =>
  s?.accountName ? `${s.org} / ${s.accountName} · ${s.role}` : undefined

const lastLine = (text: string) => text.trim().split('\n').filter(Boolean).pop() ?? ''

const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '')

const glob = (pattern: string) =>
  new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i')

// Runs `awsesh <args>` and reads its JSON; awsesh owns everything AWS, scopes included
const awsesh = async <T,>($: Api, args: string[], stdin = ''): Promise<Outcome<T>> => {
  try {
    const result = await $.process.run([AWSESH, ...args], { timeoutMs: 60_000, stdin })
    if (result.exitCode !== 0) return { ok: false, message: lastLine(result.stderr) || lastLine(result.stdout) }
    return { ok: true, value: JSON.parse(result.stdout) as T }
  } catch (error) {
    return { ok: false, message: String(error) }
  }
}

// What /sesh asks Claude when the project has no scope yet, starting from what you typed after it
const setupPrompt = (wanted: string) =>
  [
    "Set up this project's AWS scope with awsesh.",
    wanted ? `I want this session on ${wanted}, so start the scope there.` : 'Ask me which accounts this project needs.',
    `Look up my SSO sessions and accounts with ${toolName(TOOLS.list)} and propose the scope with ${toolName(TOOLS.scope)}.`,
  ].join(' ')

const scopeSummary = () =>
  scope
    ? scope.allow.map((rule) => `${rule.match}${rule.ask ? ' (asks first)' : ''}`).join(', ')
    : 'no scope yet (.sesh/scope.json)'

// Shows what the session uses now; a switch made elsewhere also gets a toast
const showStatus = ($: Api, session: AgentSession) => {
  const now = label(session)
  const before = label(current)
  current = session
  $.ui.status(now ? `${now} · ${session.region}` : 'no AWS account yet')
  if (now && before && now !== before && now !== switchedHere) $.ui.toast(`AWS account switched to ${now}`)
  switchedHere = undefined
}

// PoC: reads the session's record straight from awsesh's storage, cheaper than running awsesh every few seconds
const refreshStatus = async ($: Api) => {
  if (!sessionId) return
  const base = (await $.env.get('XDG_DATA_HOME')) || `${await $.env.get('HOME')}/.local/share`
  try {
    const session = JSON.parse(String(await $.fs.read(`${base}/awsesh/storage/agent/${sessionId}.json`))) as AgentSession
    if (label(session) !== label(current)) showStatus($, session)
  } catch {
    // Not registered yet, or ended
  }
}

const refreshScope = async ($: Api) => {
  if (!sessionId) return
  const status = await awsesh<{ scope: Scope | null }>($, ['agent', 'status', '--id', sessionId])
  if (status.ok) scope = status.value.scope ?? undefined
}

const useAccount = async ($: Api, org: string, account: string, role: string | undefined): Promise<Outcome<AgentSession>> => {
  if (!sessionId) return { ok: false, message: 'The awsesh mod has no session yet.' }
  const used = await awsesh<AgentSession>($, ['agent', 'use', '--id', sessionId, org, account, ...(role ? [role] : [])])
  if (used.ok) {
    switchedHere = label(used.value)
    showStatus($, used.value)
  }
  return used
}

// Runs awsesh's device login: it opens the browser, and approving the code there is the consent
const login = async ($: Api, org: string): Promise<Outcome<null>> => {
  $.ui.status(`Logging in to ${org}: approve the request in your browser`)
  const stream = $.process.spawn({ argv: [AWSESH, 'auth', org] })
  const deadline = Date.now() + LOGIN_TIMEOUT_MS
  let output = ''
  for await (const chunk of stream) {
    output += stripAnsi(chunk.text)
    const url = output.match(/URL:\s*(\S+)/)?.[1]
    const code = output.match(/Code:\s*(\S+)/)?.[1]
    if (url && code) $.ui.status(`Logging in to ${org}: approve code ${code} at ${url}`)
    if (Date.now() > deadline) break
  }
  const { code } = await stream.result.catch(() => ({ code: null }))
  orgCache = undefined
  if (current) showStatus($, current)
  return code === 0 ? { ok: true, value: null } : { ok: false, message: `The login to ${org} did not finish. ${lastLine(output)}`.trim() }
}

// When Claude needs an org whose login expired, it asks you first; a login you start with /sesh doesn't
const offerLogin = async ($: Api, org: string): Promise<Outcome<null>> => {
  let answer = 'Not now'
  try {
    answer = await $.ui.ask(`Your awsesh login for ${org} has expired. Log in now? Your browser will open.`, ['Log in', 'Not now'])
  } catch {
    // Dismissed, or nobody to ask
  }
  if (answer !== 'Log in') return { ok: false, message: `The awsesh login for ${org} has expired and the user chose not to log in now.` }
  return login($, org)
}

// Registers this Claude session with awsesh and points its commands at the session's AWS config; once per load
let started: Promise<void> | undefined
const start = ($: Api) => {
  started ??= (async () => {
    sessionId = await $.session.id()
    root = await $.session.root()
    const registered = await awsesh<{ session: AgentSession; scope: Scope | null; note: string | null }>($, [
      'agent', 'register', '--id', sessionId, '--cwd', root, '--agent', 'claude', '--bin', AWSESH,
    ])
    if (!registered.ok) {
      $.ui.status(`awsesh agent register failed: ${registered.message}`)
      return
    }
    scope = registered.value.scope ?? undefined

    // The session's commands get credentials only through its awsesh config
    await $.env.set('AWS_CONFIG_FILE', registered.value.session.configFile)
    await $.env.set('AWS_PROFILE', 'awsesh')
    await $.env.set('AWS_SHARED_CREDENTIALS_FILE', '/dev/null')
    await $.env.set('AWSESH_AGENT_SESSION', sessionId)
    await $.env.set('AWS_ACCESS_KEY_ID', undefined)
    await $.env.set('AWS_SECRET_ACCESS_KEY', undefined)
    await $.env.set('AWS_SESSION_TOKEN', undefined)
    await $.env.set('AWS_SESSION_EXPIRATION', undefined)
    await $.env.set('AWS_REGION', undefined)
    await $.env.set('AWS_DEFAULT_REGION', undefined)
    // Left by the earlier version of this mod, which put keys in the environment
    await $.env.set('AWSESH_MOD', undefined)
    await $.env.set('AWSESH_SESSION_NAME', undefined)
    await $.env.set('AWSESH_ACCOUNT_NAME', undefined)
    await $.env.set('AWSESH_ACCOUNT_ID', undefined)
    await $.env.set('AWSESH_ROLE_NAME', undefined)

    showStatus($, registered.value.session)
    if (registered.value.note) $.ui.status(registered.value.note)
  })()
  return started
}

const knownOrgs = async ($: Api, fresh = false) => {
  if (orgCache && !fresh) return orgCache
  const listed = await awsesh<Org[]>($, ['sessions', '--json'])
  // Only a real answer is kept, so one failed call doesn't hide the SSO sessions for the rest of the session
  if (listed.ok) orgCache = listed.value
  return orgCache ?? []
}

const cachedAccounts = async ($: Api, org: string) => {
  const hit = accountCache.get(org)
  if (hit) return hit
  const listed = await awsesh<CachedAccount[]>($, ['accounts', org, '--cached', '--json'])
  const accounts = listed.ok ? listed.value : []
  accountCache.set(org, accounts)
  return accounts
}

// Whether the scope lets this session near an account at all, for suggestions; awsesh has the final say
const inScope = (org: string, account: CachedAccount) =>
  !scope || scope.allow.some((rule) => (account.roles ?? ['*']).some((role) => glob(rule.match).test(`${org}/${account.name}/${role}`)))

// Rows for the word being typed after /sesh: org or account, then account or role, then role
const awsSuggestions = async ($: Api, before: string[], token: string): Promise<Suggestion[]> => {
  const orgs = await knownOrgs($)
  const accountRows = async (org: string) =>
    fuzzy((await cachedAccounts($, org)).filter((a) => inScope(org, a)), (a) => a.name, token).map((a) => ({
      text: a.name,
      description: [a.accountId, a.roles?.join(', ')].filter(Boolean).join(' · '),
    }))
  const roleRows = async (org: string, account: string) => {
    const found = (await cachedAccounts($, org)).find((a) => a.name.toLowerCase() === account.toLowerCase())
    return fuzzy(found?.roles ?? [], (r) => r, token).map((role) => ({ text: role, description: `${account} role` }))
  }
  const orgNamed = orgs.find((o) => o.name.toLowerCase() === (before[0] ?? '').toLowerCase())

  if (before.length === 0) {
    const orgRows = fuzzy(orgs, (o) => o.name, token).map((o) => ({
      text: o.name,
      description: o.authenticated ? 'SSO session · logged in' : 'SSO session · login expired',
    }))
    return [...orgRows, ...(current?.org ? await accountRows(current.org) : [])]
  }
  if (before.length === 1) {
    if (orgNamed) return accountRows(orgNamed.name)
    return current?.org ? roleRows(current.org, before[0] ?? '') : []
  }
  if (before.length === 2 && orgNamed) return roleRows(orgNamed.name, before[1] ?? '')
  return []
}

const registerTools = async ($: Api) => {
  await $.tool.register({
    name: TOOLS.list,
    description:
      "Lists the user's awsesh SSO sessions (orgs), or one org's accounts and roles. Read only. " +
      'Use it to propose an AWS scope for this project with set_aws_scope.',
    inputSchema: {
      type: 'object',
      properties: { org: { type: 'string', description: 'SSO session name; leave out to list the SSO sessions' } },
    },
  })
  await $.tool.register({
    name: TOOLS.scope,
    description:
      "Proposes this project's AWS scope (.sesh/scope.json): which org/account/role this session may use, and which " +
      'of them need the user to confirm each switch. The user approves it before it is saved. Rules are org/account/role ' +
      'with * wildcards. Propose only what the task needs, and set ask for production or anything risky.',
    inputSchema: {
      type: 'object',
      properties: {
        default: { type: 'string', description: 'org/account/role to start sessions on' },
        allow: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              match: { type: 'string', description: 'org/account/role, * allowed in each part' },
              ask: { type: 'boolean', description: 'Ask the user before each switch to this' },
            },
            required: ['match'],
          },
        },
      },
      required: ['allow'],
    },
  })
  await $.tool.register({
    name: TOOLS.use,
    description:
      "Switches the AWS account (and optionally role) this session's shell commands use, within the project's AWS scope. " +
      'Some accounts ask the user first. Use it whenever a task needs another account; never pass --profile or set AWS ' +
      'credential variables instead. Without a scope, propose one with list_aws_accounts and set_aws_scope. If AWS ' +
      'commands fail because the awsesh login expired, call this again for the same account: it offers the user a login.',
    inputSchema: {
      type: 'object',
      properties: {
        org: { type: 'string', description: "SSO session name; defaults to the session's current one" },
        account: { type: 'string', description: 'Account name, as awsesh lists it' },
        role: { type: 'string', description: 'Role name; leave out for a role the scope allows without asking, and name a role only when the task needs more access' },
      },
      required: ['account'],
    },
  })
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await start($)
    await registerTools($)
    await $.command.register({
      name: COMMAND,
      description: "Show or switch this session's AWS account, within the project's scope",
      argumentHint: '[org] [account] [role]',
    })
    $.clock.every(STATUS_POLL_MS, () => void refreshStatus($))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (sessionId) await awsesh($, ['agent', 'end', '--id', sessionId])
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    await start($)
    await refreshScope($)
    const words = e.args.trim().split(/\s+/).filter(Boolean)
    // No scope yet: Claude proposes one for you to approve. awsesh alone would allow any account here.
    // Submitted once this command has finished, since a turn can't start while its hook runs
    if (!scope) {
      const text = setupPrompt(words.join(' '))
      $.clock.after(0, () => void $.prompt.submit({ text }))
      return { text: 'This project has no AWS scope yet. Claude will propose one for you to approve.' }
    }
    if (words.length === 0) {
      return { text: `This session uses ${label(current) ?? 'no AWS account yet'}. Scope: ${scopeSummary()}` }
    }

    // A fresh list, so the first word is recognized as an SSO session whenever it is one
    const orgs = await knownOrgs($, true)
    const named = orgs.find((o) => o.name.toLowerCase() === (words[0] ?? '').toLowerCase())
    const [account, role] = named ? words.slice(1) : words
    const org = named?.name ?? current?.org ?? scope?.default?.split('/')[0]
    if (!org || !account) return { text: `Usage: /${COMMAND} <org> <account> [role]. Orgs: ${orgs.map((o) => o.name).join(', ')}` }
    // You typed it, so no question; awsesh still holds it to the scope, and an expired login just starts the login
    if (orgs.find((o) => o.name === org)?.authenticated === false) {
      const loggedIn = await login($, org)
      if (!loggedIn.ok) return { text: loggedIn.message }
    }
    const used = await useAccount($, org, account, role)
    return { text: used.ok ? `This session now uses ${label(used.value)} in ${used.value.region}.` : used.message }
  })

  // The tools ask the user themselves where the scope says so
  on('tool.check', { tool: [toolName(TOOLS.list), toolName(TOOLS.scope), toolName(TOOLS.use)] }, async () => ({ decision: 'allow' }))

  on('tool.call', { tool: toolName(TOOLS.list) }, async ($, e) => {
    const input = e as unknown as { org?: string }
    if (!input.org) {
      orgCache = undefined
      return { result: JSON.stringify(await knownOrgs($)) }
    }
    accountCache.delete(input.org)
    const accounts = await cachedAccounts($, input.org)
    return { result: accounts.length ? JSON.stringify(accounts) : `No cached accounts for ${input.org}. The user can open awsesh once to load them.` }
  })

  on('tool.call', { tool: toolName(TOOLS.scope) }, async ($, e) => {
    await start($)
    const input = e as unknown as { default?: string; allow?: { match: string; ask?: boolean }[] }
    const allow = (input.allow ?? []).map((rule) => ({ match: rule.match, ask: rule.ask === true }))
    if (allow.length === 0) return { result: 'A scope needs at least one allow rule.' }

    const lines = allow.map((rule) => `• ${rule.match}${rule.ask ? '  (asks you first)' : ''}`)
    const question = [`Save this AWS scope for ${root}?`, ...lines, ...(input.default ? [`Starts on: ${input.default}`] : [])].join('\n')
    let answer = 'Cancel'
    try {
      answer = await $.ui.ask(question, ['Save scope', 'Cancel'])
    } catch {
      // Dismissed, or nobody to ask
    }
    if (answer !== 'Save scope') return { result: 'The user did not approve the scope. Ask them what to change.' }

    const saved = await awsesh<Scope>($, ['agent', 'scope', '--cwd', root ?? '.', '--set'], JSON.stringify({ default: input.default, allow }))
    if (!saved.ok) return { result: `awsesh refused the scope: ${saved.message}` }
    scope = saved.value
    if (!current?.accountName && input.default) {
      const [org, account, role] = input.default.split('/')
      await useAccount($, org ?? '', account ?? '', role)
    }
    return { result: `Saved ${scope.path}. ${label(current) ? `This session uses ${label(current)}.` : ''}`.trim() }
  })

  on('tool.call', { tool: toolName(TOOLS.use) }, async ($, e) => {
    await start($)
    const input = e as unknown as { org?: string; account?: string; role?: string }
    const org = input.org ?? current?.org ?? scope?.default?.split('/')[0]
    if (!org) return { result: 'Which SSO session? Call list_aws_accounts to see them.' }
    if (!sessionId) return { result: 'The awsesh mod has no session yet.' }

    const check = await awsesh<Resolved>($, [
      'agent', 'use', '--id', sessionId, org, input.account ?? '', ...(input.role ? [input.role] : []), '--check',
    ])
    if (!check.ok) return { result: check.message }
    if (!check.value.scoped) {
      return {
        result:
          'This project has no AWS scope yet, so no account can be used. Ask the user which accounts the task needs, ' +
          'look them up with list_aws_accounts, and propose a scope with set_aws_scope.',
      }
    }
    if (check.value.ask) {
      let answer = 'Deny'
      try {
        answer = await $.ui.ask(`Claude wants to use ${label(check.value)} (scope rule ${check.value.rule} asks first). Allow?`, [
          'Allow',
          'Deny',
        ])
      } catch {
        // Dismissed, or nobody to ask
      }
      if (answer !== 'Allow') return { result: `The user denied ${label(check.value)}. This session stays on ${label(current) ?? 'no account'}.` }
    }
    if (!check.value.loggedIn) {
      const loggedIn = await offerLogin($, check.value.org)
      if (!loggedIn.ok) return { result: loggedIn.message }
    }
    const used = await useAccount($, check.value.org, check.value.accountName, check.value.role)
    return { result: used.ok ? `This session now uses ${label(used.value)} in ${used.value.region}.` : used.message }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (sessionId && bypassesMod(e.command)) {
      return {
        deny:
          "AWS credentials and the project's AWS scope are managed by awsesh. To use another account, call " +
          `${toolName(TOOLS.use)}; to change the scope, call ${toolName(TOOLS.scope)}. Don't pass --profile, set AWS ` +
          'credential variables, or touch .sesh/.',
      }
    }
    return next(e)
  })

  // The scope file changes only through set_aws_scope, which the user approves
  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const path = (e as unknown as { file_path?: string; notebook_path?: string }).file_path ?? ''
    if (sessionId && /(^|\/)\.sesh\//.test(path)) {
      return { deny: `The AWS scope changes only through ${toolName(TOOLS.scope)}, which the user approves.` }
    }
    return next(e)
  })

  // Typeahead for /sesh once a word has begun: SSO sessions, accounts and roles from awsesh's cache
  on('prompt.autocomplete', async ($, e, next) => {
    if (!e.text.startsWith(COMMAND_PREFIX)) return next(e)
    await start($)
    const before = e.text.slice(0, e.start).trim().split(/\s+/).slice(1)
    const rows = (await awsSuggestions($, before, e.token)).slice(0, MAX_SUGGESTIONS)
    const { suggestions } = await next(e)
    return { suggestions: [...suggestions, ...rows] }
  })

  // Remember the draft while it's a /sesh command, so the band can offer the next word before one is typed
  on('prompt.edit', async ($, e, next) => {
    const edited = await next(e)
    const isCommand = edited.text.startsWith(COMMAND_PREFIX)
    if (isCommand || draftIsCommand) void update($, draft, () => (isCommand ? edited.text : ''))
    draftIsCommand = isCommand
    return edited
  })

  // The band above the prompt: the choices for the next word of /sesh, pressable
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const text = await read($, draft)
    if (e.props.hasSurvey || !text.startsWith(COMMAND_PREFIX) || !/\s$/.test(text)) return next(e)
    const before = text.trim().split(/\s+/).slice(1)
    const rows = (await awsSuggestions($, before, '')).slice(0, MAX_BAND_ROWS)
    if (rows.length === 0) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Text dimColor>Next:</Text>
        {rows.map((row) => (
          <Button
            key={`next-${row.text}`}
            plain
            label={row.text}
            onPress={() => void $.prompt.fill({ text: `${text}${row.text} `, mode: 'replace' })}
          />
        ))}
      </Box>
    )
  })

  // Tell Claude which account its commands run as and what the scope allows, whenever that changes
  on('prompt.submit', async ($, e, next) => {
    const now = `${label(current) ?? 'none'}|${scopeSummary()}`
    if (toldModel === now) return next(e)
    toldModel = now
    const note = current?.accountName
      ? `AWS: this session's shell commands run as ${label(current)} in ${current.region}, through awsesh. Scope: ${scopeSummary()}. ` +
        `To use another account, call ${toolName(TOOLS.use)}.`
      : `AWS: no account is set for this session. Scope: ${scopeSummary()}. When a task needs AWS, call ${toolName(TOOLS.use)}; ` +
        `without a scope, propose one with ${toolName(TOOLS.list)} and ${toolName(TOOLS.scope)}.`
    return next({ ...e, context: [...(e.context ?? []), note] })
  })
}
