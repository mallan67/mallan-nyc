# PR-5B parity verification — report + go/no-go (READ-ONLY)

> **REPORT-ONLY. No code, no migration, no SQL writes, no swap, no reclaim, no downgrade, no env.** Read-only DB measurement (cold-waterfall, read-only txn, ROLLBACK) + read-only code audit. Date 2026-06-24 · #415.

## GO/NO-GO: 🔴 **NO-GO for a `/search` reader swap as-is.**
The projection **TABLE is data-ready** (fully populated, 0 coverage gap) — the *backfill* is effectively done. But the projection **READ PATH is not parity-equivalent** to the current `listings` public path: it would drop Mallan website-only exclusives, lose neighborhood→ZIP search and most filters/sorts, and regress the result DTO. PR-5B is a **substantial reader build**, not a thin swap. **Recommendation: keep `/search` on `listings` (now P1-indexed); schedule PR-5B as a staged reader-parity project, not a quick swap.**

---

## Proof area results

### 1. Row-count parity [DB]
- listings displayable **10,627** vs projection displayable **10,626** (≈1 off).
- Of the 10,627, **2 are website-only** (`rls_eligible=false`): **SL-0004, SL-0007** (both "Mallan Real Estate Inc."). The projection gate excludes them (see §A). The ≈1 residual diff ties to the 1 stale row (§5).

### 2. Gate-field parity / freshness [DB] — ✅ better than expected
- Projection nullness ALL **0**: `mls_status`, `idx_display_yn`, `internet_entire_listing_display_yn`, `participant_only_yn`, `searchable_text`, `listing_type`, `postal_code` are **100% populated**. The "null until PR 5B" worry is **resolved in data** — no fail-closed-on-null risk (`displayable_but_projection_gate_null = 0`).
- **Coverage gap = 0** — every displayable listing exists in the projection.
- **Freshness: 1 row ~8h stale** (`proj_stale_vs_listing=1`, max lag 28,600s; `modified_at` null=0). Dual-write is non-blocking and lagged 1 row → needs a reconcile + freshness SLA before swap.

### 3. Filter parity [code] — 🔴 FAIL (mostly wiring gaps; data exists)
`criteriaToProjectionWhere`/`runProjectionListingSearch` support only a subset. PASS: type, price, beds, sqft, status. **PARTIAL:** baths (fused `full+half*0.5` vs listings' floor+half-bump), borough (exact vs case-insensitive contains), pagination (runner caps limit at 100; route allows 200). **FAIL/not wired:** **neighborhood→ZIP expansion (absent logic — core NYC search)**, `postal_code`, `property_sub_type` (Condo/Co-op/Townhouse/New-Dev facet), amenities, keywords, furnished, ownership, yearBuilt, commercial, new-development, address-text, **all sort modes** (runner hardcodes `modified_at desc`). The projection *table* has the columns/derived facets for most (so it's wiring, not data) — except neighborhood→ZIP which is genuinely missing.

### 4. Business-rule parity [code] — 🟠 PARTIAL/FAIL
- Featured "exclusives-first" + dedupe (`preferCrmExclusiveOverIdxDuplicate`) need full address atoms + `_source` → work **only if** rows are mapped through the full Listing DTO; the runner's `SEARCH_RESULT_LISTING_SELECT` is too thin (no `raw_data`/`features`/provenance) and projection scalars lack street atoms.
- Studio-in-Featured / other-company-studios-excluded depend on the `exclusive=mallan` isolation, which is **not wired** on the projection path.
- **`is_exclusive` is the WRONG signal** — built as `agent_id != null` (`listing-search-projection.ts:324`), which mislabels third-party buyer-side rows and misses SL-/RL- CRM rows. Exclusive logic must stay on SL-/RL- prefix + `_source`, never `is_exclusive`.

### 5. Address/text search [DB+code] — 🟠 PARTIAL
`searchable_text` is **100% populated** (data ready), but `criteriaToProjectionWhere` doesn't query it and the runner runs no post-filter → current address/keyword search behavior is not reproduced on the projection path.

### 6. DTO / privacy [code] — ✅ PASS (no leak) / 🟠 PARTIAL (shape)
`serializeSearchListing` is an explicit allow-list with **no agent PII, no `raw_data`/`agent_info`**, address suppressed via `isAddressDisplayable` — **safer** than the listings DTO. BUT it's leaner: drops `_source`, attribution/compliance envelope, `publicRemarks`, FARE fields, amenities, auction, open-house, and the gated exclusive contact card → would **regress `/search` card content** unless the DTO is rebuilt from a fatter joined Listing select.

### 7. Saved-search parity [code] — 🟠 PARTIAL
Reader *source* converges (one table) — the memo's cited benefit. But alerts already use the `rls_eligible=true` projection gate, so **alerts already silently exclude website-only Mallan exclusives**; a naive swap makes `/search` lose them too. Criteria vocabulary, dedupe, and ordering don't converge.

### 8. Performance [DB] — ✅ projection is well-indexed
Projection has the gate composite (`lsp_distribution_gates_idx`), `postal_code`, `(listing_type,mls_status)`, price/beds/baths, `property_sub_type`, `modified_at`, and a flat `searchable_text` (GIN-able) — strictly better for search than the big `listings` table. Performance is the *upside* of PR-5B; it's the only area with no parity concern. (P1 just added the gate + postal_code to `listings` for the interim.)

---

## Top blockers to a reader swap (must fix in PR-5B before any swap)
1. **🔴 Website-only gate drop** — `PROJECTION_DISPLAY_GATE.rls_eligible=true` (`listing-access-decision.ts:40`) excludes `rls_eligible=false` rows that `/search` includes (`public-listing-db.ts:184-189`). Confirmed live: drops **SL-0004 + SL-0007** (Mallan exclusives, incl. the #4D studio). Widen the projection gate with the website-only OR branch.
2. **🔴 `exclusive=mallan` not expressible + `is_exclusive` wrong** — must express SL-/RL-/`rls_eligible=false` on the projection; do not use `is_exclusive`.
3. **🔴 neighborhood→ZIP expansion absent** — core NYC neighborhood search would regress.
4. **🟠 Wire the missing filters + sorts + post-filters** into the projection path (data/columns exist; runner doesn't apply them; limit cap 100 vs 200).
5. **🟠 DTO rebuild** — fatten the joined Listing select so attribution/compliance/rich fields + dedupe + Featured ordering work (the join exists; the select is too thin).
6. **🟠 Freshness/backfill SLA** — reconcile the 1 stale row + guarantee dual-write freshness (row-count parity must hold at swap time).

## Recommendation
- **Do NOT swap now.** Keep `/search` on `listings`; P1 indexes (merged + applied) already improve it.
- **PR-5B is a real reader-parity project** (≈6 workstreams above), best done as its own staged effort behind the 12-gate test suite — not a one-line reader swap. The projection *data* is ready; the projection *reader* is not.
- If/when prioritized, sequence: widen gate (incl. website-only) → fix exclusive identity → port neighborhood-ZIP + all filters/sorts/post-filters → rebuild DTO from a fatter join → freshness SLA + row-count-parity gate → full parity test suite → swap behind a flag.

## Hard limits honored
No swap, no code, no migration, no SQL writes, no reclaim, no downgrade, no env, no new branch. Read-only DB + code audit only.
