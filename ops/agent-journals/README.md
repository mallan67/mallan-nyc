# Agent Journals — Auto-Memory for Resumable Work

Every section agent (see `docs/CRM-ARCHITECTURE.md` §C) writes its own memory here so a freeze, crash, or shutdown can be picked up **exactly where it stopped**. Two files per section, keyed by the section slug.

## 1. `<slug>.journal.jsonl` — append-only action log

One JSON object per line, appended after every meaningful action. Never rewritten.

```jsonl
{"ts":"2026-05-30T14:02:11-04:00","step":"1","action":"created search-registry.json skeleton","files":["search-registry.json"],"result":"ok","next":"map Property resource fields"}
{"ts":"2026-05-30T14:31:—:00","step":"2","action":"mapped Property (759 fields)","files":["search-registry.json"],"result":"ok","next":"map Media resource"}
```

## 2. `<slug>.state.json` — resume pointer (overwritten each update)

```json
{
  "section": "01-search",
  "branch": "feat/search-registry-core",
  "status": "in_progress",
  "last_completed_step": "2",
  "blockers": [],
  "updated": "2026-05-30T14:31:00-04:00"
}
```

`status` ∈ `not_started | in_progress | blocked | done`.

## 3. Protocol (binding)

1. **On start / resume:** read `<slug>.state.json` (if missing, start at step 1) + tail `<slug>.journal.jsonl`. Resume from the step after `last_completed_step`. **Never redo completed work.**
2. **After every action:** append one line to the journal, then overwrite `state.json`.
3. **On block:** set `status:"blocked"`, record the blocker, stop, surface to Maya.
4. **On done:** set `status:"done"`, run the validation suite (master plan §7.4), request review.
5. **Reflect status** back into the `docs/CRM-ARCHITECTURE.md` §C board.

## 4. Slugs

`00-stabilize` · `01-search` · `02-firewall` · `03-agent` · `04-money-loops` · `05-portals` · `06-broker` · `07-t2-external` · `08-t3-sponsor`

> The Workflow tool provides journaling + resume natively within a session; these files are the durable, cross-session, human-readable mirror that survives any interruption.
