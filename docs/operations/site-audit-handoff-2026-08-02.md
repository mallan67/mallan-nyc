# Operational handoff — 2026-08-02

## Production identity

| | |
|---|---|
| `main` / production SHA | **`aafdd4c907f93d3a348b772c233ec3ead960ace4`** (Merge PR #593) |
| Deployment | `dpl_CZgaAzJrK2jf5FskPkJNpWozjnsj` — READY, holds the production domains |
| Verified | `https://mallan.nyc/api/release-identity` returned the merge SHA |

## PR #593 — what is and is NOT working in production

### ❌ CPU reduction is NOT functioning — the production Redis endpoint is unreachable

Three scheduled preflight runs (19:01, 19:10, 19:30 UTC) each logged:

```json
{ "event": "run_neon_cycle", "reason": "external_state_unavailable", "snapshot_trusted": false }
```

They correctly failed open and ran the full Neon cycle. **Zero CPU saving.**
The 19:30 run fetched 216 listings, performed 216 database updates and
processed 50 media rows, with zero manifest cache hits and no Neon skip.

#### What is PROVEN

| # | Evidence | Method |
|---|---|---|
| 1 | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are present, name-exact, Production-scoped (token len 71) | `vercel env` from the linked repo |
| 2 | Host `humble-bobcat-71648.upstash.io` → **ENOTFOUND**; `redis.get()` rejects with that cause | DNS + fetch, reproduced independently by the operator via `curl` (`could not resolve host`) |
| 3 | **No Upstash/Redis resource exists** in Vercel team `mallan`. All 7 stores enumerated: 4 Supabase, 2 Blob, 1 Neon (`neon-green-school`) | `GET /v1/storage/stores` |
| 4 | Both `UPSTASH_*` vars are plain manually-set encrypted vars — created **2026-03-14**, never updated, **no `contentHint`, no `storeId`** → they were **NOT provisioned by a Vercel Marketplace integration** | `GET /v10/projects/{id}/env` |

**Established conclusion:** the configured Upstash REST hostname does not
resolve, so the production Redis dependency is unavailable; and it is not
backed by any Vercel Marketplace resource, so there is nothing to repair on
the Vercel side.

#### What is NOT proven — HYPOTHESIS H-UPSTASH-1

> **The Upstash database was deleted.**

`ENOTFOUND` proves *endpoint failure*, not *resource deletion*. Fact 3 narrows
it (no Vercel-managed resource) but does not close it, because facts 3 and 4
together indicate the database was created **directly at upstash.com**, outside
Vercel — a database that Vercel's API cannot see whether it exists or not.

Equally consistent with the evidence: the stored URL is obsolete; the resource
was renamed or recreated under a new hostname; a free-tier database was expired
or reclaimed; or an Upstash-side DNS/resource fault.

**Missing proof:** a direct look at the Upstash console (`console.upstash.com`)
showing whether `humble-bobcat-71648` is present or absent. Until that is
captured, no document may state that the database was deleted.

#### Required action (operator — external service)

Because of fact 4, the check is at **Upstash directly**, not in the Vercel
Marketplace:

1. Open the Upstash console and determine whether `humble-bobcat-71648` exists.
   **Record the answer — it closes H-UPSTASH-1 either way.**
2. If absent → create a replacement Redis database.
   If present → retrieve or rotate its REST URL and token.
3. Replace both Production values: `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`.
4. Redeploy production.

No code change can fix this.

#### Blast radius — verified consumer by consumer

`lib/redis.ts` has exactly **three** consumers (there is no general caching
consumer — an earlier draft of this handoff wrongly listed one):

| Consumer | Behavior with the endpoint dead | Verified by |
|---|---|---|
| `lib/idx/one-cycle-preflight.ts` | `external_state_unavailable` → **full Neon cycle every poll**. No CPU saving. | production logs, 3 runs |
| `lib/api/cron-handler.ts` | Lock `redis.set` throws → `catch` → **fails open, cron runs**. Overlapping runs are possible. | source read, `cron-handler.ts:43-55` |
| `lib/middleware/rate-limiter.ts` | `redis` is non-null so limiters ARE constructed; calls throw → `catch` → **falls back to per-instance in-memory Maps**. Limits still apply, but per instance rather than globally. | source read, `rate-limiter.ts:109-110,184-185` |

Note the distinction: the cron lock **fails open**; rate limiting **degrades**
to per-instance rather than failing open. Neither has been observed failing in
production logs — the code paths are read, not measured, and the actual
observed behavior of each consumer still needs verification.

This is not caused by #593 — #593 merely surfaced it.

**Until a real skip is observed, do NOT report any CPU reduction from #593.**
The proof to wait for:

```json
{ "event": "skip_neon", "skipped": true, "neon_touched": false,
  "reason": "source_unchanged_no_backlog_due" }
```

Expected progression after Redis is restored: first poll
`state_missing_or_invalid` → full cycle → state written → a later genuinely
quiet poll skips.

### ✅ Cotality synchronization is healthy

- 19:01 run: 16 listings fetched, 10 updated, no listing errors; media member
  processed 49 records, completed
- 19:10 run: 213 listings fetched; media member processed 50 records, completed
- No runtime error cluster on either new cron route

The deployment did not break ingestion.

### ⏳ Storage cleanup has NOT run yet

`data-retention-finalize` is scheduled **03:00 UTC**. As of this handoff no
production invocation has occurred, therefore:

- **zero** diagnostic rows deleted by #593
- **zero** media tombstones compacted by #593
- the 100-row canaries are **untested**
- no storage effect is proven

**Do not widen either cap.** Both `RETENTION_DIAGNOSTIC_MAX_ROWS` and
`RETENTION_TOMBSTONE_MAX_ROWS` are deliberately unset ⇒ 100 rows each.

## Governance correction completed today

Codex correctly flagged that PR #593 opened the diagnostic-retention gate
while the canonical documents still said otherwise. OPS-010 specified the
order: (1) amend the canonical index, (2) update the registry row and derived
layers, (3) set the flag. **#593 shipped step (3) first.**

Steps (1) and (2) were completed the same day, before any deletion ran:

| File | Change |
|---|---|
| `COMPLIANCE-CANONICAL-INDEX.md` §14 | blanket "audit event logs 2 years" now points to the §15 exception |
| `COMPLIANCE-CANONICAL-INDEX.md` §15 | the two-action / 30-day operational-diagnostic exception stated explicitly, with the allowlist source, the gate, the bounds and the canary |
| `COMPLIANCE-CANONICAL-INDEX.md` §15 validator | records that `audit_events_diagnostics_purged` is expected non-zero and is NOT a 2-year breach |
| `PLATFORM-ISSUE-REGISTRY.md` OPS-010 issue row | "gate must remain off" replaced with the merged/live state, the honest sequence note, and the pending canary |
| `PLATFORM-ISSUE-REGISTRY.md` OPS-010 **Operational Fields** row | uniform "2yr-bounded" replaced with the explicit **three-tier** statement (30d two-action / 2yr everything else / exempt), + "widening requires amending §15 first" |
| `PLATFORM-ISSUE-REGISTRY.md` OPS-010 **Evidence Score** row | same three-tier correction, + the retention half recorded as **partially live and still unproven** (canary has not run) so the score is not upgraded on the gate merely being open |
| `PROJECT-HEALTH-DASHBOARD.md` | stale "purges ~2028" and "never purged" claims corrected |

All three OPS-010 rows were audited for the uniform-2-year claim; those were
the only three occurrences in the registry.

Only those two actions are exempt. Every other `AuditEvent` action remains on
the 2-year window.

## Further live finding (not caused by #593)

**The 19:10 cycle classified 201 of 212 listing updates as
`modification_timestamp_only`.** Direct evidence that write amplification is
still active. #593 never claimed to fix this; it explains why storage will keep
growing after the one-time diagnostic cleanup. Tracked under **OPS-010A**.

### Deferred to the public-read / cache investigation — NOT a finding of this PR

`Failed to set Next.js data cache` was observed, alongside zero manifest cache
hits with live DB fills. It is **deliberately not registered here** and carries
no OPS identifier, evidence score or owner yet, because this PR exists solely to
restore retention-governance consistency and an unregistered finding in a
governance PR is the same defect this PR is correcting.

Two things must not be assumed when it is picked up:

- **Do not attribute it to Redis.** The string is emitted by Next.js itself
  (`node_modules/next/dist/server/lib/incremental-cache/index.js`) — it is not
  authored anywhere in this repo, and it does not originate from `lib/redis.ts`.
  No causal link to the unreachable Upstash endpoint has been established.
- **Do not treat the two symptoms as one issue** until that is shown; the cache
  error and the zero manifest hits are separate observations.

Carry it into the `/api/listings` · listing-detail · alias · cache work as a
properly registered issue with its own evidence score, owner and verification
criteria.

## Immediate order

Operator-set order, 2026-08-02:

1. Correct the three PR #594 review findings. ✅ done
2. Confirm all new exact-head checks pass, then **merge #594 before 03:00 UTC**.
   If that cannot be completed by ~**02:30 UTC**, deploy the prepared gate
   revert (`revert/diagnostic-retention-gate-2026-08-02`, sets
   `DIAGNOSTIC_RETENTION_ENABLED: "false"`) instead.
3. **Independently verify whether the Upstash resource exists** — closes
   H-UPSTASH-1. Vercel cannot answer this (fact 4); use the Upstash console.
4. Replace or rotate the two Production Redis values; redeploy.
5. Prove **one real `skip_neon` / `neon_touched:false`** event. Expected
   progression: first poll `state_missing_or_invalid` → full cycle → state
   written → a later genuinely quiet poll skips with
   `source_unchanged_no_backlog_due`. **No CPU benefit may be claimed until
   that last event appears.**
6. Let the 03:00 UTC cleanup run at **100 + 100 only**.
7. Review exact deletion / compaction counts and bytes.
8. Keep both caps at 100 until that review is clean.
9. Move immediately to stopping the current `modification_timestamp_only` and
   `raw_data_only` write amplification.

Follow-up (not required to restore service): split the preflight's Redis
observability into `redis_client_missing` / `redis_read_failed` /
`redis_write_failed` so this class of silent degradation cannot be hidden
behind a single `external_state_unavailable` reason again.

Then: `/api/listings`, listing-detail, alias and cache corrections — including
the deferred Next.js data-cache finding above, properly registered.

## Neon plan / spend posture (from console screenshots, 2026-08-02)

Launch · compute fixed **0.25 CU** · scale-to-zero 5 min · 10 branches
included (1 in use) · **500 GB** transfer included (18.47 GB used, 3.7%) ·
storage $0.35/GB-mo · instant restore $0.20/GB-mo. Current-period spend
**$1.05**, which my own reading corroborates: 10.01 CU-h × $0.106 = $1.06.

Duty cycle period-to-date **94.9%** (92.3% before any of my test load) — the
compute is essentially never suspending, which is what #593 and the
public-read work are meant to change.

**Pending (Maya):** $40 notification-only organization spending limit. The
Neon console confirms notifications never pause or block projects.
