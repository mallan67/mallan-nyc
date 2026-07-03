# Backend Search + Saved-Search Audit — 2026-06-26

**Status:** REPORT-ONLY · No code patches · No schema changes · No migrations · No production data writes · No Vercel/env changes · No archive/drain/Gate-5 changes · No Neon extension enabling · No new PR (recommendations only; execution requires separate Maya approval) · No PageSpeed/media work.

**Author:** Claude Code (Opus 4.8, 1M ctx) under Maya direction.

**Method:** Read-only source audit with `file:line` citations. Proof tags: `[repo]` = source read (static, verified this session); `[needs-probe]` = behavior not live-verified (requires a runtime/DB probe before it can be claimed true per CLAUDE.md §F proof-first). No live Cotality / Neon / Vercel query was run for this report.

**Scope of "search" here:** public listing search (`/search` → `/api/listings`), CRM/agent search, saved searches, and search alerts. Builds on the read-only facts in `docs/superpowers/plans/2026-06-24-neon-search-foundation-sprint-report.md` (Scopes A–G) and `docs/audits/crm-agent-search-architecture-audit-2026-05-21.md`.

---

## 0. TL;DR

> **See deep audit §12 for live-probe updates** (`backend-search-deep-audit-2026-06-26.md`, "§12 Live-Probe Results — 2026-06-27"): read-only probes confirmed public terminal exclusion; no FTS/trigram/vector or GIN/GIST indexes present; `bathrooms_full` unindexed; `is_exclusive` mislabeling quantified (41 marked / 34 third-party / 7 real); Gate-5 archived rows confirmed terminal and excluded from public search.

- **Search works on every public surface today,** but the live public reader (`/api/listings`) queries the big `listings` table directly: address search is an **unindexable JSON-path `string_contains` scan** with a case-variant workaround, and **amenity + keyword filters run as in-memory post-filters**, not in the DB. `[repo]`
- **A well-indexed `listing_search_projection` already exists, is dual-written, and carries a flat `searchable_text` column + materialized `amenity_keys`/`feature_flags`** — but the public reader swap onto it (**PR 5B**) is **HELD**. The projection is read live only by saved-search **alerts** (PR 5E) and the saved-search **count** endpoint. `[repo]`
- **Saved search is REAL and reasonably mature** for the agent/broker path: schema + CRUD API + alert cron + SendGrid email + audit trail + Fair-Housing name scan + an alert-gate that blocks projection-unsupported criteria. **Client-portal saved-*search* management is absent** — the buyer portal "saved" endpoint returns *liked listings* (favorites), not saved searches. `[repo]`
- **No `tsvector`, GIN, `pg_trgm`, `unaccent`, or `pgvector` exists anywhere** in the schema or migrations. The projection uses plain scalar B-tree indexes + a flat text column. `[repo]`
- **Neon full-text search is "useful soon" but P1, gated behind PR 5B.** **Vector search is "useful later," explicitly P2/P3, and must not be a P0** — basic saved search and the projection reader swap must be correct first. **Do not enable any Neon extension, and do not onboard Neon Storage / Functions / AI Gateway during the Gate-5 archive trial.**

---

## 1. Current-state map

### 1.1 Routes (search / listing / saved-search / alert)

