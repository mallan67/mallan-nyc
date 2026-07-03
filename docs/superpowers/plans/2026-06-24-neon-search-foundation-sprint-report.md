# Neon / Search Foundation Sprint — coordinated READ-ONLY report (Scopes A–G)

> **REPORT-ONLY. No patches, no PRs, nothing executed beyond read-only DB measurement + read-only code audit.** No SQL writes, no migrations, no reclaim, no Neon downgrade, no Vercel/env changes, no new Neon branch. All recommendations are gated on Maya's review.
> Date: 2026-06-24 · Board #415 · Inputs: read-only prod measurement (cold-waterfall) + 3 read-only code-audit agents. Proof type tagged [DB]=read-only SQL, [repo]=source read, [needs-probe]=behavior not live-verified.

---

## G.1 Executive summary
The listings/search system is **functionally working on every public surface** — but it rests on three structural facts that make it fragile and keep the DB at **287% of the Neon Free cap**:
1. **One giant table.** `listings` is 1041 MB of the 1369 MB DB; **696 MB is TOAST'd JSON** (`raw_data` 267 + `compliance` 202 + `features` 102 + `address` 34 + `media` 6). `agent_info` is already dropped. The downgrade is a **JSON-normalization problem**, not an index problem.
2. **A split reader that isn't fully wired.** A well-indexed `listing_search_projection` exists and is dual-written, but **PR 5B (public reader swap) is HELD**, so live `/search` reads the big `listings` table directly — missing the gate composite + `postal_code` index the projection already has, and doing **unindexable JSON-path address scans**.
3. **Two price/status sources.** Detail pages read **live Trestle**; search/Featured/agent cards read **DB-cached** values → bounded cross-surface staleness.

**Nothing is on fire** (all 9 surfaces WORKING/PARTIAL, correctness mostly PASS). The work is foundational hardening + storage reduction, sequenced behind the existing HOLDs.

## G.2 Health score
| Dimension | Score | Note |
|---|---|---|
| Search correctness | **B+** | 9/10 rules PASS; staleness + DB-path exclusive-ordering are the gaps |
| Public availability | **A−** | all surfaces working; multi-layer fallbacks |
| Index coverage (live `listings` path) | **C+** | core filters indexed; gate-composite + postal_code + Showing-composite missing |
| Storage health | **D** | 287% of Free cap; 696 MB JSON TOAST; 11–16% dead-tuple bloat |
| Data-model cleanliness | **C** | 4 fat JSON blobs remain; projection split unresolved (PR 5B) |
| Compliance posture | **A−** | DTO PII boundary solid; display gates typed-first |

## G.3 Immediate blockers (to the $0/Free downgrade — none are emergencies)
1. **696 MB of JSON** on `listings` — must shrink `raw_data`/`compliance`/`features` to approach 500 MB. [DB]
2. **DROP frees no bytes without a table rewrite** (NEON.md §4: never VACUUM FULL) — every column drop needs a Maya-gated pg_repack / dump-restore in a low-traffic window. [repo/NEON.md]
3. **Archive backlog not draining** — `ARCHIVE_T180_BACKLOG_ENABLED` = OFF; ~91.5k terminal rows still carry full JSON (~390 MB recoverable with no schema change). [repo]
4. **PR 5B held** — live search can't use the indexed projection until the reader swap is approved. [repo]

---

## A. Neon storage truth [DB, measured read-only on cold-waterfall]
- Canonical DB: `neondb` @ `ep-cold-waterfall-adno3ao2` (hidden-mountain), PG 17.10, plan **Launch** (10 GB cap). `agent_info` column **GONE** (count 0). Rollback branch deleted (2/5000→1/5000, Maya-confirmed).
- **DB = 1369 MB = 287% of 500 MB Free.**
- Top tables: `listings` **1041 MB** (heap 307 / **TOAST 696** / idx 38) · `listing_media` 176 · `listing_search_projection` 73 · `audit_events` 54 · rest <5 MB.
- `listings` JSON logical: **raw_data 267 · compliance 202 · features 102 · address 34 · media 6 MB**.
- Bloat (reclaimable only by rewrite): `listing_search_projection` 16,995 dead (15.5%) · `listings` 12,455 dead (11.3%) · `listing_media` 9,088 (3.2%).

