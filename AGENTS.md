# AGENTS.md — Cross-Agent Constitution

> Single shared operating constitution for every AI agent working on `mallan67/mallan-nyc`.
> When private memory, stale chat context, old handoffs, comments, or earlier plans disagree with the current repository, this file and the canonical platform plan win.

This repository is a live Cotality/Trestle REBNY IDX Plus synchronization and brokerage platform with downstream consumers including search, CRM, portals, media, compliance, archive, email, contacts, reporting, and seller workflows.

---

## 0. Mandatory reading order

Every agent must read these files before planning or changing platform behavior:

1. [`AI-START-HERE.md`](AI-START-HERE.md)
2. [`docs/architecture/MALLAN-PLATFORM-PLAN.md`](docs/architecture/MALLAN-PLATFORM-PLAN.md)
3. this file
4. [`docs/PROJECT-HEALTH-DASHBOARD.md`](docs/PROJECT-HEALTH-DASHBOARD.md)
5. [`docs/PLATFORM-ISSUE-REGISTRY.md`](docs/PLATFORM-ISSUE-REGISTRY.md)
6. the latest applicable handoff
7. [`NEON.md`](NEON.md) before any database, Prisma, migration, sync, storage, or relevant Vercel work
8. [`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`](docs/compliance/COMPLIANCE-CANONICAL-INDEX.md) before any listing, search, display, media, CRM contact, marketing, or public-text work

### Tool entry paths

| Tool | Entry path |
|---|---|
| Claude | `CLAUDE.md` → `AI-START-HERE.md` → canonical platform plan → this file |
| Codex | `AGENTS.md` → `AI-START-HERE.md` → canonical platform plan; review current PR HEAD, never stale comments |
| ChatGPT | repository connector → `AI-START-HERE.md` → canonical platform plan → this file |
| Copilot | `.github/copilot-instructions.md` → `AI-START-HERE.md` → canonical platform plan |
| Other agents | `AI-START-HERE.md` → canonical platform plan → this file |

The canonical platform plan is the one normative source for business rules, system architecture, listing identity, error governance, housekeeping, and implementation phases. Do not create parallel platform plans.

---

## 1. Listing identity invariants

1. `SL-*` means a Mallan web **sale** listing.
2. `RL-*` means a Mallan web **rental** listing.
3. `RLS*` means a separate REBNY/Cotality provider record.
4. The `SL-`/`RL-` prefix identifies transaction type; it does not prove whether a provider counterpart exists.
5. A verified matched pair keeps the Mallan record as the canonical mallan.nyc public page.
6. The provider counterpart remains read-only and retained internally.
7. The provider duplicate is suppressed from Mallan public surfaces.
8. No authority handover occurs.
9. Current prefix-based ownership or dedupe inference is an implementation shortcut to inventory and correct, not a reason to redefine the business rule.

---

## 2. Core invariants

1. **Repository boundary** — this file applies only to `mallan67/mallan-nyc`. Mallan Integrated is outside scope.
2. **Canonical Neon production** — project `hidden-mountain-87248164`, Vercel-managed org `Vercel: maya`, default branch `main = br-crimson-frog-adr7g9gt`, endpoint `ep-cold-waterfall-adno3ao2`. Stale/do-not-serve: `morning-bread-68708332` / `ep-royal-dawn-ad6eh8t2`. Full rules: `NEON.md`.
3. **Intentional sync cadence** — source of truth is `vercel.json`. Route comments may be stale; fix comments, not schedules, unless Maya explicitly authorizes schedule changes.
4. **Proof first** — a change is not done without a failing test that turns green, live or immutable-preview behavior proof, a direct source read for bounded static claims, or equivalent captured evidence. Grep alone never proves runtime behavior.
5. **Fail closed** — if a REBNY, Cotality, Fair Housing, listing-display, consent, authorization, or canonical-file rule is unclear, stop and report. Do not guess.
6. **Current HEAD** — review the current PR head SHA. A comment against an older commit is not automatically a current blocker.
7. **Compliance first** — read the compliance canonical index before touching listings, search, display gates, syndication, CRM contacts, intake forms, media, marketing, or public text.
8. **Live provider truth** — listing statuses, field names, picklists, relationships, and runtime behavior must be verified against the authenticated live Cotality API when the task depends on them. Generated mirrors support verification; old snapshots and copied lists do not replace it.
9. **No client-side provider calls** — credentials and provider requests remain server-side.
10. **No silent failure** — unsupported, stale, conflicting, unlicensed, and unverified states are explicit.
11. **No deletion by absence alone** — “no caller found in searched paths” is not proof that code or a route is unused.
12. **No merge or production release without Maya approval.**

---

## 3. Non-negotiable holds

