# Outstanding Work — Snapshot 2026-04-27

> Quick reference for resuming work. Source of truth remains
> `memory/REFACTOR-2026-04-25.md` (master plan) and
> `memory/FOLLOWUP-2026-05-01.md` (Workstream C). This file is a
> what's-left summary, not a duplicate plan.

> **Reconciled 2026-04-27 (later session) against actual GitHub merge state.**
> Most "open" entries below were already MERGED on 2026-04-26 — see git log.
> Truly remaining: PR 11 (CRM test runner), C3c (auction UI), C4c (ethics admin panel + dev-login catch). PRs 6/7 reserved for separate backend CRM/search redesign chat. PRs 3/4 blocked on R2 user-side provisioning. PR #62 (SMS password reset) open + CI green but gated on user running prod migration + Twilio verification.

---

## Neon — current state (verified 2026-04-27 19:06 ET)

| Metric | Value | Cap | Headroom |
|---|---|---|---|
| Storage | **290.87 MB** | 500 MB free | 58.2% used — **healthy** |
| Top table | `listings` 268 MB | — | dominant; reduced by PR 10 (Neon shedding) when it lands |
| Compute | reset monthly | 191.9 hrs/mo | green per ops:health (no warning) |
| Sync state | `ok` | — | last run 0.3h ago, 33 upserted, 0 errors |
| §2.05 violations | **0** | 0 | clean |
| T+180d archive backlog | **0** | 0 | clean |
| PostGIS trigger | 19,378 listings | 50,000 | not yet — Phase 6 deferred until 50K |
| Audit-events partition trigger | 13,699 events | 10M | nowhere near |

**No active Neon emergency.** Database is in a stable healthy state.

### Neon-specific work still queued