## B. Search/listing surface map [repo]
**Backbone:** public surfaces read `prisma.listing` directly (gated by `lib/search/listing-access-decision.ts`); `listing_search_projection` is read ONLY by saved-search **alerts** (`lib/search/core.ts:139`) — **PR 5B public swap HELD**. List endpoints are **DB-first**; `/api/listings/[id]` is **Trestle-first** (inconsistent).

| # | Surface | Source | Status |
|---|---|---|---|
| 1 | `/search` → `/api/listings` | listings + media; Trestle fallback | WORKING (JSON-path address scan = perf risk) |
| 2 | Homepage Featured | `/api/listings` ×2 + featuredConfig | WORKING |
| 3 | Mallan exclusives (`?exclusive=mallan`) | listings (SL-/RL-/rls_eligible=false); no Trestle leak | WORKING |
| 4 | `/listing/[...slug]` | DB-first → Trestle → API | WORKING (5-min ISR staleness) |
| 5 | `/agents/[slug]` | Trestle (ListAgentMlsId) + listings(agent_id) | WORKING (no `(agent_id,updated_at)` composite) |
| 6 | CRM `/api/crm/listings(/[id])` | listings only; typed-first attribution | WORKING (no `(agent_id,status)` composite) |
| 7 | Sale/rental edit loaders | listings; `raw_data` hydration spine; dual-writes projection | WORKING |
| 8 | `/open-houses` | Trestle (Mallan office) + showings→listings | WORKING (no `(type,date,status)` composite) |
| 9 | listing APIs (`/api/listings`, `/api/idx/*`…) | mixed | WORKING; **`/api/listings/[id]` PARTIAL** (Trestle-first → CRM-only SL-/RL- falls to stale `data/listings.json`) |

## C. Search correctness [repo, needs-probe for rendering]
PASS: exclusives-first in Featured · Mallan studios in Featured · other-company studios excluded · sale/rental filters · agent current-row · withdrawn-don't-win · open-house linkage · public DTO PII boundary. **Gaps:**
- **Cross-surface staleness (price/status/DOM):** detail = live Trestle, search/Featured/agent = DB-cached; public DOM uses raw `raw_data.DaysOnMarket`, bypassing the UCBA-aware `getCurrentDom`. PARTIAL.
- **No exclusive-first ordering on the DB `/search` path** (only Featured + Trestle-merge pin exclusives) — confirm intended.
- **Cross-page dedupe gap:** CRM/IDX twin dedupe only within one result page.

