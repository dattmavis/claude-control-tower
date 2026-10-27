import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { Agenda, Item, Limit, Session, Untracked, Workstream } from '../types'

const PANE = 'tower'
// Set this to your tower folder, with forward slashes.
const TOWER = 'C:/Users/you/control-tower'
const AGENDA_FILE = `${TOWER}/whats-next.json`
const STATUS_FILE = `${TOWER}/STATUS.md`
const LAUNCHER = `${TOWER}/new-workstream.ps1`
const MINUTE = 60_000
const HOUR = 60 * MINUTE
// Hourly sweeps run only inside these Pacific hours, so an open tab doesn't sweep all night.
const FIRST_HOUR = 7
const LAST_HOUR = 19

const SWEEP_PROMPT = [
  'Hourly Control Tower sidebar sweep (the standing request from the tower task file).',
  'Run the whats-next skill. It stays read-only: send, post or create nothing.',
  `Then write ${AGENDA_FILE} as JSON: {"updatedAt": ISO time, "prs": [], "decisions": [], "tasks": [], "worth": [], "emails": [], "waiting": [], "meetings": []},`,
  'each item {"text": one short line with the PR/ticket key, "note": optional short context, "url": a clickable link},',
  'url on every item that has one (GitHub PR, Jira browse link, Confluence page, Teams or Outlook weblink); most useful first.',
  "prs = PRs awaiting the user's approval or review. decisions = open architecture/design decisions.",
  'tasks = tickets and work that need the user himself to act, blocking-others or due-soonest first.',
  'emails = Outlook mail from the last two working days that needs the user to reply or act (direct asks, questions to them, approvals),',
  'not newsletters, notifications, FYIs or threads they already answered; note says sender and the ask, url the Outlook weblink.',
  'waiting = what others owe the user, note says who; each waiting item also has "group", who owes it: one of',
  '"Partner team", "AI team", "Product & leadership", "IT & DevOps", "Sales & marketing", "Systems" (automated checks), "Other".',
  'A PR the user reviewed that waits on a fix from its author goes in waiting, not prs, until the author pushes.',
  'meetings = today and tomorrow, time in PT first.',
  'worth = the "Worth a look" lines, built exactly as the skill\'s Worth a look section says, at most 5.',
  'Also "sources": [{"name", "ok", "note"}], one per source tried (GitHub, Teams, Outlook, Calendar, Jira, Sessions);',
  'ok false whenever its MCP or tool was disconnected, errored or needed sign-in, note says what failed.',
  'Reply in chat with at most three lines: only what changed since the last sweep.',
].join(' ')

type SectionKey = 'prs' | 'decisions' | 'tasks' | 'worth' | 'emails' | 'waiting' | 'meetings'

// max caps what a section draws, whatever the sweep wrote.
const SECTIONS: { key: SectionKey; title: string; icon: string; color: Color; max?: number }[] = [
  { key: 'prs', title: 'PRs awaiting approval', icon: '⑂', color: 'merged' },
  { key: 'decisions', title: 'Architecture decisions', icon: '◆', color: 'warning' },
  { key: 'tasks', title: 'Needs you', icon: '●', color: 'claude' },
  { key: 'worth', title: 'Worth a look', icon: '✦', color: 'suggestion', max: 5 },
  { key: 'emails', title: 'Emails', icon: '✉', color: 'warning' },
  { key: 'waiting', title: 'Waiting on others', icon: '◌', color: 'suggestion' },
  { key: 'meetings', title: 'Meetings', icon: '◷', color: 'success' },
]

// The plan usage windows drawn as bars at the top of the pane, in this order.
const LIMITS = [
  { kind: 'five_hour', label: 'Session' },
  { kind: 'seven_day', label: 'Weekly' },
]

function limitColor(percent: number): Color {
  if (percent >= 90) return 'error'
  if (percent >= 70) return 'warning'
  return 'claude'
}

// Time left until a window resets: "35m", "2h 10m", "3d 4h".
function untilReset(resetsAt: string | undefined, nowMs: number): string {
  const resetMs = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(resetMs)) return ''
  const minutes = Math.max(0, Math.round((resetMs - nowMs) / MINUTE))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

