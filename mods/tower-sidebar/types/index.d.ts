// group sorts Waiting on others under who owes it (a department or team).
export type Item = { text: string; note?: string; url?: string; group?: string }

// One per source the sweep tried; ok is false when its MCP or tool was unreachable.
export type Source = { name: string; ok: boolean; note?: string }

// Written to control-tower\whats-next.json by each What's Next sweep.
export type Agenda = {
  updatedAt: string
  prs: Item[]
  decisions: Item[]
  tasks: Item[]
  // Optional so an agenda written before emails were swept still loads.
  emails?: Item[]
  // Could help, Log this? and Draft a post? lines; optional for the same reason.
  worth?: Item[]
  waiting: Item[]
  meetings: Item[]
  sources?: Source[]
}

// session is the tab name from STATUS.md's Session column, or '' when the workstream has none.
export type Workstream = { name: string; session: string; state: string; waiting: string }
export type Session = { name: string; state: string }
// A session used lately that no STATUS.md row tracks; lastUsed is ISO UTC.
export type Untracked = { name: string; lastUsed: string }

// One plan usage window as the engine reports it: five_hour or seven_day, 0 to 100.
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'tower-sidebar': {
      agenda: Shaped<Agenda | null>
      workstreams: Shaped<Workstream[]>
      sessions: Shaped<Session[]>
      alertedFor: Shaped<string>
      limits: Shaped<Limit[]>
      untracked: Shaped<Untracked[]>
    }
  }
}
