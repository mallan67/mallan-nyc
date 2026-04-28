# Session log — 2026-04-28 (overnight + afternoon)

> Single-session record of the work that landed on `main` between 02:06 ET and 16:56 ET. Captured at the user's request so the rationale + outcomes survive future context compression. Sister to `memory/REFACTOR-2026-04-25.md` (the plan) and `memory/OUTSTANDING-WORK-2026-04-27.md` (the prior snapshot).

## Outcome

**Master plan PR 10 ("Neon shedding") shipped to production**, and every operational glitch the rollout exposed was fixed at root rather than patched.

| Signal | Before | After |
|---|---|---|
| Total DB size | 292.77 MB | ~196 MB at backfill close · ~215 MB current steady-state |
| % of 500 MB free cap | 58.6 % | 39.2 % at close · 43 % current |
| `listings` table | 269.97 MB | 173.42 MB (post VACUUM FULL) |
| Slim writer in production | not yet | live since 02:10 ET — verified across 6 sync cycles, 0 errors |
| Free-tier branch cap state | 14+ idle preview branches accumulating since March | 1 branch (`main` only); auto-pruned daily 04:00 UTC |
| Open PRs in queue | 5 (#71–#75) | 0 |
| Scheduled cron count | 19 | 20 (`neon-branch-prune` added) |

## PRs merged this session

| # | Title | Merge SHA | Notes |
|---|---|---|---|
| 75 | feat(neon-shed): slim raw_data on Trestle imports + audit/backfill | `d39906fb` | Master plan PR 10. Dropped ~104 MB raw_data via post-merge backfill (executed live during the session). |
| 76 | fix(neon-shed): six real bugs surfaced during the 2026-04-28 backfill | `c7047af9` | tsx in devDependencies, parallel SQL via `UPDATE ... FROM (VALUES ...)`, `projectShedSavings` byte-counting fix, transient-error retry, doc-number refresh, pre-commit guard reading stale `COMMIT_EDITMSG`. Each bug pinned with a regression test where applicable. |
| 71 | chore: 2026-04-27 cleanup — React Compiler audit + plan reconciliation | `ad884e14` | Was already CI-green; hitched into tonight's clearout. |
| 72 | chore(crm-test): restore npm run crm:test (PR 11) | `f1d17b50` | Dev-tooling restore. |
| 77 | ci: auto-retry Live Site Smoke on runner-pool flakes | `22bd7640` | `workflow_run` listener + heuristic (zero-failed-steps signature → infra flake → rerun once). |
| 78 | ci: address Codex review on auto-retry workflow (PR #77 follow-up) | `6e2a8389` | Failed-closed classifier on API errors, explicit `--repo` on `gh run rerun`, tempfile-backed annotation accumulator (fixes prior YAML parse error), summary distinguishes flake / real-failure / classifier-error verdicts. |
| 79 | ci: skip Trestle live audit cleanly when IDX secrets are missing | `e8ab95e9` | Pre-flight secrets check + idempotent label create — fixes the "compliance label not found" cascade that turned the daily Trestle audit into a permanent red email. |
| 74 | feat(c3c): auction form sub-section + listing banner UI | `eb9fa21f` | C3c. Rebased onto post-merge main, conflict on `app/listing/[id]/page.tsx` import line resolved by taking the broader (c3c) version. |
| 73 | feat(c4c): broker ethics admin panel + dev-login catch | `2b6dc796` | C4c. Codex flagged 4 real bugs in `app/api/crm/agents/[id]/ethics-training/route.ts` (null-body TypeError, partial-PATCH ordering bypass, missing 404 handling, double-up of #2). Fixed root + 3 new regression tests. |
| 80 | fix(neon-branch-prune): root-cause fix for "Branch limit exceeded" | `2ebb6dbf` | The Neon-Vercel marketplace integration was creating one DB branch per preview deploy with no cleanup, hitting the free-tier 10-branch cap and posting "Checks Failed" on every subsequent preview. Added `lib/neon/branches.ts` + `scripts/neon-prune-branches.ts` + `app/api/cron/neon-branch-prune` + `vercel.json` schedule + NEON.md §11 architecture note + 2 §10 change-log entries. User manually swept the 14+ accumulated stale branches down to just `main`. |

## Workstream C (UCBA compliance gaps) — final state

After PR #73 merged, all four sub-workstreams complete:

- **C1** Inquiry model + 3 lead-capture endpoints — already merged pre-session (#47, #55).
- **C2** Offer transmission — pre-session (#49).
- **C3a/b** Auction listing data + validator — pre-session (#50, #57).
- **C3c** Auction form/UI — **#74 tonight**.
- **C4a/b** Ethics training schema + auth gate — pre-session (#51, #58).
- **C4c** Broker admin panel + dev-login catch — **#73 tonight**.

Master plan PR 11 (the post-PR-10 follow-on) and the next-phase Mallan Intelligence Platform planning doc (`docs/superpowers/specs/2026-04-27-mallan-intelligence-platform-WIP.md`) remain untouched and queued for whenever the user picks them up.

## Live operational sequence — Neon storage backfill

Captured because this was the most operationally-sensitive part of the night and may need to be re-run on schema change.

1. **02:06 ET** — PR #75 merged. Vercel deployed the slim writer to production.
2. **02:10 ET** — first idx-sync after the merge: 4 listings upserted with slim raw_data, 0 errors. Confirmed slim writer behaves correctly against live Trestle data.
3. **02:25 ET** — `npm run ops:neon-audit` against production (read-only). Audit's sample-based projection pegged sheddable at 23 MB / 32 % — turned out to be a 2-3× undercount because `projectShedSavings` was summing only per-value JSON byte length, omitting key + colon + comma overhead. Fixed in PR #76 with regression test pinning audit-vs-dry-run equality.
4. **02:30 ET** — `npm run ops:neon-shed` (full-scan dry-run): real numbers — 19,373 rows, 179.7 MB → 76.6 MB, 103.1 MB sheddable (57.4 %). 0 errors during walk.
5. **02:33 ET** — first `npm run ops:neon-shed:execute`: aborted with `Can't reach database server` because Neon free-tier compute had auto-suspended in the gap between dry-run and execute. Fixed in PR #76 with `withRetry` wrapper around every Prisma call.
6. **02:35 ET** — retried; sequential-update version was tracking to a 6.7-hour ETA at ~0.8 rows/sec. Killed at ~13,370 rows mutated.
7. **02:40 ET** — patched the worktree script in-place to use `prisma.$transaction([...])` per batch. Re-ran. 6,001 rows mutated in ~10 minutes (~50× speedup). PR #76 hardens this further to a single `UPDATE listings AS l SET raw_data = v.new_data FROM (VALUES ...) AS v(id, new_data) WHERE l.id = v.id` per batch — one statement, one round-trip, atomic.
8. **02:50 ET** — DB still at 293 MB because PostgreSQL UPDATEs leave dead tuples until VACUUM FULL.
9. **02:52 ET** — `VACUUM (FULL, ANALYZE) listings` via `prisma.$executeRawUnsafe`. Took 5.7s. listings table 270 MB → 173 MB, total DB 293 MB → 196 MB.
10. **02:53 ET** — `npm run ops:health` confirmed 196.23 MB / 39.2 % HEALTHY across all sections. Sleep-window operation closed.

## Required one-time operator actions still pending after merge

Two manual steps the user said they handled but I cannot independently verify:

1. **Set `NEON_API_KEY` + `NEON_PROJECT_ID` on the Vercel Production environment.** Without these, the new `neon-branch-prune` cron exits 200 with `skipped: true, reason: "..."` daily — visible in cron logs, doesn't fail, but doesn't actually clean. User stated these were added; will be confirmed when the 04:00 UTC fire on Apr 29 logs an actual `{ examined: N, pruned: N }` payload.
2. **Add `IDX_CLIENT_ID` + `IDX_CLIENT_SECRET` to GitHub Actions secrets** (NOT Vercel — this is for the `Trestle live audit` GitHub Actions workflow). User has these in `.env.local` and Vercel env, but they were never copied to GitHub Actions. Until added, `Trestle live audit` cron logs the new graceful-skip warning every day at 13:30 UTC. Add via `gh secret set IDX_CLIENT_ID --repo mallan67/mallan-nyc` (and the secret).

Both are credential-handling decisions that the agent permission-system blocks, so they remain operator-side.

## Known cosmetic noise

Vercel's preview-deploy "Checks" panel may briefly show "Branch limit exceeded" again if the cron fires between a preview deploy that was scheduled before tomorrow morning and the scheduled run. The check is pure UI status, not a deploy-blocking gate; the underlying build always succeeds. Once the user's Vercel env vars are confirmed live and one cron cycle has passed, this will not recur.

## File-level deltas worth noting for future sessions

- `lib/compliance/raw-data-keep-fields.ts` — keep set is **110 fields** (not 75 as the original PR description stated). `projectShedSavings` now matches `slimRawData` byte-for-byte; new test `keptBytes + droppedBytes === JSON.stringify(input).length` pins this invariant.
- `scripts/neon-shed-raw-data.ts` — bulk SQL UPDATE per batch, `withRetry` on every Prisma call, validated `--hours` and other CLI args.
- `scripts/neon-prune-branches.ts` (new) — `npm run ops:neon-prune` / `:execute`. Default dry-run; `--execute` mutates; `--hours=N` (validated).
- `app/api/cron/neon-branch-prune/route.ts` (new) — daily at 04:00 UTC. Returns 500 on partial-failure (per-branch DELETE errors) so Vercel cron logs flag it.
- `lib/neon/branches.ts` (new) — pure helpers: `listBranches`, `deleteBranch`, `isPrunable`, `pruneBranches`.
- `scripts/neon-precommit-guard.js` — token check now runs only in commit-msg context (when `GIT_COMMIT_MSG_FILE` is set), not in pre-commit where `.git/COMMIT_EDITMSG` always holds the *previous* commit's message. Was falsely rejecting any commit that followed one whose message lacked the token.
- `.github/workflows/auto-retry-runner-flake.yml` (new) — `workflow_run` listener for `Live Site Smoke (cron)`. Reruns failed jobs once when the failure signature is "no runner acquired" (zero failed steps). Bounded to one retry per run.
- `.github/workflows/trestle-live-audit.yml` — new "Verify Trestle secrets are configured" pre-flight + idempotent label creation.
- `.githooks/pre-commit` + `.githooks/commit-msg` — unchanged this session, but the script they invoke is fixed.
- `package.json` — `tsx@^4.21.0` pinned in devDependencies; new `ops:neon-prune` and `ops:neon-prune:execute` npm scripts; ops scripts use `--env-file-if-exists=.env.local --env-file-if-exists=.env` to load both candidate env files without hard-failing on either being missing.
- `vercel.json` — new cron `{ path: "/api/cron/neon-branch-prune", schedule: "0 4 * * *" }`.
- `NEON.md` — §10 change log got 2 new entries; new §11 documents preview-branch architecture decision + future-operator guard.

## Compliance gates state at session close

```
npm run type-check     → 0 errors
npm run lint           → 0 warnings (the pre-existing `generateAttributionText` unused-import on main was fixed in PR #80 alongside the cron work)
npm run test:compliance → 194/194 pass (149 pre-session + 45 added/touched this session)
npm run ucba:audit     → 46 PASS / 0 FAIL / 0 regressions
npm run ops:health     → HEALTHY across all sections
```