function pickLimits(rows: readonly Limit[]): Limit[] {
  return rows
    .filter(row => LIMITS.some(limit => limit.kind === row.kind))
    .map(row => ({ kind: row.kind, percentUsed: row.percentUsed, resetsAt: row.resetsAt }))
}

// STATUS.md states and session states, mapped to a coloured dot.
function stateColor(state: string): Color {
  const s = state.toLowerCase()
  if (s.includes('blocked')) return 'error'
  if (s.includes('live') || s.includes('busy') || s.includes('running')) return 'success'
  if (s.includes('wait') || s.includes('held') || s.includes('others')) return 'warning'
  return 'inactive'
}

// Teams web links open the desktop app instead when the scheme is msteams:. The agenda keeps the
// https form so it still works on a machine without Teams; only the sidebar swaps it.
const TEAMS_WEB = /^https:\/\/teams\.(?:microsoft\.com|cloud\.microsoft)\/l\//i

function desktopLink(url: string): string {
  return url.replace(TEAMS_WEB, 'msteams:/l/')
}

function pacificClock(ms: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(ms)
  } catch {
    return ''
  }
}

// Change the tag when Agenda's fields change, so a stored older shape is dropped.
const agenda = atom({ plugin: 'tower-sidebar', key: 'agenda' } as const, null, { shape: 'agenda-3' })
const workstreams = atom({ plugin: 'tower-sidebar', key: 'workstreams' } as const, [], {
  shape: 'workstreams-2',
})
const sessions = atom({ plugin: 'tower-sidebar', key: 'sessions' } as const, [], { shape: 'sessions-1' })
// The updatedAt of the last sweep already alerted on, kept across reloads so one sweep alerts once.
const alertedFor = atom({ plugin: 'tower-sidebar', key: 'alertedFor' } as const, '', { shape: 'alerted-1' })
// The account's usage windows as the last API response reported them; pushed by session.measure.
const limits = atom({ plugin: 'tower-sidebar', key: 'limits' } as const, [], { shape: 'limits-1' })
// Sessions used lately that no STATUS.md row tracks, from untracked.ps1.
const untracked = atom({ plugin: 'tower-sidebar', key: 'untracked' } as const, [], { shape: 'untracked-1' })
const UNTRACKED_SCRIPT = `${TOWER}/untracked.ps1`
const UNTRACKED_EVERY = 5 * MINUTE
// Module variable: a reload drops it, so the first refresh after a reload checks straight away.
let untrackedCheckedAt = 0

function parseStatus(md: string): Workstream[] {
  return md
    .split('\n')
    .filter(line => line.trim().startsWith('|') && !line.includes('---'))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells.length >= 4 && cells[0] !== 'Workstream')
    .map(cells => ({ name: cells[0] ?? '', session: sessionName(cells[1] ?? ''), state: cells[2] ?? '', waiting: cells[3] ?? '' }))
}

// STATUS.md's Session cell is a tab name, or "none ..." when no session works on it.
function sessionName(cell: string): string {
  return /^none(\s|$)/i.test(cell) ? '' : cell
}

// Groups in the order they draw; a group the sweep invents draws after these, ungrouped items last.
const GROUP_ORDER = ['Partner team', 'AI team', 'Product & leadership', 'IT & DevOps', 'Sales & marketing', 'Systems', 'Other']

function groupItems(items: readonly Item[]): { group: string; items: Item[] }[] {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    const group = item.group?.trim() || 'Other'
    groups.set(group, [...(groups.get(group) ?? []), item])
  }
  const rank = (group: string) => {
    const index = GROUP_ORDER.indexOf(group)
    return index === -1 ? GROUP_ORDER.length - 1 : index
  }
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([group, list]) => ({ group, items: list }))
}

