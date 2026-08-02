# Operational handoff — 2026-08-02

## Production identity

| | |
|---|---|
| `main` / production SHA | **`aafdd4c907f93d3a348b772c233ec3ead960ace4`** (Merge PR #593) |
| Deployment | `dpl_CZgaAzJrK2jf5FskPkJNpWozjnsj` — READY, holds the production domains |
| Verified | `https://mallan.nyc/api/release-identity` returned the merge SHA |

## PR #593 — what is and is NOT working in production

### ❌ CPU reduction is NOT functioning — Upstash database is gone

Both scheduled preflight runs (19:01, 19:10 UTC) logged:

```json
{ "event": "run_neon_cycle", "reason": "external_state_unavailable", "snapshot_trusted": false }
```

They correctly failed open and ran the full Neon cycle. **Zero CPU saving.**

**Root cause — diagnosed 2026-08-02, and it is NOT a configuration error:**

```
UPSTASH_REDIS_REST_URL    present, correct name, Production scope
UPSTASH_REDIS_REST_TOKEN  present, correct name, Production scope (len 71)
host                      humble-bobcat-71648.upstash.io
DNS resolve               ENOTFOUND
fetch cause               ENOTFOUND
```

The env vars are right and the client IS constructed. `redis.get()` throws
because **the Upstash database no longer exists** — the hostname does not
resolve. Credentials are 141 days old.

**Required action (Maya, external service):** reprovision an Upstash Redis
database and set fresh `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
in Vercel Production. No code change can fix this.

**Wider blast radius:** `lib/redis.ts` is also the backend for durable rate
limiting, cron distributed locks and short-lived caching. All of those have
been silently degraded (they fail open by design) for as long as the database
has been unreachable. This is not caused by #593 — #593 merely surfaced it.

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
| `PLATFORM-ISSUE-REGISTRY.md` OPS-010 | "gate must remain off" replaced with the merged/live state, the honest sequence note, and the pending canary |
| `PROJECT-HEALTH-DASHBOARD.md` | stale "purges ~2028" and "never purged" claims corrected |

Only those two actions are exempt. Every other `AuditEvent` action remains on
the 2-year window.

## Two further live findings (not caused by #593)

1. **`Failed to set Next.js data cache`** logged on the second cycle, and both
   cycles showed **zero manifest cache hits with live DB fills**. The broader
   cache layer is not healthy. Plausibly related to the dead Redis, but not
   yet proven — needs its own diagnosis.
2. **The 19:10 cycle classified 201 of 212 listing updates as
   `modification_timestamp_only`.** Direct evidence that write amplification
   is still active. #593 never claimed to fix this; it explains why storage
   will keep growing after the one-time diagnostic cleanup.

## Immediate order

1. Reprovision Upstash; set both Production vars; redeploy.
2. Verify a real `skip_neon` / `neon_touched:false` event.
3. Let the first nightly canary process ≤100 diagnostics and ≤100 tombstones.
4. Verify exact rows and bytes before widening anything.
5. Then `/api/listings`, listing-detail, alias and cache corrections.
6. Then stop `modification_timestamp_only` and `raw_data_only` writes before
   attempting physical storage reclamation.

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