| Route | Method | Reads | Auth | Notes |
|---|---|---|---|---|
| `/api/listings` | GET | `listings` table (+ media; Trestle fallback) | public | Live public search. `app/api/listings/route.ts` `[repo]` |
| `/api/idx/search` | GET | mixed Trestle/DB passthrough | public | Thin passthrough `[repo]` |
| `/api/buildings/search` | GET | (building search) | — | `app/api/buildings/search/route.ts` — `[needs-probe]` for exact backing store |
| `/api/crm/listings` (`/[id]`) | GET | `listings` only | agent/broker | Typed-first attribution; type/status filters `[repo]` |
| `/api/crm/saved-searches` | GET/POST | `saved_searches`; live count via `listing_search_projection` | agent/broker | `app/api/crm/saved-searches/route.ts` `[repo]` |
| `/api/crm/saved-searches/[id]` | GET/PATCH/DELETE | `saved_searches` | agent/broker | `[repo]` (CRUD) |
| `/api/crm/saved-searches/[id]/execute` | POST | projection/listings | agent/broker | On-demand run `[repo]` |
| `/api/crm/alerts` | — | alerts | agent/broker | `app/api/crm/alerts/route.ts` `[repo]` |
| `/api/cron/search-alerts` | GET | `saved_searches` → `listing_search_projection` | `CRON_SECRET` | Daily alert mailer `app/api/cron/search-alerts/route.ts` `[repo]` |
| `/api/search-alerts` | — | — | — | `app/api/search-alerts/route.ts` `[repo]` |
| `/api/search-alerts/unsubscribe` | — | — | token | CAN-SPAM unsubscribe `[repo]` |
| `/api/unsubscribe` | — | — | token | Secondary unsubscribe path `[repo]` |
| `/api/portal/buyer/saved` | GET | `client_listing_action` (`action='liked'`) | buyer/tenant portal | **Returns favorites, NOT saved searches** `app/api/portal/buyer/saved/route.ts` `[repo]` |

### 1.2 Prisma models involved `[repo]`

- **`Listing` / `listings`** — primary store. Search-relevant indexes (`prisma/schema.prisma:582-599`): `(status, listing_type)`, `list_price`, `(borough, neighborhood)`, `rls_eligible`, `bedrooms_total`, `modification_timestamp`, `agent_id`, `owner_client_id`, `postal_code` (P1 pack, 2026-06-24), `terminal_since`. **Missing on the live path:** the distribution-gate composite and `Showing(type,date,status)` composite (per the 2026-06-24 sprint report).
- **`ListingSearchProjection` / `listing_search_projection`** — dual-written reader. Columns include `searchable_text` (Text, `schema.prisma:2596`), `amenity_keys` (JSONB, `:2597`), `feature_flags` (JSONB, `:2598`). Indexes (`:2605-2613`): `(listing_type, mls_status)`, `(borough, neighborhood)`, `postal_code`, `list_price`, `bedrooms`, `bathrooms`, `property_sub_type`, `modified_at`, and a distribution-gate composite `(rls_eligible, idx_display_yn, internet_entire_listing_display_yn, participant_only_yn)`.
- **`SavedSearch` / `saved_searches`** (`schema.prisma:897-918`) — `lead_id?`, `agent_id?`, `name`, `criteria` (JSON), `last_run?`, `result_count?`, `alert_frequency?`, `alert_enabled` (default false), `last_alert_sent?`, `alert_email?`. Indexes: `lead_id`, `agent_id`, `(alert_enabled, alert_frequency)`.
- **`ClientListingAction` / `client_listing_action`** — favorites + alert "sent" ledger (`action ∈ {liked, sent, …}`). Backs the buyer-portal "saved" endpoint and the alert cron's de-dupe upsert.
- **`AuditEvent`** — append-only audit for saved-search create + cron lifecycle.

### 1.3 Query flow `[repo]`

**Live public search (`/api/listings`):**
```
params → buildPublicListingDbSearch()
       → criteriaToPrismaWhere()           lib/search/criteria-to-prisma.ts:233-292
       → + buildSearchDisplayWhere()        lib/search/listing-access-decision.ts (SEARCH_DISPLAY_GATE)
       → + addressConditions()              lib/search/public-listing-db.ts:116-174  (JSON-path string_contains, case-variant OR)
       → prisma.listing.findMany(...)       (DB: listings table)
       → applyPublicListingPostFilters()    lib/search/public-listing-db.ts:357-461  (amenity + keyword filtered IN MEMORY)
```

**Projection path (exists, used by alerts + counts; public swap HELD):**
```
criteria → runProjectionListingSearch()     lib/search/core.ts:96-178
        → criteriaToProjectionWhere()        lib/search/criteria-to-prisma.ts
        → prisma.listingSearchProjection.*   (DB: indexed projection; reads searchable_text/amenity_keys/feature_flags)
```

