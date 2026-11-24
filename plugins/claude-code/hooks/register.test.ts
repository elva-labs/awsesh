import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const SCOPE = {
  path: '/proj/.sesh/scope.json',
  default: 'my-org/dev/Developer',
  allow: [
    { match: 'my-org/dev/*', ask: false },
    { match: 'my-org/prod/*', ask: true },
  ],
}

const ran = (stdout: string, exitCode = 0, stderr = '') => ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

// Stubs Claude Code's session and the awsesh CLI, which owns the scope; returns what the mod ran, set and asked
const world = (on: On, options: { scoped?: boolean; answer?: string; loggedIn?: boolean } = {}) => {
  const env: Record<string, string | undefined> = {}
  const runs: string[][] = []
  const stdins: string[] = []
  const asked: string[] = []
  const submitted: string[] = []
  const scoped = options.scoped ?? true
  const loggedIn = options.loggedIn ?? true
  on('session.id', async () => ({ value: 'sess-1' }))
  on('session.root', async () => ({ value: '/proj' }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  // $.ui.ask opens Claude Code's own AskUserQuestion dialog; this answers it
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e) => {
    const questions = (e as unknown as { questions: { question: string }[] }).questions
    const question = questions[0]?.question ?? ''
    asked.push(question)
    return { result: { questions, answers: { [question]: options.answer ?? 'Allow' } } }
  })
  // $.prompt.submit starts a turn of Claude's; this records what it was asked
  on('prompt.submit', async ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('env.get', async ($, e) => ({ value: env[e.name] }))
  on('env.set', async ($, e) => {
    env[e.name] = e.value
    return { value: undefined }
  })
  on('tool.register', async ($, e) => ({ value: { tool: `mcp__awsesh__${e.name}` } }))
  on('process.run', async ($, e) => {
    const argv = e.argv.slice(1)
    runs.push(argv)
    if (e.init?.stdin) stdins.push(e.init.stdin)
    const [first, second] = argv
    if (first === 'agent' && second === 'register') {
      return { value: ran(JSON.stringify({ session: { id: 'sess-1', configFile: '/data/agent/sess-1.config' }, scope: scoped ? SCOPE : null, note: null })) }
    }
    if (first === 'agent' && second === 'status') return { value: ran(JSON.stringify({ scope: scoped ? SCOPE : null })) }
    if (first === 'agent' && second === 'scope') return { value: ran(JSON.stringify(SCOPE)) }
    if (first === 'agent' && second === 'use') {
      const [org, account, role] = argv.slice(4).filter((a) => a !== '--check')
      if (account === 'other') return { value: ran('', 1, 'my-org/other/* is outside this project\'s scope') }
      const resolved = { org, accountName: account, role: role ?? 'Developer', region: 'eu-west-1' }
      if (argv.includes('--check')) {
        return { value: ran(JSON.stringify({ ...resolved, ask: account === 'prod', rule: `my-org/${account}/*`, scoped, loggedIn })) }
      }
      return { value: ran(JSON.stringify({ id: 'sess-1', configFile: '/data/agent/sess-1.config', ...resolved })) }
    }
    if (first === 'sessions') return { value: ran(JSON.stringify([{ name: 'my-org', authenticated: loggedIn }])) }
    return { value: ran('[]') }
  })
  // awsesh auth: prints the device code, then succeeds once approved
  on('process.spawn', async function* ($, e) {
    runs.push(e.argv.slice(1))
    yield { stream: 'stdout' as const, text: '  URL:  https://example.awsapps.com/start/#/device\n  Code: ABCD-EFGH\n' }
    return { value: { code: 0, signal: null } }
  })
  return { env, runs, stdins, asked, submitted }
}

const sesh = ($: Engine, args: string) =>
  $.command.run({ command: 'sesh', args } as Parameters<Engine['command']['run']>[0])

const useTool = ($: Engine, input: Record<string, string>) =>
  $.tool.call({ tool: 'mcp__awsesh__use_aws_account', ...input } as Parameters<Engine['tool']['call']>[0])

const switches = (runs: string[][]) => runs.filter((argv) => argv[1] === 'use' && !argv.includes('--check'))

test('the session is registered and its commands point at its awsesh config', async ($, on) => {
  const { env, runs } = world(on)
  const out = await sesh($, '')
  expect(runs[0]?.slice(0, 4)).toEqual(['agent', 'register', '--id', 'sess-1'])
  expect(env.AWS_CONFIG_FILE).toBe('/data/agent/sess-1.config')
  expect(env.AWS_ACCESS_KEY_ID).toBe(undefined)
  expect(JSON.stringify(out)).toContain('my-org/prod/* (asks first)')
})

test('Claude switches within the scope without asking where the rule allows it', async ($, on) => {
  const { runs, asked } = world(on)
  const out = await useTool($, { org: 'my-org', account: 'dev' })
  expect(asked.length).toBe(0)
  expect(switches(runs).at(-1)).toEqual(['agent', 'use', '--id', 'sess-1', 'my-org', 'dev', 'Developer'])
  expect(JSON.stringify(out)).toContain('my-org / dev · Developer')
})

test('Claude asks first where the rule says so, and switches when allowed', async ($, on) => {
  const { runs, asked } = world(on, { answer: 'Allow' })
  await useTool($, { org: 'my-org', account: 'prod' })
  expect(asked[0]).toContain('my-org / prod')
  expect(switches(runs).length).toBe(1)
})

test('a denied switch leaves the account alone', async ($, on) => {
  const { runs } = world(on, { answer: 'Deny' })
  const out = await useTool($, { org: 'my-org', account: 'prod' })
  expect(switches(runs).length).toBe(0)
  expect(JSON.stringify(out)).toContain('denied')
})

test('outside the scope awsesh refuses', async ($, on) => {
  const { runs } = world(on)
  const out = await useTool($, { org: 'my-org', account: 'other' })
  expect(switches(runs).length).toBe(0)
  expect(JSON.stringify(out)).toContain('outside this project')
})

test('without a scope Claude is sent to propose one', async ($, on) => {
  const { runs } = world(on, { scoped: false })
  const out = await useTool($, { org: 'my-org', account: 'dev' })
  expect(switches(runs).length).toBe(0)
  expect(JSON.stringify(out)).toContain('set_aws_scope')
})

test('a proposed scope is saved through awsesh once the user approves it', async ($, on) => {
  const { stdins, asked } = world(on, { scoped: false, answer: 'Save scope' })
  await $.tool.call({
    tool: 'mcp__awsesh__set_aws_scope',
    default: 'my-org/dev/Developer',
    allow: [{ match: 'my-org/dev/*' }, { match: 'my-org/prod/*', ask: true }],
  } as Parameters<Engine['tool']['call']>[0])
  expect(asked[0]).toContain('my-org/prod/*  (asks you first)')
  expect(JSON.parse(stdins.at(-1) ?? '{}').allow).toEqual([
    { match: 'my-org/dev/*', ask: false },
    { match: 'my-org/prod/*', ask: true },
  ])
})

test('/sesh switches as typed, without asking', async ($, on) => {
  const { runs, asked } = world(on)
  await sesh($, 'prod')
  expect(asked.length).toBe(0)
  expect(switches(runs).at(-1)).toEqual(['agent', 'use', '--id', 'sess-1', 'my-org', 'prod'])
})

test('Claude cannot change the scope or the credentials behind the mod', async ($, on) => {
  world(on)
  on('tool.call', { tool: ['Bash', 'Write'] }, async () => ({ result: 'ran' }))
  await sesh($, '')
  for (const command of ['aws s3 ls --profile prod', 'cat > .sesh/scope.json', 'rm -r .sesh', 'AWS_CONFIG_FILE=x aws s3 ls']) {
    expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command }))).toContain('managed by awsesh')
  }
  const write = await $.tool.call({ tool: 'Write', file_path: '/proj/.sesh/scope.json', content: '{}' })
  expect(JSON.stringify(write)).toContain('only through')
  expect(JSON.stringify(await $.tool.call({ tool: 'Bash', command: 'echo "AWS_PROFILE=$AWS_PROFILE"' }))).toContain('ran')
})

