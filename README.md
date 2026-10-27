# claude-control-tower

A way to run lots of Claude Code sessions at once without losing track of them.

One session is the **control tower**. It doesn't do the real work. It hands that out to **workstreams**, each a Claude Code session in its own terminal tab, and keeps one status file honest. A **sidebar** in the tower's terminal shows what needs you, what you're waiting on and every workstream, and a click on a workstream reopens it.

The write-up with the reasoning behind all of this is here: https://www.mattdav.is/blog/my-claude-code-control-tower

This is my real setup with the work-specific bits taken out. It's built around how I work, so treat it as a starting point and change whatever doesn't fit you.

## What's in here

```
control-tower/
  README.md
  CLAUDE.example.md            guardrails for ~/.claude/CLAUDE.md (things that always need your OK)
  STATUS.example.md            copy to STATUS.md: one row per workstream
  whats-next.example.json      copy to whats-next.json: what the sidebar draws
  workstream-rules.md          appended to every workstream session's system prompt
  new-workstream.ps1           opens a workstream in a new titled Windows Terminal tab, or resumes one
  start-session.ps1            what runs inside that tab
  untracked.ps1                lists recent sessions no STATUS row tracks (a plain script, no model)
  untracked-ignore.txt         sessions to leave out of that list
  hooks/reload-context.ps1     SessionStart hook: re-injects STATUS.md (tower) or the task file (workstream)
  update-check/                every-other-day check for Claude Code changes worth adopting
  tasks/CONTROL-TOWER.md       the tower's own brief
  tasks/EXAMPLE-WORKSTREAM.md  what a workstream brief looks like
  skills/whats-next/SKILL.md   the sweep: re-check every source, never trust memory
  mods/tower-sidebar/          the sidebar, a Claude Code mod
```

Your own `STATUS.md`, `whats-next.json`, task files, notes and archive are git-ignored, so you can keep your tower in a clone of this without committing your work.

## Setup

Windows, PowerShell, Windows Terminal and Claude Code. The scripts are short, so porting them to bash is straightforward.

1. **Clone** somewhere permanent, for example `~/control-tower`.
2. **Copy the examples:** `STATUS.example.md` to `STATUS.md` and `whats-next.example.json` to `whats-next.json`.
3. **Guardrails:** merge `CLAUDE.example.md` into `~/.claude/CLAUDE.md` and make it yours. Don't skip this one.
4. **Hook:** add the SessionStart hook to `~/.claude/settings.json`:
   ```json
   "hooks": {
     "SessionStart": [{
       "matcher": "startup|compact|clear",
       "hooks": [{ "type": "command",
         "command": "powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/you/control-tower/hooks/reload-context.ps1" }]
     }]
   }
   ```
5. **Skill:** copy `skills/whats-next` to `~/.claude/skills/whats-next` and edit its sources to match your tools (code host, chat, email, calendar, tracker).
6. **Sidebar:** set `TOWER` at the top of `mods/tower-sidebar/hooks/register.tsx` to your folder, with forward slashes. Check it with `claude plugin validate mods/tower-sidebar` and `claude plugin test mods/tower-sidebar`.
7. **Start the tower:**
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File start-session.ps1 -Name CONTROL-TOWER
   ```
   That loads the sidebar with `--plugin-dir` and points the tower at `tasks/CONTROL-TOWER.md`.
8. **Optional:** schedule `update-check/run.ps1` every other day in Task Scheduler.

## Using it

- **Start a workstream:** tell the tower what you want. It writes `tasks/<NAME>.md` and runs `new-workstream.ps1 -Name <NAME>`.
- **Reopen one:** click it in the sidebar. That runs `new-workstream.ps1 -Name <NAME> -ResumeLatest`, which finds the newest session with that title from the `customTitle` in its transcript.
- **Park one:** the session sets its row to Parked and you close the tab.
- **Finish one:** the session sets its row to Done. The next sweep archives the task file once the tab is closed.
- **Adopt a session you started by hand:** it shows under "Not tracked" in the sidebar. Tell the tower "adopt NAME", or "ignore NAME".
- **Sweeps:** the sidebar asks the tower for a read-only sweep every hour during work hours, set by `FIRST_HOUR` and `LAST_HOUR`. `/tower refresh` runs one now.

## License

MIT