// Reopens a workstream's newest session in a new terminal tab. The launcher finds it by tab name.
async function reopen($: EngineInterface, session: string, isRunning: boolean) {
  if (isRunning) {
    $.ui.toast(`${session} is already open in its own tab.`)
    return
  }
  // The cached list can be a minute old: ask again right before opening, so two clicks never open two copies.
  try {
    const live = await $.process.run(['claude', 'agents', '--json'])
    const rows = JSON.parse(live.stdout || '[]') as { name?: string }[]
    if (rows.some(row => (row.name ?? '').toLowerCase() === session.toLowerCase())) {
      $.ui.toast(`${session} is already open in its own tab.`)
      return
    }
  } catch {}
  const name = session.trim().replace(/\s+/g, '-')
  $.ui.toast(`Reopening ${session}…`)
  try {
    const run = await $.process.run([
      'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LAUNCHER, '-Name', name, '-ResumeLatest',
    ])
    if (run.exitCode !== 0) $.ui.toast(`Couldn't reopen ${session}: ${(run.stderr || run.stdout).trim().slice(0, 120)}`)
  } catch (error) {
    $.ui.toast(`Couldn't reopen ${session}: ${String(error).slice(0, 120)}`)
  }
}

function pacificHour(ms: number): number | undefined {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(ms)
    return Number(hour)
  } catch {
    return undefined
  }
}

function inWorkHours(ms: number): boolean {
  const hour = pacificHour(ms)
  return hour === undefined || (hour >= FIRST_HOUR && hour < LAST_HOUR)
}

function ago(fromMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.round((nowMs - fromMs) / MINUTE))
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`
}

// Module variable: a reload drops it, and at worst one extra sweep is queued.
let isSweepQueued = false

async function refreshLive($: EngineInterface) {
  try {
    const md = await $.fs.read(STATUS_FILE)
    await update($, workstreams, () => parseStatus(md))
  } catch {}
  try {
    const text = await $.fs.read(AGENDA_FILE)
    const parsed = JSON.parse(text) as Agenda
    await update($, agenda, () => parsed)
    await alertOnFailedSources($, parsed)
  } catch {}
  try {
    const run = await $.process.run(['claude', 'agents', '--json'])
    if (run.exitCode === 0) {
      const rows = JSON.parse(run.stdout) as { name?: string; state?: string; status?: string }[]
      const list: Session[] = rows.map(row => ({
        name: (row.name ?? '?').slice(0, 40),
        state: row.state ?? row.status ?? '?',
      }))
      await update($, sessions, () => list)
    }
  } catch {}
  await refreshUntracked($)
}

// A script, not a model call: it reads STATUS.md, the archive and the session transcripts.
async function refreshUntracked($: EngineInterface) {
  const now = await $.clock.now()
  if (now - untrackedCheckedAt < UNTRACKED_EVERY) return
  untrackedCheckedAt = now
  try {
    const run = await $.process.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', UNTRACKED_SCRIPT])
    if (run.exitCode !== 0) return
    const rows = JSON.parse(run.stdout.trim() || '[]') as { name?: string; lastUsed?: string }[]
    const list: Untracked[] = rows
      .filter(row => row.name)
      .map(row => ({ name: (row.name ?? '').slice(0, 40), lastUsed: row.lastUsed ?? '' }))
    await update($, untracked, () => list)
  } catch {}
}

function failedSources(current: Agenda | null): string {
  return (current?.sources ?? [])
    .filter(source => !source.ok)
    .map(source => (source.note ? `${source.name} (${source.note})` : source.name))
    .join(', ')
}

async function alertOnFailedSources($: EngineInterface, current: Agenda) {
  const failed = failedSources(current)
  if (!failed || (await read($, alertedFor)) === current.updatedAt) return
  await update($, alertedFor, () => current.updatedAt)
  $.ui.toast(`Sweep couldn't reach: ${failed}`)
  $.ui.notify(`Couldn't reach: ${failed}`, { title: 'Tower sweep' }).catch(() => {})
}

// Every sweep attempt and how it ended, newest last, so a sweep that never arrives can be traced.
const SWEEP_LOG = `${TOWER}/sweep.log`
let sweepQueuedAt = ''

async function logSweep($: EngineInterface, line: string) {
  try {
    let previous = ''
    try {
      previous = await $.fs.read(SWEEP_LOG)
    } catch {}
    const kept = previous.split('\n').filter(Boolean).slice(-49)
    kept.push(`${new Date(await $.clock.now()).toISOString()} ${line}`)
    await $.fs.write(SWEEP_LOG, kept.join('\n') + '\n')
  } catch {}
}

