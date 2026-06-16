# Correction Trace Record — data-retention T+180 archive eligibility (NULL `status_changed_at`)

> **Status: IN-PR.** Scoped in `docs/audits/corrections/scope-archive-eligibility-bug-2026-06-15.md`
> (merged #404). This is the code fix: **predicate + RED test ONLY, behind a default-OFF flag — NO
> archive run, NO drain, NO cleanup, NO JSON rewrite, NO Neon downgrade.** Per Maya's bounds
> (2026-06-16).

## 0-pre. Mandatory media-PR preamble (incident 2026-05-21 §0.5)
Not a media writer (no `listing_media`/`media`/R2 path touched). Touches the §D **data-retention /
§2.05** surface only — terminal rows are already non-displayable, so this is storage hygiene. The
four canonical media regressions (JSON stomping / cursor deadlock / retry purgatory / layer
mismatch) are not reachable: no media, cursor, retry, or R2 code is touched.

## 1. Defect (Class A, code-proven)
`app/api/cron/data-retention/route.ts` T+180 archive filtered `status_changed_at: { lt: cutoff }`.
In SQL/Prisma `NULL < ts` is NULL (not true), so terminal rows with a NULL `status_changed_at`
(bulk-synced legacy rows) are **invisible to the archive forever** — only 34 of ~91,536 ever
archived (audit `neon-storage-cost-audit-2026-06-12.md`). Latent storage leak.

## 1b. The fix (exact)
- **Default-OFF flag `ARCHIVE_T180_BACKLOG_ENABLED`.** Unset/`!= "true"` → the route keeps the
  **current narrow** predicate (zero behaviour change on deploy — the nightly cron does NOT start
  draining). `== "true"` → the predicate broadens.
- **Broadened predicate = `COALESCE(status_changed_at, modification_timestamp) < cutoff`**, expressed
  in Prisma as `OR: [{ status_changed_at: { lt } }, { status_changed_at: null, modification_timestamp: { lt } }]`.
  `modification_timestamp` is NOT NULL (`prisma/schema.prisma:550`) and is the Trestle
  source-of-truth clock — **NOT `updated_at`** (`@updatedAt`, bumped by unrelated rewrites →
  backlog stuck forever).
- **Batch cap (`T180_BATCH_CAP = 500`), `maxDuration`, and the archive UPDATE-strip are unchanged.**
  The fix only changes WHICH rows qualify (when enabled). No deletion path; rows still preserved.

## 2. Pre-registered blast radius
- **WILL touch:** `app/api/cron/data-retention/route.ts` (the T+180 eligibility predicate +
  flag) · new `tests/runtime/data-retention-archive-eligibility.test.ts` · this Trace Record.
- **MUST NOT touch:** the archive UPDATE-strip / `listings_archive` upsert · the §2.05 idx-display
  flip · the T+30 media-null step · sessions/audit/notification/geocode purges · schema · cron
  config (`vercel.json`) · any media/R2 path. **No archive run, no flag enabled in this PR.**

## 4. Compliance pre-read (§D)
Data-retention / NY DOS 6-yr archive surface. Terminal rows are already non-displayable
(`filterDisplayableDbListings` + the §2.05 flip earlier in the same route), so broadening which
terminal rows archive is storage hygiene, not a display-gate change. The archive still extracts
`close_price`/`close_date`/`original_list_price` + `address_line` + agent fields before nulling
(unchanged) — no archive record loses data.

## 5. RED → GREEN
- **RED on `main`:** `main` has no flag/`OR`, so a NULL-`status_changed_at` old terminal row is
  never selected — the flag-ON test (asserting the `modification_timestamp` `OR` branch) fails.
- **GREEN after fix:** `tests/runtime/data-retention-archive-eligibility.test.ts` **4/4**:
  flag-OFF keeps the narrow predicate (NULL rows excluded) · flag-ON broadens via the
  `COALESCE`/`OR` (NULL old rows selected) · **anti-`updated_at`** (predicate never references
  `updated_at`) · **batch cap 500 preserved** in both states.

## 6. Gate results
| Gate | Result |
|------|--------|
| type-check | **0 errors** |
| runtime harness | **2133/2133** (133 suites) incl. the new 4 |
| compliance-check | **92 / 0** BLOCKER+STRICT (1 pre-existing release-truth warn, unrelated) |
| ucba:audit | **46 PASS · 0 REGRESSIONS** |
| gate:micro/macro · tristle · Codex | on PR |

## 7. Bounds (Maya, 2026-06-16)
Merge is execution-INERT (flag default OFF). The drain begins ONLY when Maya sets
`ARCHIVE_T180_BACKLOG_ENABLED=true` (a held env-var change = the explicit gate), capped at 500/run.
No cleanup, no drain, no JSON rewrite, no column drop, no normalization, no Neon downgrade, no
migration, no R2 in this PR.
