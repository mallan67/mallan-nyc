# LANE A — Featured-config operator plan: switch Featured sort `newest` → `price-desc` (temporary)

**Date:** 2026-06-10 · **Author:** Lane A audit agent (report-only) · **Status:** AWAITING MAYA APPROVAL — no change made
**Goal:** fix the public homepage Featured grid under-filling (4-of-6 cards) caused by newest-sort × media-coverage starvation while the RC1 media catch-up drains. Temporary, fully reversible.

---

## 1. Files inspected

| File | Role |
|---|---|
| `app/api/featured-config/route.ts` | GET (public, 5-min cache) + PATCH (broker-only) for the config. `DEFAULT_CONFIG.sort = "newest"` (line 19) is what production currently serves. PATCH upserts the active row AND writes an `AuditEvent` (`featured_config_update`). |
| `prisma/schema.prisma` (model `FeaturedConfig`, lines 1896–1909) | Table `featured_configs`: `pinned_ids TEXT[]`, `filters JSONB`, `sort TEXT DEFAULT 'price-desc'`, `display_limit INT DEFAULT 6`, `is_active BOOL`, `updated_by`, timestamps. |
| `prisma/migrations/20260314120000_add_featured_configs/migration.sql` | DDL — confirms column names/defaults. Note `updated_at` has NO SQL default (Prisma `@updatedAt`), so any raw INSERT must supply it. |
| `app/components/FeaturedListings.tsx` | Homepage client component. Fetches `/api/featured-config`, then `/api/listings` with `sort=<config.sort>`, `statuses=Active,ActiveUnderContract`, `excludeUndisclosed=true`, type/borough/price/beds from `config.filters`. Pages deeper (pageSize = max(limit*8, 48) = 48, maxPages 5) until the post-dedupe ordered grid ≥ limit (PR #368). |
| `lib/featured/featured-ordering.ts` | `filterFeaturedDisplayable` — the authoritative client-side gate: drops Coming Soon AND photoless rows (PR #366); `collectDisplayableFeatured` — the paging loop; `orderFeaturedListings` — exclusives → pinned → general, dedupe, cap to limit. |
| `lib/search/public-listing-db.ts` | Server-side sort mapping (lines 296–324): `newest` → `ORDER BY listing_contract_date DESC`; `price-desc` → `ORDER BY list_price DESC`. Both are plain `orderBy` changes — no `where` change, no display-gate change. |
| `lib/search/listing-access-decision.ts` | `SEARCH_DISPLAY_GATE` (fail-closed: `idx_display_yn=true, owner_opt_out=false, participant_only=false, internet_entire_listing_display_yn=true`) — untouched by a sort change. |
| `lib/media/listing-card-media.ts` | `getValidPhotoMedia` — what counts as a usable photo for the displayability gate. |
| `public/crm/js/dashboard/panels.js` (lines 6289–6494) | CRM "Featured Properties" broker panel — Sort dropdown (`fc_sort`: Price High→Low / Price Low→High / Newest First) + "Save & Publish" → `PATCH /api/featured-config`. |

---

## 2. Current config — code, DB row, live endpoint (verified 2026-06-10)

### 2a. DB row — **the `featured_configs` table is EMPTY**

Read-only `$queryRaw` SELECT against canonical production (host verified `ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech`; script fail-closed on any other host; `morning-bread`/`royal-dawn` never touched):

```
SELECT id, pinned_ids, filters, sort, display_limit, is_active, updated_by, created_at, updated_at
FROM featured_configs ORDER BY updated_at DESC;
→ []   (zero rows)
```

**There is no active row to UPDATE.** Production behavior comes entirely from the hardcoded `DEFAULT_CONFIG` fall-through in `app/api/featured-config/route.ts`:

```json
{ "pinnedListingIds": [], "filters": { "type": "sale", "boroughs": ["Manhattan"], "neighborhoods": [], "minPrice": 500000, "maxPrice": 0, "minBeds": 1 }, "sort": "newest", "limit": 6 }
```

### 2b. Live endpoint probe (read-only GET, 2026-06-10)

`GET https://mallan.nyc/api/featured-config` returned exactly the default above (`"sort":"newest"`) — consistent with the empty table. Cache headers: `s-maxage=300, stale-while-revalidate=600` → any change goes live within ~5–10 minutes.

---

## 3. Why `newest` under-fills (measured, not inferred)

The Featured card gate (PR #366) requires ≥1 usable Photo (`filterFeaturedDisplayable` → `getValidPhotoMedia`). The DTO `media` comes from the `listings.media` JSONB column (`lib/idx/public-dto.ts` line 398). Newest listings were synced most recently and the RC1 media catch-up has not yet backfilled their `listings.media`, so the newest-sort window is photo-starved.

Read-only production counts (Featured general-feed filter exactly mirrored: sale · Manhattan · ≥$500K · ≥1 bed · Active/ActiveUnderContract · fail-closed display gate):

| Window (first page, pageSize 48) | Rows | With usable photo |
|---|---|---|
| Top-48 by **newest** (`listing_contract_date DESC`) | 48 | **0** |
| Top-48 by **price-desc** (`list_price DESC`) | 48 | **21** |
| Entire eligible pool | 5,800 | 1,482 (25.6%) |

- Under `newest`, the first page yields **zero** displayable cards; even with the PR #368 deeper paging (5 pages × 48 = 240 newest rows scanned) the grid only reaches 4-of-6 — the newest ~hundreds of rows are almost entirely photoless.
- Under `price-desc`, the **first page alone** yields 21 displayable rows ≥ the 6 needed — the grid fills in one fetch. Older/expensive listings have long-synced media.
- (Photo check is a SQL approximation of `getValidPhotoMedia` — mediaType ∈ {null,'','photo','image'} + http(s) or root-relative URL; it does not replicate the resolver's URL-pattern floor-plan/PDF reclassification, but the 21-vs-6 margin makes the conclusion robust.)

A sort change alters **only** `ORDER BY` (`list_price DESC` instead of `listing_contract_date DESC`) — the `where`, display gates, status filter, and Coming-Soon/photoless exclusion are all unchanged. No compliance gate is touched.

---

## 4. Proposed change — exact operator action (Maya runs it, not the agent)

Because no DB row exists, the change is an **INSERT/create**, not an UPDATE. Two equivalent options; **Option A is recommended** because the PATCH route writes the compliance `AuditEvent` (`featured_config_update` — NY SHIELD / REBNY retention) automatically, which a raw SQL INSERT would bypass.

### Option A (recommended) — CRM admin UI

1. Log in to the CRM as BROKER → Dashboard → **Featured Properties** panel.
2. Leave all filter fields as loaded (Type=Sales, Manhattan, Min Price 500000, Min Beds 1, Limit 6, no pins).
3. **Sort → "Price High→Low"** (`price-desc`).
4. Click **Save & Publish**. (This issues `PATCH /api/featured-config`, creates the first `featured_configs` row with `sort='price-desc'`, `is_active=true`, and writes the AuditEvent.)
5. Verify within ~5–10 min: `GET https://mallan.nyc/api/featured-config` shows `"sort":"price-desc"`, then hard-refresh the homepage and confirm 6 Featured cards.

### Option B — raw SQL (only if the CRM panel is unavailable)

Run against the canonical production DB (`ep-cold-waterfall-adno3ao2`) ONLY:

```sql
INSERT INTO featured_configs (pinned_ids, filters, sort, display_limit, is_active, updated_by, created_at, updated_at)
VALUES (
  ARRAY[]::TEXT[],
  '{"type":"sale","boroughs":["Manhattan"],"neighborhoods":[],"minPrice":500000,"maxPrice":0,"minBeds":1}'::jsonb,
  'price-desc',
  6,
  true,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
```

(`updated_at` must be supplied explicitly — no SQL default. Filters JSON exactly mirrors the current served defaults so ONLY the sort changes.) If Option B is used, note in the ops log that the config change has no `featured_config_update` AuditEvent (raw SQL bypasses the route's audit write).

---

## 5. Rollback — exact command (provably reversible)

Pre-change state, captured 2026-06-10: **`featured_configs` has zero rows** and production serves `DEFAULT_CONFIG` (`sort:"newest"`). Therefore the byte-exact rollback is to return the table to empty:

```sql
DELETE FROM featured_configs;
```

(Safe precisely because the table held zero rows before this change — the only row(s) present afterward are the one(s) this action created. Verify first with `SELECT count(*) FROM featured_configs;` → expect 1.)

Alternative non-destructive rollback (keeps the row + audit trail): CRM Featured Properties panel → Sort → "Newest First" → Save & Publish — behaviorally identical to today (row with `sort='newest'` ≡ default fall-through), though the table is then 1 row instead of 0.

After either rollback, `GET https://mallan.nyc/api/featured-config` returns `"sort":"newest"` within ~5–10 min (cache TTL).

---

## 6. Risk assessment

| Risk | Level | Notes |
|---|---|---|
| Compliance (REBNY/IDX/Fair Housing/DOS) | **None identified** | Sort changes only `ORDER BY list_price DESC`. Display gates (`SEARCH_DISPLAY_GATE`), status filter, Coming-Soon + photoless exclusions, attribution, badges, IDX disclaimer all unchanged. `price-desc` is an already-supported, already-tested sort value (it is the schema default and a CRM preset). |
| Under-fill regression | **Low** | First price-desc page yields 21 displayable rows vs 6 needed (3.5× margin), measured live. |
| Content/brand shift | **Low–Medium** | The grid will headline the most expensive Manhattan sale listings (top of a $5800-row pool by price — likely $20M+ trophy listings) instead of newest. Cosmetic/brand judgment call for Maya, not a legal issue. |
| Performance | **Improves** | One `/api/listings` fetch instead of up to 5 paged fetches per homepage load. |
| Audit trail (Option B only) | Low | Raw INSERT bypasses the route's AuditEvent — use Option A, or log manually. |
| Reversibility | **High** | Pre-state = empty table (captured above); `DELETE FROM featured_configs;` restores it exactly. |
| Forgetting to revert | Medium | This is a TEMPORARY mitigation. Add a check: once RC1 media catch-up drains (newest-window photo coverage recovers), re-run the top-48-newest photo count; when it comfortably exceeds ~12/48, revert to `newest` if desired. |

**What this does NOT fix:** the root cause (media-coverage starvation on newest rows — RC1 catch-up still draining). The PR #368 deeper-paging code remains in place and is harmless under price-desc (the `enough` predicate is satisfied on page one).

---

## 7. What needs Maya approval

1. **The config change itself** — Featured sort `newest` → `price-desc` via CRM Featured Properties panel (Option A, recommended) or the SQL INSERT (Option B). This is the only action; it creates the first-ever `featured_configs` row.
2. Nothing else: no code change, no env change, no migration, no cron, no CRM frontend code edit (using the existing panel is an operator action, not a `public/crm/**` change). No holds in CLAUDE.md §C are triggered by the operator action itself.
3. Revert decision later: when RC1 media catch-up has drained, decide whether to return to `newest` (rollback commands in §5).

**Agent performed zero writes:** read-only SELECTs against canonical production only (host-guard verified), one read-only HTTPS GET, and this report file (uncommitted).