**Saved-search alert (daily cron):**
```
CRON_SECRET → savedSearch.findMany({alert_enabled, alert_frequency≠null})
            → canEnableAlertForCriteria() defense-in-depth gate (skip+audit if unsupported)
            → frequency throttle (daily<23h / weekly<167h skip)
            → runProjectionListingSearch({limit:10, modifiedSince:last_alert_sent})
            → recordSearchRun()  →  listingAlertEmail()  →  sendEmail() (SendGrid)
            → on success: bump last_alert_sent + upsert ClientListingAction('sent')
            → SMTP fail-loud → 503 + audit; per-search + bulk audit events
```

### 1.4 Frontend / backend split `[repo]`

- **CRM (agent) UI** is real and present: `public/crm/js/search/search-engine.js`, `public/crm/js/search/saved-searches.js`, `public/crm/js/dashboard/alerts.js`, `public/crm/html/modals/save-search.html`, `public/crm/html/my-searches.html`, `public/crm/html/search-form-and-results.html`. (Generated bundle is `public/crm/index-built.html` via `npm run crm:build` — do not hand-edit.)
- **Client portal** has favorites (liked listings) but **no saved-search management surface** — confirmed by `/api/portal/buyer/saved` returning `client_listing_action action='liked'`, not `saved_searches`.

---

## 2. Search capability matrix

| Capability | Verdict | Evidence / Notes |
|---|---|---|
| Facet filters: type, status, property_type, borough, neighborhoods, price/beds/baths/sqft ranges | **WORKS** | `criteria-to-prisma.ts:233-378`; all indexed on both paths `[repo]` |
| Free-text **address** search | **PARTIAL / RISKY** | JSON-path `string_contains`, case-sensitive, **unindexable**; 3 case-variant OR workaround `public-listing-db.ts:116-174`; "425 park avenue south"→0 rows class of bug noted 2026-06-24 `[repo]` |
| **Amenity** search (31 amenities) | **PARTIAL** | In-memory post-filter, not DB-pushed `public-listing-db.ts:407-446`; `AMENITY_FIELD_MAP` `types.ts:112-150` `[repo]` |
| **Keyword** search | **PARTIAL** | `PublicRemarks` substring post-filter only `public-listing-db.ts:448-458`; correctly excludes HID-tier remarks `[repo]` |
| **Building-name** search | **MISSING** (public path) | Not in `addressConditions`; `/api/buildings/search` exists but backing store `[needs-probe]` |
| **Unit-number** search | **MISSING** | Not exposed as a filter `[repo]` |
| Typo tolerance / fuzzy / ranking / relevance ordering | **MISSING** | No trigram/FTS; no relevance scoring; ordering is recency/price, not relevance `[repo]` |
| Saved-search **live count** | **WORKS** | Projection-backed `count()` with per-criteria cache `saved-searches/route.ts:79-100` `[repo]` |
| Saved-search **alerts → email** | **WORKS** | Projection-backed cron + SendGrid; throttled; audited `cron/search-alerts/route.ts` `[repo]` |
| Exclusive-first ordering on the DB `/search` path | **UNKNOWN / needs-probe** | Only Featured + Trestle-merge pin exclusives; DB `/search` ordering unconfirmed (sprint report line 59) `[needs-probe]` |
| Cross-surface price/status/DOM consistency | **PARTIAL / RISKY** | Detail = live Trestle; search/cards = DB-cached; bounded staleness (sprint report line 58) `[needs-probe]` |
| Public search excludes terminal/withdrawn | **WORKS (static)** | `SEARCH_DISPLAY_GATE` + status filters `listing-access-decision.ts` `[repo]`; live render `[needs-probe]` |

---

## 3. Saved-search verdict

**Verdict: EXISTS — mature on the agent path, with two real gaps (client-portal management, projection/live divergence already mitigated by a gate).**

