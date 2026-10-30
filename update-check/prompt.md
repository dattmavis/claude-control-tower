You are checking whether anything new in Claude Code should change how you work. You can only read; your answer is saved as a note for you and your control tower session.

Today is {{TODAY}}. The last check reviewed Claude Code releases up to and including **{{LAST_VERSION}}** (installed here: {{INSTALLED}}).

## 1. Read your current setup first
- C:\Users\you\control-tower\STATUS.md, tasks\CONTROL-TOWER.md, workstream-rules.md, new-workstream.ps1, start-session.ps1, hooks\reload-context.ps1
- C:\Users\you\.claude\CLAUDE.md and C:\Users\you\.claude\settings.json (hooks, matchers and other settings keys)
- C:\Users\you\control-tower\updates\declined.md (never suggest anything listed there again)

Do **not** read earlier notes in `updates\` (the dated `.md` files). Judge today's releases on their own, not against what earlier checks concluded.

How the setup works: one small "control tower" session tracks workstreams through STATUS.md. Each workstream runs as its own Claude Code session in a Windows Terminal tab (or in the background with `claude --bg`), with a task file and a notes file. A SessionStart hook reloads STATUS.md or the task file. Sessions message each other with SendMessage/ListAgents. A tower-sidebar plugin runs hourly sweeps. This check runs every other day on Windows.

## 2. Read every release since {{LAST_VERSION}}, in full
- Source: https://code.claude.com/docs/en/changelog.
- When you call WebFetch, ask for **every bullet of every release newer than {{LAST_VERSION}}, verbatim**. Don't ask for a topic-filtered summary: you can't know in advance what matters.
- If the result says it was truncated, or gives an offset to continue, fetch again with that offset until you have reached {{LAST_VERSION}}.
- Then go through the bullets yourself against your setup.

## 3. Check your config against the current docs
- Fetch https://code.claude.com/docs/en/hooks.
  - Ask for the full list of hook events and each event's matcher/source values.
  - Page with the offset if the result is truncated.
  - Compare each hook in your settings.json: does any matcher miss a source value that fits what the hook is for?
- Do the same for any settings key in settings.json that a release in step 2 renamed, deprecated or changed the default of.

## 4. Look wider, briefly
- Anthropic's engineering blog (https://www.anthropic.com/engineering): posts since the last check.
- Search for posts, threads or talks from Boris Cherny and others on the Claude Code team about how they use it, and for widely shared community write-ups on multi-session or orchestration workflows. If a post can't be opened directly, search for coverage of it.

## Write the note in plain Markdown
- Title line: "# Setup check {{TODAY}}"
- "## Suggestions": only things that would change your day-to-day workflow, fix a gap in your config, or replace part of this setup. For each one, give:
  - what it is;
  - the version or date it arrived;
  - the source (label it Official, Claude Code team, or Community) and the link;
  - what it would replace or improve here;
  - what you would do differently.
  Community ideas only when they clearly fit, and say they're unofficial. If nothing qualifies, write "Nothing new that changes the setup." in this section.
- {{WEEKLY}}
- "## Checked": always include this section, even when nothing qualifies.
  - The release range you actually read (first and last version), and whether you reached {{LAST_VERSION}}.
  - Each page fetched (and how many offset pages).
  - Each search run.
  - Anything you couldn't read.
- The very last line must be exactly `LAST-VERSION: <newest version you read in full>`, so the next check starts from there. If you could not read the changelog at all, write `LAST-VERSION: {{LAST_VERSION}}`.

No minor bug fixes, no features unrelated to this workflow, no padding. Keep the Suggestions under 60 lines.
