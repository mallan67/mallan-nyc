# Correction Trace Record — `P1C5` table-aware no-image metric + ghost-counter logging

> **Status: IN-PR.** Phase-1 Correction 5 (Maya standing queue, 2026-06-11). Closes deep-review
> **L11**; carries the ghost-logging item queued from RC5. **Observability only — NO schema, NO
> DB writes (read-only SELECT change + one log line), NO pipeline behavior change, NO cron
> config.**

## 0-pre. Mandatory media-PR preamble (incident 2026-05-21 §0.5)
1. **Incident doc read:** 2026-06-11.
2. **Chronic root cause addressed:** **§4 RC6 (observability)** — the first-image metric
   classified from `listings.media` JSON only (L11: monitoring chased the wrong layer); plus the
   RC5-queued gap: skipped ghosts invisible in runtime logs (the cron JSON is returned, never
   logged).
3. **Remaining OPEN:** Correction 6 (hard ghost-import item) · CI3 · M3 live capture ·
   crm:-upload advisory · fetch.ts classifier consolidation · W13 · held migrations · ALL data
   cleaning · OQ-1.
4. **Cannot reintroduce:** stomping/cursor/purgatory — zero pipeline code touched (the cron
   route gains ONE console.log; `runMediaSync` untouched); layer mismatch — this MEASURES the
   layers truthfully for the first time.
5. **Cleanup gate:** NO JSON/R2/data cleanup until the writer loops are closed — and this metric
   (`no_image_any_layer`) is precisely the number that will size M4 when cleanup unlocks.

## 1. Change
- `scripts/media-image-health.js` (new, pure): `deriveImageIssues` — alarm keys off
  `no_image_any_layer` (JSON empty AND no active `listing_media` row), thresholds 1000/5000
  (>= semantics preserved from the legacy alarm).
- `scripts/ops-health.js` image block: two additive SQL FILTER arms (`json_empty_table_served`,
  `no_image_any_layer` via EXISTS on active rows); additive report fields; legacy JSON-empty
  count retained and printed (re-labeled, never hidden); `idx_displayable_no_usable_image_lower_bound`
  now carries the render-path truth; orphaned THRESHOLDS keys removed; printer shows the 3-way
  split.
- `app/api/cron/media-sync/route.ts`: one guarded `console.log` when
  `ghost_listings_skipped > 0` — ghosts become greppable in Vercel runtime logs (closes the RC5
  §10 point-1 honesty gap).
- `tests/runtime/media-image-health.test.ts`: policy boundaries (999/1000/4999/5000), the
  false-alarm death case, message-truth assertion, structural locks (SQL split present; legacy
  fields retained; ghost-log guard present).

## 2. Pre-registered blast radius
- **WILL touch:** `scripts/ops-health.js` (image block + printer + THRESHOLDS comment) · new
  `scripts/media-image-health.js` · `app/api/cron/media-sync/route.ts` (one log line before the
  return) · new `tests/runtime/media-image-health.test.ts` · this Trace Record.
- **MUST NOT touch:** `lib/**` · Lane-D's R2-retry block · writers · schema · cron config ·
  `public/crm/**`.

## 3. Step log
| # | Step | Result |
|---|---|---|
| 1 | RED | policy module absent on main → test fails to resolve; ghost-log guard absent | ✅ RED |
| 2 | fix | module + SQL split + alarm rewire + printer + ghost log | ✅ |
| 3 | GREEN | **5/5** | ✅ |
| 4 | **B2 LIVE proof (run)** | production ops:health 2026-06-11: JSON-empty=10,716 → **TABLE-served=2,399 (render fine, no longer alarmed) · no_image_any_layer=8,317 (true placeholder count, drives the alarm)**. The 2,399 reclassified listings are the drain's accumulated output — the metric now shows recovery the old one hid. | ✅ |
| 5 | harness | type-check 0 · test:runtime **2122/2122** · ucba 0 regr · compliance-check 92/0 | ✅ |
| 6 | gates | §4/§5 | (pending) |

## 4. Gate results
(pending)

## 5. Sign-offs
(pending)