| Layer | State | Evidence |
|---|---|---|
| **Schema** | ✅ Present | `saved_searches` `schema.prisma:897-918`: criteria JSON, alert_frequency/enabled, last_alert_sent, alert_email, lead_id/agent_id, indexes incl. `(alert_enabled, alert_frequency)` `[repo]` |
| **API (CRUD)** | ✅ Present | GET/POST `/api/crm/saved-searches`; `[id]` GET/PATCH/DELETE; `[id]/execute` POST `[repo]` |
| **Validation** | ✅ Strong | `validateCriteria()` (listing_type required; numeric/array guards); rejects null/array criteria (Codex P0 fix `route.ts:141-153`) `[repo]` |
| **Alert-gate (Engine A/B divergence guard)** | ✅ Present, defense-in-depth | `canEnableAlertForCriteria()` blocks alert enablement on projection-unsupported criteria at **POST** (422, `route.ts:180-193`) **and** in the **cron** (skip + audit, `cron/search-alerts/route.ts:60-78`) `[repo]` |
| **Live count** | ✅ Present | `listing_search_projection.count()` with status labels `projection_live / unsupported_criteria / invalid_criteria` `route.ts:79-117` `[repo]` |
| **CRM UI** | ✅ Present | `save-search.html` modal, `my-searches.html`, `saved-searches.js`, `alerts.js` `[repo]`; live render `[needs-probe]` |
| **Client-portal integration** | ⚠️ **GAP** | Buyer portal "saved" = **liked listings** (`client_listing_action action='liked'`), **not** saved searches. Clients receive alert *emails* but cannot view/manage saved searches in-portal `[repo]` |
| **Alert / email integration** | ✅ Present | SendGrid `sendEmail` + `listingAlertEmail`; daily/weekly throttle; SMTP fail-loud → 503; `ClientListingAction('sent')` de-dupe `[repo]` |
| **Compliance / audit trail** | ✅ Present | Fair-Housing scan on name (`scanTextForFairHousing`, 422); `logAuditEvent('create','saved_search')`; cron writes `search_alerts_cron` / `…_skipped_unsupported` / `…_smtp_unconfigured` / `…_error` audit events; unsubscribe routes exist `[repo]` |

**Open saved-search questions (needs-probe):** whether `alert_email` honors a per-listing/agent suppression list beyond the unsubscribe token; whether weekly throttle (167h) and `modifiedSince` window can drop a listing that flips compliant >24h after modification.

---

## 4. Backend design verdict

| Dimension | Verdict | Notes |
|---|---|---|
| **Correctness** | **B+** | Facets + gates correct; alert-gate prevents silent criteria-drop. Gaps: address case-sensitivity, no relevance ordering, exclusive-first on DB path unconfirmed `[repo]` / `[needs-probe]` |
| **Performance / index risk** | **C+** | Live path does **unindexable JSON-path address scans** + **in-memory amenity/keyword post-filters**; projection (which fixes both) is HELD behind PR 5B. Missing gate-composite on `listings` `[repo]` |
| **Pagination / sort stability** | **needs-probe** | Post-filtering *after* DB pagination can yield short/uneven pages when amenity/keyword filters cut results; confirm page-fill behavior `[needs-probe]` |
| **Archived / terminal / off-market exclusion** | **WORKS (static)** | `SEARCH_DISPLAY_GATE` + status filters exclude terminal from public search `[repo]`; live `[needs-probe]` |
| **IDX / RLS / REBNY compliance assumptions** | **A−** | Keyword search bounded to PUB-tier `PublicRemarks` (not HID-tier PrivateRemarks/ShowingInstructions); DTO PII boundary intact; distribution-gate composite present on projection `[repo]` |
| **Gate-5 archive impact on search** | **LOW for public, needs-probe for agent** | See §4.1 |

### 4.1 Can Gate-5 archive stripping affect search?

The Gate-5 archive drain strips fat JSON (`raw_data` / `compliance` / `features`, and potentially `address`) from **terminal rows** on `listings`. Reasoning:

- **Public search: not affected.** Public `/search` excludes terminal/withdrawn via the display gate + status filters, so stripped terminal rows never enter public results. `[repo]`
- **Projection-backed reads: not affected by drain.** `listing_search_projection.searchable_text` is **materialized** into its own table/column, so stripping the source `listings` JSON does not retroactively blank an already-built projection row. `[repo]`
- **Agent search that includes terminal/archived rows IS a risk.** The live `listings` path resolves **address via the `address` JSON blob** (`public-listing-db.ts:116-174`) and amenities via the `features` blob. If an agent surface ever queries terminal/archived rows after their JSON is stripped, address/amenity matching on those rows would silently return nothing. **This must be probed before the drain runs against rows any agent surface can search.** `[needs-probe]`

