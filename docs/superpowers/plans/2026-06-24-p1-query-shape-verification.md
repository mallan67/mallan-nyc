# P1 — query-shape verification (read-only EXPLAIN evidence) + revised index proposal

> **REPORT-ONLY.** Read-only `EXPLAIN` (no ANALYZE — plans only, nothing executed), host-guarded to cold-waterfall, read-only txn, ROLLBACK. No prod SQL writes, no migration apply, no reclaim, no downgrade, no branch, no reader swap. PR #443 set to **DRAFT** pending this proof.
> Date: 2026-06-24 · #415 Neon/Search Foundation · EXPLAINs reflect CURRENT indexes (P1 not applied) → they prove what each live predicate uses vs misses.

## Per-surface measurement
| # | Surface | Route/fn | Predicate (real) | Sort / limit | Cache | Plan today (EXPLAIN) | Index used | Missing? | Help now or post-PR-5B? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/search` default | `app/api/listings/route.ts:327` ← `buildPublicListingDbSearch` | gate booleans + `status IN(active)` | `list_price DESC`, LIMIT 24 | 2-min mem + s-maxage 60 | **Index Scan Backward `listings_list_price_idx`**, gate as Filter | list_price | gate is a Filter, not a seek | gate composite = **marginal** (price-sort already uses price idx); superseded by PR-5B |
| 2 | `/search` neighborhood | same + `postal_code IN(...)` | gate + `postal_code IN` | price DESC, 24 | same | **BitmapAnd**(status idx + idx_display/owner idx) → **`postal_code` = Filter** (cost ~6062) | status + idx_display_yn partial | **`postal_code` PROVEN unindexed** (post-bitmap filter) | **HELPS NOW** (interim; PR-5B projection already has postal_code) |
| 3 | Mallan exclusives | `route.ts` `?exclusive=mallan` | `listing_id LIKE 'SL-%' OR 'RL-%' OR rls_eligible=false` | mod_ts DESC, 12 | same | **BitmapOr** on `listings_listing_id_key` (prefix) + `rls_eligible_idx`, cost **45** | listing_id uniq + rls_eligible | none | **already efficient — no index needed** |
| 4 | Agent pages | `app/api/agents/[slug]/listings/route.ts:202` | `agent_id = ?` | `updated_at DESC`, 100 | s-maxage 300 | **Index Scan `listings_agent_id_idx`**, cost **25** | agent_id | none material | `(agent_id,updated_at)` saves only a tiny sort — **skip** |
| 5 | Open-houses | `app/api/open-houses/route.ts:373` | `type='openhouse' AND date>=today AND status<>'cancelled'` | `date ASC` | s-maxage 300 | **Seq Scan on showings**, cost **17.6** (tiny table) | none | `(type,date)` would serve it | **LOW urgency now** (showings small); **never superseded** — cheap future-proofing |
| 6 | `/search` address text | `public-listing-db.ts:143` | `address->>'StreetName' ILIKE '%x%'` | — | same | Bitmap on gate idxs → **JSON match = Filter** (cost ~6016) | status + idx_display | **JSON-path can't use btree** | **NOT a P1 fix** — needs `searchable_text` (PR-5B) or a `pg_trgm` GIN index (separate) |
| 7 | Detail / CRM lookup | `page.tsx`/`crm/[id]` `findUnique(listing_id)` | `listing_id = ?` | — | ISR 300 / none | **Index Scan `listings_listing_id_key`**, cost **8.4** | listing_id uniq | none | **perfect — no change** |

## What the evidence changed vs the sprint-report assumption
- **Gate composite — DOWNGRADED to "defer".** I expected it high-value, but EXPLAIN shows the planner already **BitmapAnd-combines** `listings_status_listing_type_idx` + `listings_idx_display_yn_owner_opt_out_idx` for the gate, and the price-sort path uses `listings_list_price_idx` with the gate as a cheap filter. A 5-col composite is a marginal win, costs storage on an over-cap table, and is **superseded for `/search` by PR-5B** (projection already has `lsp_distribution_gates_idx`). Recommend **NOT** adding it in P1.
- **`postal_code` — CONFIRMED high-value.** Query #2 proves it's an unindexed post-bitmap Filter on ~1646 rows. Add it.
- **`showings(type,date)` — correct but low urgency.** Seq scan is cheap today (tiny table); valuable as open-house volume grows; never superseded. Cheap (~tiny). Add-now (future-proof) or defer — low risk either way.
- **Address text search — not P1.** Confirmed unindexable as a btree; belongs to PR-5B `searchable_text` or a dedicated `pg_trgm` GIN index (its own decision).

## Revised proposed additive index list (EXPLAIN-grounded)
| Index | Verdict | Rationale |
|---|---|---|
| `listings_postal_code_idx (postal_code)` | **ADD (P1 core)** | PROVEN: neighborhood search filters postal_code unindexed (query #2). Interim (PR-5B projection has it; drop post-swap to reclaim). |
| `showings_type_date_idx (type, date)` | **ADD (cheap, future-proof)** | Open-houses seq-scans today; (type,date) serves eq+range+sort; never superseded. Tiny storage. |
| `listings_search_gate_idx (5-col gate)` | **DEFER / DROP from P1** | Marginal (existing BitmapAnd covers the gate); storage on over-cap table; superseded by PR-5B. |
| address `pg_trgm` GIN | **DEFER (separate decision)** | The real address-search fix; evaluate with PR-5B `searchable_text`. |

## Recommendation
Trim **#443** to the two EXPLAIN-justified additive indexes (**`listings_postal_code_idx`** + **`showings_type_date_idx`**) and drop the gate composite. Keep #443 a draft until you confirm the trimmed set; then it's a clean, minimal, additive PR. Apply-to-prod stays gated (low-traffic window; `CREATE INDEX` brief SHARE lock).

## Hard limits honored
No prod SQL writes, no migration apply, no reclaim, no downgrade, no Vercel/env, no new branch, no `/search` reader swap, no PR-5B implementation, no mixed docs/search PR. EXPLAIN only (plans, not executed).