| ID | What | When | Why it's not done yet |
|---|---|---|---|
| **PR 2** | `refactor/02-media-metadata-schema` — `ListingMedia` + `MediaSyncState` + 4 nullable cols | **MERGED — `cb094c9b` · 2026-04-26 (PR #48)** | — |
| **PR 5** | `refactor/05-listing-search-projection` — additive projection for search-core | NOT_STARTED | Depends on PR 4 merge |
| **PR 8** | `refactor/08-collections-search-sends` — additive | NOT_STARTED | Depends on PR 7 in prod |
| **PR 9** | `refactor/09-lease-lifecycle` — extends `ActiveLease` with 5 nullable cols + new lifecycle-alerts cron | NOT_STARTED | Independent of PR 8 — can run parallel |
| **PR 10** | `refactor/10-neon-shedding` — strengthen data-retention cron, shrink `raw_data` from "full payload" to "audit-only," add `scripts/neon-storage-audit.js` + `scripts/neon-listings-deep.js` | NOT_STARTED | **This is the PR that brings the 268 MB `listings` table down.** Depends on PR 5 readers fully migrated. |
| **PR 12** | `chore/prisma-7-upgrade` (6.19 → 7.x) — driver/connection behavior changes | NOT_STARTED | Depends on PR 10 merged + ≥1 week prod stability |
| **Workstream A** | Phase 3 column normalization (`primary_photo_url`, `photo_count`, `list_agent_full_name`, `list_office_name`, `public_remarks`, `close_price`, `close_date`, `latitude`, `longitude`) into dedicated columns | **SUPERSEDED** by master-plan PR 5 — do not double-execute | — |
| **Workstream B** | Phase 5 HTTP adapter per-route adoption (`prismaHttp` swap on 5 read-heavy routes) | **DROPPED** per user decision 2026-04-25 | — |

### Neon discipline reminders (don't violate)

- **No migrations in `vercel.json` buildCommand.** Apply manually (`DATABASE_URL=prod npx prisma migrate deploy`) before pushing the code PR.
- **One column or one table per PR.** Two changes = two rollback paths.
- **Nullable first.** Never `NOT NULL DEFAULT …` on a populated table.
- **3–5 AM ET only** for migrations on `listings`, `leads`, `audit_events`.
- **`[neon-preflight: OK]` token + `npm run ops:health` within 60 min** before any commit touching `prisma/schema.prisma`, `prisma/migrations/`, `vercel.json`, `lib/prisma*`, or `lib/idx/sync.ts`. Pre-commit hook enforces both.

---

## Master plan — what's left

### Master sequence (10 PRs + 3 chores)

| PR | Title | Status | Blocks what |
|---|---|---|---|
| **1** | Compliance fail-closed cleanup | **MERGED 2026-04-26 (PR #41)** | — |
| **2** | Media metadata schema | **MERGED 2026-04-26 (PR #48)** | — |
| **3** | Media sync service (R2-backed) | NOT_STARTED — **blocked on R2 user-side provisioning** | PR 4 |
| **4** | Rewrite `/api/media/batch` | NOT_STARTED — blocked on PR 3 | PR 5 |
| **5** | Listing search projection | NOT_STARTED | PR 6, 10 |
| **6** | `lib/search-core` library + public search migration | NOT_STARTED — **reserved for separate backend CRM/search redesign chat** | PR 7 |
| **7** | Backend/agent/portal search migration | NOT_STARTED — **reserved for separate redesign chat** | PR 8 |
| **8** | Collections + search sends + client behavior tracking | NOT_STARTED | — |
| **9** | Lease lifecycle tracker | NOT_STARTED | parallel to PR 8 |
| **10** | Neon shedding | NOT_STARTED | PR 12 |
| **11** | Restore CRM browser-test runner (`npm run crm:test` is currently broken — `05-test-suite-runner.js` missing) | **IN PROGRESS 2026-04-27 (this session)** | independent |
| **12** | Prisma 7 upgrade | NOT_STARTED | depends on PR 10 + ≥1 week stability |
| **13** | npm audit triage | **MERGED 2026-04-26 (PR #44)** | — |
| **13b** | Migrate `xlsx` → `exceljs` | **MERGED 2026-04-26 (PR #45)** | — |

### Workstream C — REBNY/UCBA compliance (parallel track)

| Sub-PR | Title | Status |
|---|---|---|
| **C1a** | Inquiry model + 3 lead-capture endpoints | **MERGED** `746f8c83` (PR #47) |
| **C1b** | Wire 5 remaining lead-capture endpoints to Inquiry | **MERGED** `bd1f6f0b` (PR #55, replaces auto-closed #52) |
| **C2** | Offer transmission tracking (UCBA Art. II) | **MERGED** `0bb3d740` (PR #49) |
| **C3a** | Auction listing fields (5 cols, UCBA Art. I exception) | **MERGED** `ca4c7a5e` (PR #50) |
| **C3b** | Auction enforcement validator + 9 tests | **MERGED** `3b3c8d1d` (PR #57, replaces auto-closed #53) |
| **C3c** | Auction form sub-section + listing banner UI | **IN PROGRESS 2026-04-27 (this session)** |
| **C4a** | Ethics training fields (`ethics_training_completed_at`, `_expires_at`) | **MERGED** `096b43d6` (PR #51) |
| **C4b** | Ethics training auth gate (UCBA Art. III §6) | **MERGED** `276fe3ae` (PR #58) |
| **C4c** | Broker admin panel for ethics training + dev-login catch | **IN PROGRESS 2026-04-27 (this session)** — script-commit piece DONE in PR #59 (`2f43deaf`) |

> **Note:** The status fields above are what the in-repo plan files claim. Several of these PRs may already be merged but not yet reflected in the plan's status table. **First action next session: open GitHub, check actual merge state, update the plan files.**

---

## Other outstanding items (not in either plan)

### Code-level TODOs still in source

| File | Line | TODO |
|---|---|---|
| `app/api/crm/rentals/listings/route.ts` | 55 | `applications_count: 0, // TODO: wire when Application model exists` — needs an `Application` (rental application) Prisma model. Not currently scoped. |

That's the only remaining `TODO`/`FIXME` in core paths (`app/api/crm/`, `app/api/portal/`, `lib/auth/`, `lib/compliance/`, `lib/idx/`). The Inquiry-count TODO was resolved by C1.

### Brainstorm WIP (untracked)

| File | Status |
|---|---|
| `docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md` | Brainstorm session ended with user unsatisfied ("recycled competitor parity or unrealistic vision"). Marked NOT FOR IMPLEMENTATION. Saved for return-and-improve. Not staged. |

### Skill deprecation notices (CLI-level, not work)

The `/superpowers:execute-plan` and `/superpowers:brainstorm` slash commands are deprecated; replacements are `superpowers executing-plans` and `superpowers brainstorming` skills. No action required; just FYI when those commands appear.

---

## What just got finished (2026-04-27 — for context when resuming)

1. **React Compiler `set-state-in-effect` cleanup** — 23 lint problems → 0. Built two new shared hooks (`useAsyncResource`, `useClientOnly`), converted 11 components + 2 portal pages, refactored `AuthProvider` to typed reducer, refactored `useFavorites`/`useSavedSearches` to `useSyncExternalStore`. Full report: `compliance/REACT-PATTERNS-AUDIT-2026-04-27.md`.
2. **Lint hygiene sweep** — removed unused imports/locals across API routes + libs; dead scraping-detection helpers removed from `lib/middleware/rate-limiter.ts` (replaced by `routeLimiters` map).
3. **README.md** — "Recent Work" updated with link to React-patterns audit report.
4. **Frontend-auditor + REBNY-search-compliance-auditor agent memories** updated with the canonical-patterns table + "no compliance impact" verification.

12 commits ahead of `origin/main`, all gates green. Branch: `fix/trestle-media-batch-url-length`.

---

## Resume instructions for next session

1. Run pre-flight: `npm run ops:health && npm run ucba:audit && npm run rls:validate && npm run idx:validate`. If any fail, fix first.
2. Open `memory/REFACTOR-2026-04-25.md`, find the lowest-numbered PR with status `NOT_STARTED`, run it per the per-PR instructions in that file.
3. Workstream C (C1–C4): pick up C3c (auction form/UI) or C4c (broker admin panel) — both are NOT_STARTED, both are independent of the master sequence.
4. After any PR merges, update its status field in the plan file and update this snapshot.
5. **Do not skip `NEON.md` §5 pre-flight checklist** for any commit touching schema or `lib/idx/sync.ts`.