**Recommendation (no action now):** before flipping `ARCHIVE_T180_BACKLOG_ENABLED`, confirm that no agent/CRM search path reads stripped JSON columns on terminal rows, or that such rows are gate-excluded from every agent search. This is a Gate-5 pre-flip checklist item, not a code change.

---

## 5. Top-notch agent-search roadmap (priority-ordered, no execution implied)

- **P0 — Correctness of what exists.**
  1. Make address search case-insensitive and indexable (move off JSON-path `string_contains`). The lowest-risk route is the **projection `searchable_text` column already built** — i.e., land PR 5B's reader swap (or a read-only A/B). No new column needed.
  2. Confirm/define exclusive-first ordering on the DB `/search` path.
  3. Fix pagination/post-filter page-fill so amenity/keyword filters don't yield short pages.
- **P1 — Saved searches (the spine).** Close the **client-portal saved-search management** gap (view/pause/delete in-portal), and confirm alert windowing edge cases (§3 open questions). *Do not advance to P2/P3 until basic saved search is provably correct.*
- **P2 — Alerts / matching quality.** Relevance ranking, building-name + unit search, amenity/keyword pushed into the DB (via `amenity_keys`/`feature_flags` already materialized on the projection), typo tolerance.
- **P3 — Agent intelligence.** Similar-listings, buyer-preference matching, natural-language search, client↔listing matching, agent recommendation engine. **This is where vector search becomes relevant — and only here.**

---

## 6. Neon Search Features: Full-text / Vector / Future AI Matching

> This section directly answers the audit ask: is Postgres full-text and/or vector search worth adopting, and when? **Scope is read-only and advisory.** Nothing here recommends enabling an extension, changing schema, or running a migration now.

### 6.1 Current use of ILIKE / Prisma / raw SQL / trigram / full-text / vector `[repo]`

- **ILIKE / `mode:'insensitive'`:** *not* used for the free-text address path (Prisma JSONB `string_contains` has no insensitive mode), which is why the case-variant workaround exists. Typed-field filters use Prisma equality/range, not ILIKE.
- **Prisma filters:** primary mechanism — `criteriaToPrismaWhere` / `criteriaToProjectionWhere` build typed WHERE clauses.
- **Raw SQL (`$queryRaw`):** not the search backbone; search is Prisma-built. (No raw FTS query found.)
- **Trigram (`pg_trgm` / `gin_trgm_ops` / `similarity()`):** **none.**
- **Full-text (`tsvector` / `tsquery` / `to_tsvector` / `websearch_to_tsquery`):** **none.** The projection instead carries a flat, pre-lowercased `searchable_text` string used (today) only by `LIKE`-style projection matching for alerts.
- **Vector / embeddings / `pgvector`:** **none** anywhere in schema or migrations.

### 6.2 Useful now (P1, but gated — *not* a new extension)

- **Land the projection reader (PR 5B) before any FTS/vector work.** It already fixes the two worst issues (unindexable address scan; in-memory amenity/keyword) using **only existing scalar indexes + `searchable_text`**. This is the highest-value, lowest-risk search win and needs **no extension, no new column, no migration** — only the held reader swap. Doing FTS/vector *before* this would be optimizing the wrong layer.

### 6.3 Useful soon — Postgres full-text search (P1, after PR 5B)

**Could it improve address / building / neighborhood / amenity / search-box behavior?** Yes, materially:
- Case/accent-insensitive matching (with `unaccent`), word-stem matching, multi-term AND/OR/phrase queries, and **relevance ranking** (`ts_rank`) — none of which the current `LIKE`/post-filter approach provides.
- It cleanly solves the "425 park avenue south" class of bug and gives building-name + free-text-box search a single ranked path.