async function sweep($: EngineInterface, why: string) {
  if (isSweepQueued) {
    await logSweep($, `${why}: skipped, one already pending since ${sweepQueuedAt}`)
    return
  }
  isSweepQueued = true
  sweepQueuedAt = new Date(await $.clock.now()).toISOString()
  await logSweep($, `${why}: submitting`)
  try {
    // Resolves as the sweep's turn starts; it waits for the session to go idle.
    const result = await $.prompt.submit({ text: SWEEP_PROMPT })
    await logSweep($, `${why}: resolved ${JSON.stringify(result).slice(0, 300)}`)
  } catch (err) {
    await logSweep($, `${why}: rejected ${String(err)}`)
    $.ui.toast(`Tower sweep refused: ${String(err)}`)
  } finally {
    isSweepQueued = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tower',
      description: 'Open the Control Tower sidebar; "/tower refresh" runs a What\'s Next sweep now',
    })
    void $.ui.open({ id: PANE, title: 'Tower' })
    await refreshLive($)
    try {
      const { rateLimits } = await $.session.usage()
      if (rateLimits.length > 0) await update($, limits, () => pickLimits(rateLimits))
    } catch {}

    $.clock.every(MINUTE, () => void refreshLive($))
    $.clock.every(HOUR, async () => {
      if (inWorkHours(await $.clock.now())) void sweep($, 'hourly')
    })

    // A sidebar older than an hour at startup gets one sweep straight away.
    const now = await $.clock.now()
    const current = await read($, agenda)
    const updatedMs = current ? Date.parse(current.updatedAt) : NaN
    if (inWorkHours(now) && !(now - updatedMs < HOUR)) void sweep($, 'startup')
    else await logSweep($, `startup: no sweep (work hours ${inWorkHours(now)}, agenda ${current?.updatedAt ?? 'none'})`)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits') && e.rateLimits.length > 0) {
      await update($, limits, () => pickLimits(e.rateLimits))
    }
    return next(e)
  })

  on('command.run', { command: 'tower' }, async ($, e) => {
    await $.ui.open({ id: PANE, title: 'Tower' })
    if (e.args.trim() === 'refresh') {
      if (isSweepQueued) {
        void logSweep($, `refresh: skipped, one already pending since ${sweepQueuedAt}`)
        return { text: `A sweep has been pending since ${sweepQueuedAt} and hasn't started. See control-tower\\sweep.log.` }
      }
      void sweep($, 'refresh')
      return { text: "Sidebar opened. A What's Next sweep is queued." }
    }
    await refreshLive($)
    return { text: 'Sidebar opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link, Button } = $.ui.resolve(e)
    const now = await $.clock.now()
    const current = await read($, agenda)
    const streams = await read($, workstreams)
    const running = await read($, sessions)
    const loose = await read($, untracked)
    const usage = await read($, limits)
    const updatedMs = current ? Date.parse(current.updatedAt) : NaN

    const hasSweep = current !== null && !Number.isNaN(updatedMs)
    const failed = failedSources(current)

    const renderItem = (item: Item, color: Color) => (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={color}>› </Text>
          {item.url ? <Link href={desktopLink(item.url)}>{item.text}</Link> : <Text bold>{item.text}</Text>}
        </Text>
        {item.note && (
          <Text dimColor wrap="truncate-end">
            {'  '}
            {item.note}
          </Text>
        )}
      </Box>
    )

    // A section with items is a rounded card; an empty one folds to a single quiet line.
    const renderSection = (section: (typeof SECTIONS)[number]) => {
      const items = (current?.[section.key] ?? []).slice(0, section.max)
      if (items.length === 0) {
        return (
          <Box paddingX={1}>
            <Text dimColor>
              {section.icon} {section.title} · clear
            </Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={section.color} paddingX={1}>
          <Box justifyContent="space-between">
            <Text color={section.color} bold>
              {section.icon} {section.title}
            </Text>
            <Text color={section.color}>{items.length}</Text>
          </Box>
          {section.key === 'waiting'
            ? groupItems(items).map(({ group, items: list }) => (
                <Box flexDirection="column">
                  <Text dimColor bold>
                    {group}
                  </Text>
                  {list.map(item => renderItem(item, section.color))}
                </Box>
              ))
            : items.map(item => renderItem(item, section.color))}
        </Box>
      )
    }

    // Each workstream under its session's tab name; one with a session is a button that reopens it.
    const renderWorkstreams = () => {
      const live = new Map(running.map(row => [row.name.toLowerCase(), row.state]))
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text dimColor bold>
            WORKSTREAMS <Text dimColor>· click to reopen</Text>
          </Text>
          {streams.length === 0 && <Text dimColor>none found</Text>}
          {streams.map(row => {
            const liveState = row.session ? live.get(row.session.toLowerCase()) : undefined
            const right = <Text dimColor>{liveState ? `open · ${row.state}` : row.state}</Text>
            if (!row.session) {
              return (
                <Box justifyContent="space-between">
                  <Text dimColor wrap="truncate-end">
                    <Text color={stateColor(row.state)}>○ </Text>
                    {row.name}
                  </Text>
                  {right}
                </Box>
              )
            }
            return (
              <Box justifyContent="space-between">
                <Button key={`ws-${row.session}`} plain onPress={() => void reopen($, row.session, liveState !== undefined)}>
                  <Text color={liveState ? 'success' : stateColor(row.state)}>● </Text>
                  <Text>{row.session}</Text>
                </Button>
                {right}
              </Box>
            )
          })}
          {loose.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor bold>
                NOT TRACKED <Text dimColor>· tell the tower "adopt" or "ignore"</Text>
              </Text>
              {loose.map(row => {
                const liveState = live.get(row.name.toLowerCase())
                const usedMs = Date.parse(row.lastUsed)
                return (
                  <Box justifyContent="space-between">
                    <Button key={`un-${row.name}`} plain onPress={() => void reopen($, row.name, liveState !== undefined)}>
                      <Text dimColor>○ </Text>
                      <Text dimColor>{row.name}</Text>
                    </Button>
                    <Text dimColor>{liveState ? 'open' : Number.isNaN(usedMs) ? '' : ago(usedMs, now)}</Text>
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
      )
    }

    // One quiet line per window: label, a thin bar, percent, time to reset.
    const renderLimit = (limit: (typeof LIMITS)[number]) => {
      const row = usage.find(r => r.kind === limit.kind)
      if (!row) return null
      const percent = Math.min(100, Math.max(0, row.percentUsed))
      const reset = untilReset(row.resetsAt, now)
      const width = Math.max(6, (e.props.bodyColumns ?? 40) - 2 - 8 - 5 - (reset ? reset.length + 1 : 0) - 2)
      const filled = Math.round((percent / 100) * width)
      return (
        <Text wrap="truncate-end">
          <Text dimColor>{limit.label.padEnd(8)}</Text>
          <Text color={limitColor(percent)}>{'━'.repeat(filled)}</Text>
          <Text dimColor>{'─'.repeat(width - filled)}</Text>
          <Text color={limitColor(percent)}> {`${Math.round(percent)}%`.padStart(4)}</Text>
          {reset && <Text dimColor> {reset}</Text>}
        </Text>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {usage.length > 0 && (
          <Box flexDirection="column" paddingX={1}>
            {LIMITS.map(renderLimit)}
          </Box>
        )}
        <Box justifyContent="space-between" paddingX={1}>
          <Text color="claude" bold>
            ◢ CONTROL TOWER
          </Text>
          <Text dimColor>
            {hasSweep ? `${pacificClock(updatedMs)} PT · ${ago(updatedMs, now)}` : 'no sweep yet'}
          </Text>
        </Box>
        {failed && (
          <Box borderStyle="round" borderColor="error" paddingX={1}>
            <Text color="error">⚠ Couldn't reach {failed}</Text>
          </Box>
        )}
        {!hasSweep && (
          <Box paddingX={1}>
            <Text dimColor>Run /tower refresh for a What's Next sweep.</Text>
          </Box>
        )}
        {SECTIONS.map(renderSection)}
        {renderWorkstreams()}
      </Box>
    )
  })
}