## D. Index review [DB existing vs repo query-shape needs]
Existing `listings`: agent_id, bedrooms_total, (borough,neighborhood), (idx_display_yn,owner_opt_out), list_price, listing_id (uniq), modification_timestamp, owner_client_id, property_type, rls_eligible, (status,listing_type).
**Highest-value missing (live `listings` path):**
1. **Composite distribution-gate index** `(idx_display_yn, internet_entire_listing_display_yn, owner_opt_out, participant_only, status)` — predicate on *every* public read; projection already has it, `listings` doesn't.
2. **`postal_code`** — the real neighborhood-search path (`postal_code IN`).
3. **`Showing(type, date, status)`** — open-house query filters all three; only single-col indexes exist.
4. Secondary: `property_sub_type`, `listing_contract_date` (default `sort=newest`), `(agent_id, updated_at)`.
**Unindexable as written:** JSON-path `address` `string_contains` (the projection's flat `searchable_text` is the real fix → ties to PR 5B). No writes; EXPLAIN sampling deferred (read-only, can add).

## E. Remaining storage fronts [DB sizes + repo readers]
| Front | Size | Typed mirror? | Lever | Risk |
|---|---|---|---|---|
| **archive backlog** | ~390 MB recoverable | n/a (cron strips JSON on terminals) | **flip `ARCHIVE_T180_BACKLOG_ENABLED`** (no schema) | LOW — #1 win |
| `compliance` | 202 MB | mostly YES (`computeGateColumns` typed) | full A→D drop (~6 readers) | LOW–MED |
| `raw_data` | 267 MB | partial (DTO fallback) | remove `Media` from keep-set (dup of raw_data.Media) + slim + reslim | MED |
| `audit_events` | 54 MB (35 MB = one sync-noise burst) | n/a | cap diagnostic writer + purge sync-noise (keep §D events) | MED |
| `features` | 102 MB | partial | promote ~12 read keys → side table; then drop | MED–HIGH |
| `address` | 34 MB | partial | typed cols (street/unit/lat/long); 40+ readers | HIGH — do last |
| `media` JSON | 6 MB | YES (`listing_media` table is live, PR4) | retire 6 JSON writers → drop | HIGH coord, LOW value |

Critical: `'Media'` is in `RAW_DATA_KEEP_FIELDS` → the per-photo array is stored twice (the `raw_data.Media` copy is the real cost, not the 6 MB `media` column).

## F. Reclaim / downgrade SAFE path (design only — NOT executed)
1. **Freeable bytes:** archive drain ~390 MB (biggest, no schema) + compliance 202 + raw_data slim (Media dedup) + features 99 + audit 35. Realistic post-cleanup **floor ≈ 480–500 MB** — borderline Free; staying under needs the T+180 archiver to keep recycling new-listing growth.
2. **Neon-safe method:** **never `VACUUM FULL`** (NEON.md §4 — blocks all traffic). Use **pg_repack** (online, brief locks — *confirm extension availability on Neon Launch*) OR **dump → fresh Neon branch → repoint `DATABASE_URL`** (the 2026-06-02 rescue pattern; env-var change is HELD).
3. **DROP COLUMN frees nothing** until a table rewrite; each rewrite in a 3–5am ET window.
4. **Backup/snapshot REQUIRED before any rewrite** (protected Neon branch, like the Step-4 snapshot; Maya-gated, with a deletion plan).
5. **Approval gates:** every schema change, migration, cron-flag flip, reclaim, and the downgrade are on the §C HOLD list — each needs explicit Maya approval.
6. **Measurement before Launch→Free:** post-reclaim re-measure proving DB <500 MB **with margin**, AND the Vercel false-branch-limit ticket cleared, AND archiver demonstrably recycling.

## G.4 Fastest SAFE PR sequence (gated; no PRs opened)
**Parallelizable now (independent, low-risk):**
- **P1 — Index pack (additive, no data change):** add the gate composite + `postal_code` + `Showing(type,date,status)` (+ secondary) to `listings`. Pure `CREATE INDEX` (use `CONCURRENTLY` via migration); biggest correctness/perf win, lowest risk. *(Indexes add a little storage — net positive for search.)*
- **P2 — Archive drain readiness:** verify `status_changed_at` honesty, then (Maya-gated) flip `ARCHIVE_T180_BACKLOG_ENABLED` → ~390 MB reclaimed via the existing cron (no schema).
- **P3 — audit_events compaction:** cap `recordSyncDiagnostic` per-run + selective purge of the sync-noise burst (preserve §D audit-retention events).

**Sequential (each its own A→B→C→D, behind a snapshot + rewrite):**
- **S1 — `compliance` drop** (~202 MB; gate logic already typed-first; highest value/risk ratio).
- **S2 — `raw_data` slim** (remove `Media` from keep-set after the compliance-audit route pivots to `listing_media`; reslim existing rows).
- **S3 — `features` normalization** (side table for read keys; 30+ readers).
- **S4 — `address`** (last; 34 MB, 40+ readers, compliance-sensitive).
- **Then:** reclaim (rewrite) → re-measure → **downgrade decision**.

**Cross-cutting (decouple before the above harden):**
- **PR 5B decision** — swapping `/search` to the indexed projection fixes the gate-composite + postal_code + JSON-address-scan problems at once, and resolves the alert-vs-search divergence. Currently HELD — needs a Maya decision; it's the highest-leverage architectural move.
- **Staleness:** make public DOM use `getCurrentDom`; align price/status source between detail and search (or document the bounded window).

## G.5 Parallel vs sequential
- **Parallel:** P1, P2, P3 (independent; no shared schema). 
- **Sequential:** S1→S2→S3→S4 (each touches the same hot `listings` table + needs its own snapshot + rewrite window; don't stack rewrites). Reclaim + downgrade strictly last.
- **PR 5B** can proceed in parallel with P1–P3 but should land before betting search perf on new `listings` indexes (if the projection becomes the reader, index work shifts there).

## G.6 Exact HARD STOPS (unchanged)
No SQL writes · no migrations · no reclaim · no Neon downgrade · no Vercel/env changes · no new Neon branch without explicit approval + deletion plan · no destructive action · no claims without read-only proof. **All of the above is a PLAN — no PRs until Maya reviews and picks the sequence.**