**Candidate fields:** the exact inputs already concatenated into `searchable_text` — `StreetNumber`, `StreetName`, `UnitNumber`, `BuildingName`, `City`, `neighborhood`, plus PUB-tier `PublicRemarks`. (Keep the HID-tier exclusion: never index PrivateRemarks/ShowingInstructions.)

**Indexes needed (future, gated):** a generated `tsvector` column (e.g. `to_tsvector('english', searchable_text)`) with a **GIN** index, on the **projection** (not the fat `listings` table). Optionally `pg_trgm` + `gin_trgm_ops` for fuzzy substring/typo tolerance on short tokens (unit/building). Requires enabling the `pg_trgm` / `unaccent` extensions — **explicitly deferred** (§6.5).

**Agent search & saved searches:** yes — both improve. The alert engine already reads the projection, so an FTS column would upgrade alert matching *and* live search through the same path, keeping Engine-A/Engine-B parity (the alert-gate already enforces criteria parity).

### 6.4 Useful later — vector / semantic search (P2–P3, NOT P0)

**Could vector search support AI-style matching later?** Yes, for genuinely semantic tasks that FTS cannot do:
- **Natural-language listing search** ("quiet 2BR near a park with a home office, under $1.2M").
- **Buyer-preference matching** (embed a buyer profile, rank listings by cosine similarity).
- **Similar listings** ("more like this").
- **Agent recommendation engine** / **client↔listing matching**.

**Hard precondition (per the ask):** **do not recommend vector search as P0.** It only earns priority once **basic saved search is correct** (P1 closed: projection reader landed, client-portal saved-search gap closed, alert windowing verified). Until then it's premature.

**Shape if/when approved (future, gated):** `pgvector` extension + an `embedding vector(N)` column on the **projection**, populated by an external embedding step; an **HNSW** (or IVFFlat) index for ANN search. Embeddings would be generated outside the DB. **Compliance caveat:** embed only display-permitted, PUB-tier content; never embed HID-tier or PII, and keep semantic results behind the same display/distribution gates as keyword results (semantic similarity must not bypass REBNY display gating).

### 6.5 Not recommended now

- **Do not enable any Neon/Postgres extension** (`pg_trgm`, `unaccent`, `pgvector`) during the Gate-5 archive trial — that's a schema/DB change under standing hold.
- **Do not onboard Neon Storage, Neon Functions, or Neon AI Gateway** during the Gate-5 archive trial.
- **Do not replace R2 / media storage** with Neon storage.
- **Do not move app functions off Vercel.**
- **Do not add a `tsvector` or `vector` column, GIN/HNSW index, or migration now.** Treat Neon FTS/vector strictly as **future search-architecture options**.
- **Do not let vector search jump the queue** ahead of PR 5B + saved-search correctness.

### 6.6 Risks

- **Extension/migration risk under active holds.** Any FTS/vector adoption touches schema, indexes, and migrations — all under standing Maya hold and NEON.md discipline. A `tsvector`/GIN add is a table rewrite-class change on a DB already at 287% of the Free cap (per 2026-06-24 sprint report); index bytes + a generated column add storage at the worst possible time.
- **Storage pressure.** GIN(`tsvector`) and especially `pgvector` HNSW indexes are sizeable; adding them before the JSON-normalization/storage reduction lands worsens the very cap problem Gate-5 is meant to relieve.
- **Compliance leakage via relevance.** FTS ranking and semantic similarity can surface rows that keyword filters would have ranked away; both must stay behind the existing display/distribution gates. Embedding HID-tier or PII text would be a REBNY/PII violation.
- **Engine divergence.** Introducing FTS only on one path (live vs alerts) would re-open the Engine-A/Engine-B gap the alert-gate currently closes. Any FTS column must serve both paths via the projection.
- **Operational cost of embeddings (vector).** Requires an external embedding pipeline, re-embedding on content change, and a model/version strategy — out of scope and premature until P1 is correct.
- **Gate-5 interaction.** Address/amenity matching that reads stripped terminal-row JSON (§4.1) is the live risk to verify *regardless* of FTS/vector.

