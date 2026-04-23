# Phase 1 Rollback Playbook

## What Phase 1 does

1. Backfills `listings.status_changed_at` for all 17,906 rows (was NULL)
2. VACUUM FULL on `listings`, `leads`, `social_proof_cache`

## What happens on the next cron run after deploy

The `data-retention` cron (daily 3 AM ET) will flip `idx_display_yn = false` on **4,231 closed listings** whose `status_changed_at` is now populated and >24 hours old.

**User-facing impact: zero.** Public search paths already filter `status IN ('Active', 'ComingSoon', 'ActiveUnderContract')` at the query level (verified in `lib/idx/get-listings-server.ts:166`, `lib/listing-momentum/scorer.ts:110`, `lib/social-proof/cache.ts:99`). Closed listings never appear publicly regardless of the `idx_display_yn` flag. This backfill just aligns the DB flag with what's already true in practice — a REBNY RLS §2.05 compliance cleanup.

---

## Rollback paths by failure mode

### Rollback case 1: Backfill set wrong values (unlikely)

The backfill uses `COALESCE(modification_timestamp, updated_at, created_at)`. All three fields are non-null on every row in the current DB (verified pre-run). If the output of `--verify AFTER` shows `status_changed_at_null_count > 0`, the backfill failed to populate some rows.

**Rollback:** None needed. The failure mode is "some rows still NULL", not "wrong values". Re-running the backfill is idempotent.

### Rollback case 2: Retention cron IDX-offs listings we still want displayed

This should not happen — the backfill only sets `status_changed_at` on listings whose `status` is already terminal (Closed/Sold/etc.), and public search doesn't display those anyway. But if it does:

```sql
-- Restore idx_display_yn for all listings that the cron just disabled
UPDATE listings
SET idx_display_yn = true
WHERE status IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled')
  AND updated_at > '<timestamp of cron run>'
  AND idx_display_yn = false;
```

Then revert Phase 0.1 of the data-retention cron (the `deleteMany` for audit events) — but note this rollback restores the original compliance bug.

### Rollback case 3: VACUUM FULL causes extended lock / outage

`VACUUM FULL listings` takes ACCESS EXCLUSIVE lock for ~30–60s. If the lock exceeds expected window:

- **During the lock:** public listings pages + CRM return connection timeouts / 503s. Retry from Vercel's load balancer typically recovers within one request cycle post-unlock.
- **Cannot be interrupted mid-rewrite** without risk — Postgres will finish or roll back cleanly.
- **Prevention:** run at 3–5 AM ET (lowest traffic window) and monitor Vercel logs for 503 spikes.

**There is no rollback for VACUUM FULL.** The operation only rewrites physical storage — the logical data is identical before/after. Nothing is "lost" so nothing can be "restored".

### Rollback case 4: You want to undo the whole Phase 1 (not recommended)

```sql
-- Re-introduce the compliance bug (only if genuinely needed)
UPDATE listings SET status_changed_at = NULL;
```

This reverts the retention cron to its broken state (will not flag closed listings). VACUUM FULL cannot be undone. You would also need to revert Phase 0's data-retention code change from `deleteMany` back to `count` (see `app/api/cron/data-retention/route.ts:37-46`).

---

## Pre-deploy checklist

- [ ] Phase 0 has been deployed and the keepalive is at `*/15` (verify on Vercel cron dashboard)
- [ ] `npm run ucba:audit` passes
- [ ] `npm run rls:validate` passes
- [ ] `npm run crm:test` passes
- [ ] `node --env-file=.env.local scripts/phase1-run.js --verify-only` captures pre-state
- [ ] Run scheduled for low-traffic window (3–5 AM ET)
- [ ] On-call aware of potential 30–60s read errors during `VACUUM FULL listings`
- [ ] Rollback SQL from case 2 copied to an accessible place

## Deploy commands

```bash
# 1. Capture pre-state
node --env-file=.env.local scripts/phase1-run.js --verify-only > phase1-before.txt

# 2. Execute cleanup (will run backfill + 3× VACUUM FULL, ~60-90s total)
node --env-file=.env.local scripts/phase1-run.js --execute > phase1-after.txt

# 3. Review diff
diff phase1-before.txt phase1-after.txt

# 4. Monitor next data-retention cron run (3 AM ET)
# Expected: results.closed_listings_removed_from_idx = 4231
```

## Expected state changes

| Metric | Before | After cleanup | After next retention cron |
|---|---|---|---|
| DB total size | 250 MB | ~215–220 MB | ~215–220 MB |
| listings size | 231 MB | ~195–205 MB | ~195–205 MB |
| listings dead_pct | 5.9% | <1% | <1% |
| leads dead_pct | 50.5% | <1% | <1% |
| social_proof_cache dead_pct | 32.5% | <1% | <1% |
| listings NULL status_changed_at | 17,908 | 0 | 0 |
| Closed listings with idx_display_yn=true | 4,231 | 4,231 | 0 |
| audit_events over 2 years | 0 | 0 | 0 (deletion cron active) |

## Neon storage meter note

Postgres-level free space is reclaimed immediately. The Neon billable storage meter may take up to 7 days to reflect the change due to PITR branch retention on the free tier (7 days). On Launch tier, it's 30 days.