Explicit Maya approval is required before any applicable:

- archive-drain execution or large batch;
- manual production cron trigger;
- Vercel environment change;
- Neon reclaim, downgrade, destructive maintenance, or `VACUUM FULL`;
- database key rotation;
- production migration, `prisma migrate deploy`, or `db push`;
- projection backfill;
- storage/media remediation execution;
- notification dispatcher activation;
- admin merge bypass;
- force-push to `main`;
- live bulk-marketing send;
- other operation marked held in `CLAUDE.md`, `NEON.md`, the issue registry, the canonical platform plan, or a current handoff.

A documentation or design statement does not release a hold.

---

## 4. Where truth lives

| Topic | Source |
|---|---|
| Mandatory agent entry | `AI-START-HERE.md` |
| Business, architecture, listing identity, errors, housekeeping, phases | `docs/architecture/MALLAN-PLATFORM-PLAN.md` |
| Cross-agent constitution | `AGENTS.md` |
| Live operational status | `docs/PROJECT-HEALTH-DASHBOARD.md` |
| Issues, incidents, debt, and risks | `docs/PLATFORM-ISSUE-REGISTRY.md` |
| Dated session state | latest applicable `docs/operations/*handoff*.md` |
| Claude-specific command center | `CLAUDE.md` |
| Neon, Prisma, DB, sync safety | `NEON.md` |
| Compliance navigation | `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` |
| Live Cotality mirror | `data/cotality-enums.live.json`, regenerated and verified by repository commands |

Do not create competing `STATUS.md`, `NOTES.md`, `TODO.md`, architecture revisions, addenda, or new master-plan files. Extend the canonical sources instead.

---

## 5. Evidence language

- Do not present a hypothesis as a diagnosis.
- “Root cause” requires strong captured evidence and an explicit evidence trail.
- Every issue or status claim states what was checked, the exact commit/environment, what the evidence proves, and what it does not prove.
- Every registry item uses its single canonical issue ID.
- Changing an issue requires updating its derived summaries, dashboard, and handoff in the same PR when applicable.
- Bounded negative evidence proves only the exact paths, names, and patterns searched.
- Current production claims require production evidence; current-main claims require repository evidence.

---

## 6. Branch and diff discipline

1. Use a clean worktree or clean branch for bounded work.
2. Do not use `git add -A` in a tree containing unrelated work.
3. Stage explicit paths.
4. Diff against the intended base before commit and before push.
5. One bounded capability per branch and PR.
6. No unrelated Neon, R2, Prisma, migration, package, cron, environment, or sync changes in documentation or unrelated feature PRs.
7. Do not rewrite shared branch history without explicit authorization.
8. Preserve rollback and record the exact branch head.

---

## 7. Implementation sequence

The canonical platform plan defines the program phases:

- **PH-1:** canonical truth, inventories, consolidation, static-CRM mapping, listing-identity mapping, error inventory, and housekeeping baseline.
- **PH-2:** application services, authorization, contracts, error catalog, and explicit matched-pair identity.
- **PH-3:** working compliant public search.
- **PH-4:** dynamic CRM critical workflows, seller portal, live market activity, and agent-controlled CMA.
- **PH-5:** marketing consent and production readiness.
- **PH-6:** explainable intelligence and continuous cleanup.

Do not start PH-2 implementation before PH-1 findings are reviewed and approved.

---

## 8. Handoff rule

Before ending a material session:

1. run the applicable read-only health checks;
2. update only statuses actually verified;
3. update the current handoff with date/time, main SHA, branch/PR, deployment when relevant, captured errors, unresolved blockers, changed files, exact stop point, and next action;
4. update the issue registry and derived summaries when an issue changed;
5. never mark a status working or complete without captured proof;
6. never rely on chat memory as the durable handoff.

---

## 9. Review policy

- High-risk PRs require a clean strong review or two independent clean reviews plus a written exception.
- High-risk includes migrations, environment flags, crons, archive/storage/billing, public compliance surfaces, contact/lead writes, seller attribution, listing identity, and provider-policy changes.
- Low-risk documentation/read-only PRs require green applicable checks, one independent review, no unrelated files, and no unresolved current-head finding.
- Every review finding must be fixed, proven pre-existing and separately tracked, or explicitly future-gated. Never ignore it silently.
- Review the current diff and current head, not merely the PR description.

---

## 10. Current program direction

The canonical platform plan is the active target. The immediate next program work is PH-1 only: document consolidation, route and entrypoint inventory, static-CRM workflow mapping, error and bloat inventory, `SL-`/`RL-` prefix-assumption inventory, matched-pair verification, and a reviewed PH-2 backlog.

Operational status remains in the health dashboard and issue registry; do not duplicate it here.