### 6.7 Recommended PR sequence (advisory only — each requires separate approval; no production mutation implied)

1. **PR-A (no schema):** Decide/land **PR 5B** projection reader swap (or a read-only A/B shadow read). Fixes address case-sensitivity + amenity/keyword indexing using existing columns. *Prerequisite for everything below.*
2. **PR-B (no schema):** Close P0 correctness — exclusive-first DB ordering + pagination/post-filter page-fill + confirm terminal exclusion under Gate-5 (§4.1 checklist).
3. **PR-C (no schema):** Close the **client-portal saved-search management** gap and verify alert windowing edge cases. *"Basic saved search correct" milestone — the gate for any vector work.*
4. **PR-D (schema, HELD — needs extension):** Postgres **full-text** on the projection: generated `tsvector` + GIN (+ optional `pg_trgm`/`unaccent`), ranked search serving both live + alert paths. Requires enabling `pg_trgm`/`unaccent` + a Maya-gated migration in a low-traffic window; **only after storage reduction makes headroom.**
5. **PR-E (schema, HELD — needs `pgvector`, P2/P3):** **Vector** column + HNSW for semantic/AI matching (NL search, similar-listings, buyer matching). **Only after PR-C proves basic saved search correct**, and behind all display/PII gates.

---

## 7. Recommended next PR sequence (project-level, small & safe)

This mirrors §6.7 but states the *non-search-extension* ordering plainly, because the first three steps need **no extension and no new column**:

1. **PR 5B reader swap / shadow read** — biggest correctness+perf win, existing columns only.
2. **P0 correctness pack** — ordering, pagination page-fill, Gate-5 terminal-exclusion probe.
3. **Client-portal saved-search management** — closes the one real saved-search gap.
4. *(Held, separate approval, after storage reduction)* Full-text via projection `tsvector`+GIN.
5. *(Held, P2/P3, separate approval)* Vector/pgvector for AI matching.

No production mutation, no extension enable, no migration until each is separately approved.

---

## 8. Compliance section

- **REBNY RLS / IDX (display gating):** Search is gated by `SEARCH_DISPLAY_GATE` / `buildSearchDisplayWhere` and the projection's distribution-gate composite `(rls_eligible, idx_display_yn, internet_entire_listing_display_yn, participant_only_yn)`. Any future FTS/vector ranking **must apply the same gate before ranking** — relevance must never surface a gate-excluded row. `[repo]`
- **PUB vs HID tier:** Keyword search is bounded to PUB-tier `PublicRemarks` and must not extend to PrivateRemarks/ShowingInstructions (HID). Same boundary applies to any `searchable_text`, `tsvector`, or embedding input. `[repo]`
- **Fair Housing:** Saved-search names are scanned (`scanTextForFairHousing`, 422 on violation). Free-text search inputs and any future NL/semantic query handling should be checked against the same prohibited-term posture before being persisted/logged. `[repo]`
- **NY DOS advertising (19 NYCRR 175.25) / UCBA:** Search result cards are advertising surfaces — attribution/disclosure requirements continue to apply to any new ranked or AI-matched result list; semantic matching does not exempt a card from attribution. *(Read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` before implementing.)*
- **Saved-search email / CAN-SPAM / TCPA:** Alert mailer honors unsubscribe (`/api/search-alerts/unsubscribe`, `/api/unsubscribe`), throttles (daily/weekly), and fails loud on SMTP misconfig (503 + audit). Audit trail covers create + every cron outcome. Any new alert channel (e.g. AI-matched recommendations) must preserve unsubscribe + audit. `[repo]`
- **Audit retention:** Saved-search create and cron lifecycle write `AuditEvent` rows; FTS/vector adoption must not bypass audit logging on search-alert sends. `[repo]`
- **Per CLAUDE.md §F (proof-first):** every `[needs-probe]` item above requires a live URL probe / runtime log / failing-test-flipped-green before being claimed "fixed." This audit makes no rendering/behavior claims beyond static source reads except where tagged.

---

*End of report. No code, schema, migration, env, cron, or production change was made. Findings tagged `[needs-probe]` require live verification before action.*
