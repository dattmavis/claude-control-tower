---
name: whats-next
description: Build the user's agenda from a full, fresh picture of every source they work across, including other Claude sessions, before saying what's next. Use whenever they ask "what's next", "what's left", "catch me up", "any updates", or before acting on an earlier plan that's more than an hour old.
---

# What's next: answer from a full, fresh picture

The user works across several Claude sessions, chat, email, the code host and the tracker, and acts in all of them without telling this session. Anything this session learned earlier is a **hypothesis**, not the current state. Re-check everything, reconcile it, then recommend.

## Rules

1. **Re-query, never recall.** Every item on the agenda must be confirmed by a call made during this turn.
2. **The user's own actions first.** Before listing anything as "to do", check whether they already did it: their merges, their reviews, their sent messages and emails, their ticket edits, and the work of their other sessions.
3. **Check other sessions before claiming work.** Work owned by another running session gets its own line and isn't proposed again here.
4. **Verify before acting on a stale plan.** Before correcting someone, posting a review or nudging someone, re-check that specific thing first.
5. **Timestamp the picture** in UTC and the user's local time.
6. **Read-only.** This skill gathers and recommends. Sending, posting, merging and ticket changes need the user's go as usual.

## Sources, in this order

Run independent calls in parallel. The window is "since the last check".

1. **Other Claude sessions:** `claude agents --json`, plus recent branches and worktrees in the repos you work in.
2. **Code host:** PRs merged or opened since the window and who merged them, reviews (including the user's own), comments, CI status, and review requests to the user. A PR the user reviewed that is still on the reviewed commit is waiting on its author, not on the user.
3. **Chat:** everything since the window, **including the user's own messages**. Flag direct asks with no reply from the user, after checking their sent messages.
4. **Email:** the inbox since the window, and Sent Items before calling any thread unanswered.
5. **Calendar:** today and tomorrow, including cancelled or repurposed meetings.
6. **Tracker:** the user's tickets updated in the window, overdue items, and the tickets the user is watching.
7. **Memory:** the state files for active workstreams. Use them for the list of things to check, then verify each one against sources 1 to 6.

## Output

Lead with anything time-critical. Then:

- **Done since last check**, including what the user did themselves.
- **Needs you:** decisions and asks only the user can answer, most urgent first.
- **Owned by other sessions:** one line each.
- **Waiting on others:** who owes what, grouped by team.
- **Recommendation:** the one or two things to do next, and why.

If anything said earlier in the conversation turned out wrong or stale, say so plainly at the top.
