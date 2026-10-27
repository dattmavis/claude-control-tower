import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'tower-sidebar',
  component: 'Pane',
  requestId: 'tower',
  props: {
    title: 'Tower',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const AGENDA = JSON.stringify({
  updatedAt: '2026-10-24T18:55:00-07:00',
  prs: [{ text: '#42 Usage panel', note: 'waiting on the partner team', url: 'https://github.com/x/y/pull/42' }],
  decisions: [],
  tasks: [{ text: 'PROJ-123 due Friday' }],
  waiting: [
    { text: 'Engineer: the fix on #42', group: 'AI team' },
    { text: 'Laptop access request', group: 'IT & DevOps' },
    { text: 'Partner: UI fixes to QA', group: 'Partner team' },
  ],
  emails: [{ text: 'Re: data residency question', note: 'Customer asks for a call slot', url: 'https://outlook.office.com/mail/id/abc' }],
  meetings: [
    {
      text: 'Mon 09:00 Team stand-up',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0',
    },
  ],
  sources: [{ name: 'Teams', ok: false, note: 'needs sign-in' }],
})

const STATUS = [
  '| Workstream | Session | State | Waiting on | Next | Notes |',
  '|---|---|---|---|---|---|',
  '| Usage spike on the app | BILLING SPIKE | Blocked on others | Partner team | x | y |',
  '| Security follow-ups | none | Waiting | Engineer | x | y |',
  '| Onboarding guide | ONBOARDING GUIDE | Waiting | Colleague | x | y |',
].join('\n')

test('the pane draws cards, links, states and the source warning', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tower' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('.json') ? AGENDA : STATUS }))
  const launches: string[][] = []
  on('process.run', (_, e) => {
    if (e.argv.includes('-ResumeLatest')) launches.push([...e.argv])
    if (e.argv.some(arg => arg.endsWith('untracked.ps1'))) {
      return {
        value: {
          exitCode: 0,
          stdout: JSON.stringify([{ name: 'QUICK EXPERIMENT', lastUsed: '2026-10-24T22:00:00Z' }]),
          stderr: '',
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      }
    }
    return {
    value: {
      exitCode: 0,
      stdout: JSON.stringify([{ name: 'BILLING SPIKE', status: 'busy' }]),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
    }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.parse('2026-10-24T19:10:00-07:00') }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isNotified: true } }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {},
      rateLimits: [
        { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-24T21:20:00-07:00' },
        { kind: 'seven_day', percentUsed: 91.5, resetsAt: '2026-10-28T09:00:00-07:00' },
        { kind: 'seven_day_opus', percentUsed: 5 },
      ],
    },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /CONTROL TOWER/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /PRs awaiting approval/ })).toBeDefined()
    expect(await ui.find({ type: 'Link' })).toBeDefined()
    expect(
      await ui.find({ type: 'Link', props: { href: 'msteams:/l/meetup-join/19%3ameeting_abc%40thread.v2/0' } }),
    ).toBeDefined()
    expect(await ui.find({ type: 'Link', props: { href: 'https://github.com/x/y/pull/42' } })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Emails/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Architecture decisions · clear/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Couldn't reach Teams/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /BILLING SPIKE/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Session/ })).toBeDefined()
    // Workstreams show the session's tab name; one with a session is a button, one without is plain.
    expect(await ui.find({ type: 'Button', key: 'ws-BILLING SPIKE' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'ws-ONBOARDING GUIDE' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Security follow-ups/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /open · Blocked on others/ })).toBeDefined()
    // Sessions no row tracks draw under Not tracked, and reopen like the rest.
    expect(await ui.find({ type: 'Text', text: /NOT TRACKED/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'un-QUICK EXPERIMENT' })).toBeDefined()
    // Waiting on others draws under group headings.
    expect(await ui.find({ type: 'Text', text: /^Partner team$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^IT & DevOps$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2h 10m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Weekly/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /92%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /3d 13h/ })).toBeDefined()
    // This agenda predates the worth section, so it folds to its quiet line.
    expect(await ui.find({ type: 'Text', text: /Worth a look · clear/ })).toBeDefined()
    await ui.unmount()
  }

  // Pressing a closed workstream reopens its newest session; an open one only says so.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'ws-ONBOARDING GUIDE' })
  await ui.press({ key: 'ws-BILLING SPIKE' })
  await ui.press({ key: 'un-QUICK EXPERIMENT' })
  await ui.unmount()
  expect(launches.length).toBe(2)
  expect(launches[1]).toContain('QUICK-EXPERIMENT')
  expect(launches[0]).toContain('ONBOARDING-GUIDE')
  expect(launches[0]).toContain('-ResumeLatest')
})

test('worth a look shows at most five lines', async ($, on) => {
  const worth = [1, 2, 3, 4, 5, 6, 7].map(n => ({ text: `Could help ${n}`, note: 'cheapest move: point to the internal docs' }))
  const agenda = JSON.stringify({
    updatedAt: '2026-10-24T18:55:00-07:00',
    prs: [],
    decisions: [],
    tasks: [],
    worth,
    waiting: [],
    meetings: [],
  })
  on('command.register', () => ({ value: { command: 'tower' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('.json') ? agenda : STATUS }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '[]', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.parse('2026-10-24T19:10:00-07:00') }))
  on('clock.every', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [] } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Worth a look/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Could help 5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Could help 6/ })).toBeUndefined()
  await ui.unmount()
})