test('/sesh <org> <account> reads the first word as the SSO session', async ($, on) => {
  const { runs } = world(on)
  await sesh($, 'my-org dev')
  expect(switches(runs).at(-1)).toEqual(['agent', 'use', '--id', 'sess-1', 'my-org', 'dev'])
})

const logins = (runs: string[][]) => runs.filter((argv) => argv[0] === 'auth')

test('an expired login is offered, and runs awsesh auth before the switch when accepted', async ($, on) => {
  const { runs, asked } = world(on, { loggedIn: false, answer: 'Log in' })
  const out = await useTool($, { org: 'my-org', account: 'dev' })
  expect(asked[0]).toContain('login for my-org has expired')
  expect(logins(runs)).toEqual([['auth', 'my-org']])
  expect(switches(runs).length).toBe(1)
  expect(JSON.stringify(out)).toContain('my-org / dev')
})

test('declining the login leaves the account alone', async ($, on) => {
  const { runs } = world(on, { loggedIn: false, answer: 'Not now' })
  const out = await useTool($, { org: 'my-org', account: 'dev' })
  expect(logins(runs).length).toBe(0)
  expect(switches(runs).length).toBe(0)
  expect(JSON.stringify(out)).toContain('chose not to log in')
})

test('/sesh logs in without asking when the login has expired', async ($, on) => {
  const { runs, asked } = world(on, { loggedIn: false })
  await sesh($, 'my-org dev')
  expect(asked.length).toBe(0)
  expect(logins(runs)).toEqual([['auth', 'my-org']])
  expect(switches(runs).length).toBe(1)
})

test('/sesh without a scope hands Claude the setup instead of switching', async ($, on) => {
  const { runs, submitted } = world(on, { scoped: false })
  const clock = mock.clock(on)
  const out = await sesh($, 'my-org dev')
  await clock.settle()
  expect(switches(runs).length).toBe(0)
  expect(submitted[0]).toContain('I want this session on my-org dev')
  expect(submitted[0]).toContain('mcp__awsesh__set_aws_scope')
  expect(JSON.stringify(out)).toContain('no AWS scope yet')
})

test('a bare /sesh without a scope asks Claude to find out which accounts the project needs', async ($, on) => {
  const { submitted } = world(on, { scoped: false })
  const clock = mock.clock(on)
  await sesh($, '')
  await clock.settle()
  expect(submitted[0]).toContain('Ask me which accounts')
})

test('/sesh with a scope starts no setup', async ($, on) => {
  const { submitted } = world(on)
  const clock = mock.clock(on)
  await sesh($, '')
  await sesh($, 'my-org dev')
  await clock.settle()
  expect(submitted.length).toBe(0)
})
