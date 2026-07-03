# Deep Backend Search Audit — 2026-06-26

**Status:** REPORT-ONLY · No code changes · No schema changes · No migrations · No PR · No production data writes · No Vercel/env changes · No Gate-5/archive/drain changes · No Neon extension enabling · No PageSpeed/media work.

**Author:** Claude Code (Opus 4.8, 1M ctx) under Maya direction.

**Method:** Every file that participates in search was read line-by-line by 7 focused read-only agents (public query engine, aux routes + NL parser, CRM/agent search, saved-search/alerts, projection + PR 5B, schema/indexes, public frontend), cross-checked against three read-only 2026-06-24 PR 5B docs read directly by the orchestrator. Every claim is tagged:
- `[confirmed-repo]` — static code proof (file:line)
- `[needs-live-probe]` — requires runtime/API/DB proof before it can be claimed true (CLAUDE.md §F)
- `[risk]` — likely problem from the design
- `[recommendation]` — proposed fix (advisory; no code written)

**Companion doc:** `docs/audits/backend-search-saved-search-audit-2026-06-26.md` (the earlier saved-search-focused audit + Neon FTS/vector section). This file is the deeper, code-grounded successor and supersedes its current-state map where they differ.

---

## 1. Executive verdict (blunt)

**Is backend search good enough for PUBLIC users?** **Adequate, not top-tier.** Every public surface works and is compliance-correct, but the live reader runs an **unindexable JSON-path address scan** + **in-memory amenity/keyword post-filters**, the **Trestle fallback post-filters *after* pagination** (page instability + inaccurate counts), and **ZIP is filtered client-side** (count drift). There is **no relevance ranking, no fuzzy/typo tolerance, no unit-number search, and building-name search only works on the Trestle fallback path.** `[confirmed-repo]`

**Is it good enough for AGENTS?** **Partially.** The CRM has a genuinely rich OData filter builder (20+ params) and clean Mallan-exclusive vs third-party separation, but there is **no dedicated top-tier agent-search UI** beyond the CRM grid, **no relevance/match scoring**, and `sales`/`rentals` list endpoints return **full listing records (incl. JSON) with no `select` narrowing**. `[confirmed-repo]`

**Is saved search truly working or only partly?** **Working for agent-created alerts; partial as a platform.** Agent/broker CRUD, alert cron, throttle, SendGrid send, dedupe, audit, and a defense-in-depth Engine-A/B alert-gate all exist and are solid. But there is **no client-facing saved-search management** (portal "saved"/"favorites" return liked listings, not searches), **unsubscribe is email-based with no global suppression list**, and alert criteria are **silently narrowed** to the projection's supported subset. `[confirmed-repo]`

**Is the design scalable?** **Conditionally.** The scalable path — a fully-indexed `listing_search_projection` with a flat `searchable_text` column — **already exists and is data-ready**, but the public reader swap (**PR 5B**) is **HELD** and is a real 6-workstream reader-parity project, not a thin swap. The current live path will not scale gracefully (JSON-path scans, in-memory filters, a 1041 MB TOAST-heavy `listings` table). `[confirmed-repo]`

**Biggest failure:** **The search engine is split-brained.** Two engines coexist — the live public path reads `listings` directly (JSON-path address, in-memory amenity/keyword, the indexed-but-incomplete reader bypassed) while saved-search **alerts** read the indexed `listing_search_projection`. This split is the root of (a) the unindexable address scan, (b) in-memory amenity/keyword filtering, (c) the alert-vs-on-site divergence, and (d) PR 5B's six parity blockers. The second-biggest is the **absence of any client-facing saved-search experience**.

---

## 2. Current architecture map

| File / route / model | Purpose | Reads from | Filters supported | Index support | Risks |
|---|---|---|---|---|---|
| `app/search/page.tsx` | Public search UI (5 view modes: split/all-listings/all-map/grid/list) | `/api/listings` via `lib/hooks/useListings.ts` | price, beds, baths, neighborhood, borough, ZIP, type, subtypes, ownership, status, yearBuilt, furnished, amenities, openHouse, sqft, sort, address `q` | n/a (client) | ZIP is client-side post-filter (count drift); client re-sort can diverge from server `[risk]` |
| `app/api/listings/route.ts` | Public search API (DB-first → Trestle fallback) | `prisma.listing` (+`listing_media`); Trestle OData fallback | full facet set + amenities/keywords + `exclusive=mallan` + numbered-address | `list_price`, `(status,listing_type)`, `(borough,neighborhood)`, `postal_code`, `rls_eligible` | Trestle post-filter-after-pagination; amenities DB-only; building-name Trestle-only `[risk]` |
| `lib/search/public-listing-db.ts` | DB query builder + post-filters | `prisma.listing` | address (JSON-path), amenities, keywords, ranges, status, subtype | none for address JSON / amenities (in-memory) | Unindexable `address->>StreetName` scan; in-memory amenity/keyword `[risk]` |
| `lib/search/public-listing-trestle.ts` | Trestle OData filter builder | `api.cotality.com` | type, price, beds, baths, sqft, status, ZIP, county, subtype(limited), keyword | Trestle-side | PropertySubType crashes OData (502) → post-filter; amenities not in `$select` `[risk]` |
| `app/api/idx/search/route.ts` | CRM IDX live search passthrough | Trestle | via `crm-idx-filter` | Trestle-side | Sponsor-unit post-filter → inaccurate counts `[confirmed-repo]` |
| `app/api/listings/suggest/route.ts` | Autocomplete | Trestle + local neighborhood JSON + `prisma.agent` | borough/neighborhood/agent/listing-id/address | not pre-indexed (live) | Live Trestle per keystroke-batch; classification regex edge cases `[risk]` |
| `app/api/listings/similar/route.ts` | "Similar listings" | `prisma.listing` → Trestle fallback | same type + price band 30–170% + same ZIP/neighborhood | uses listing indexes | Coarse filter, not true similarity; `beds` param is dead code `[risk]` |
| `app/api/listings/building/route.ts`, `app/api/buildings/search/route.ts` | Building search | raw SQL on `listings` → Trestle | street# + name (`contains`); 3-tier building identity merge | `Building` name/borough/zip indexes | No fuzzy matching; building feature arrays unindexed `[risk]` |
| `app/api/listings/[id]/route.ts` | Listing detail API | Trestle-first → `data/listings.json` fallback | by id | `listings_listing_id_key` | **Local-JSON fallback bypasses live display gate** `[risk]` |
| `app/api/crm/listings/route.ts` | CRM listing grid | `prisma.listing` | type, status; SL-/RL- vs Trestle-closed; ownership | `(status,listing_type)`, `agent_id` | limit cap 200; full JSON select |
| `app/api/crm/sales|rentals/listings/route.ts` | CRM sale/rental lists | `prisma.listing` | `listing_type`+`agent_id` | `(status,listing_type)`, `agent_id` | **No `select` narrowing** → full record incl JSON `[risk]` |
| `app/api/agents/[slug]/listings/route.ts` | Agent profile listings | `prisma.listing` (agent_id, take 100) + Trestle (ListAgentMlsId) | by agent | `agent_id` | No `(agent_id,status)` composite `[needs-live-probe]` |
| `lib/search/crm-idx-filter.ts` / `crm-idx-mapper.ts` | CRM OData filter + RESO→CRM map | Trestle | 20+ params; 45+ mapped fields | Trestle-side | `agentEmail`/`agentPhone` mapped unconditionally `[risk]` |
| `lib/search/core.ts` (`runProjectionListingSearch`) | Projection reader (alerts + saved-search counts) | `listing_search_projection` (+ joined `listing`) | projection-supported criteria subset | full projection index set | Hardcodes `modified_at desc`; limit cap 100 |
| `lib/search/listing-search-projection.ts` | Projection row builder + dual-write | `prisma.listing` → projection | n/a (writer) | n/a | `is_exclusive = agent_id != null` is the **wrong** signal `[risk]` |
| `lib/search/criteria-to-prisma.ts` | Two WHERE builders + alert-gate | both | `criteriaToPrismaWhere` (full) vs `criteriaToProjectionWhere` (59-key subset) | both | Engine A/B divergence; projection drops address/amenity/keyword/sort `[risk]` |
| `lib/search/listing-access-decision.ts` | Display gates | both | `SEARCH_DISPLAY_GATE` / `PROJECTION_DISPLAY_GATE` | gate composite (projection) | Projection gate `rls_eligible=true` drops website-only exclusives `[risk]` |
| `app/api/crm/saved-searches/**`, `app/api/cron/search-alerts/route.ts` | Saved-search CRUD + alert mailer | `saved_searches` → `listing_search_projection` | criteria JSON | `(alert_enabled,alert_frequency)`, `lead_id`, `agent_id` | No suppression list; email-based unsubscribe `[risk]` |
| `prisma/schema.prisma` models | `Listing`, `ListingSearchProjection`, `SavedSearch`, `ClientListingAction`, `Building`, `Showing` | — | — | see §E | `bathrooms_full` unindexed; no tsvector/GIN/pg_trgm/pgvector `[risk]` |

---

## 3. What works (`[confirmed-repo]`)

1. **Facet filtering** (type, status, price, beds, baths, sqft, borough) on both DB and Trestle paths — `lib/search/public-listing-db.ts:177-307`, `public-listing-trestle.ts:141-222`.
2. **Two-tier public display gate** keeps Mallan website-only exclusives visible: RLS rows pass the full `SEARCH_DISPLAY_GATE`; `rls_eligible=false` rows pass a minimal gate — `app/api/listings/route.ts:310-322`. This is the exact behavior PR 5B's projection gate would regress.
3. **Terminal/off-market/archived exclusion** is fail-closed by a hardcoded allowlist (`Active`, `ComingSoon`, `ActiveUnderContract`) on every public + alert path — `public-listing-db.ts:14`, `public-listing-trestle.ts:28-30`, `lib/compliance/status.ts:128-132`.
4. **Mallan-exclusive vs third-party separation** in CRM and agent pages, with `preferCrmExclusiveOverIdxDuplicate` dedupe and a deliberate refusal to classify by `agent_id` (which would mislabel Trestle rows) — `app/api/crm/listings/route.ts:38-54`, `app/api/agents/[slug]/listings/route.ts:259-266, 85-86`.
5. **Agent-listing matching** by stable `ListAgentMlsId` (REBNY invariant I.4), full-name only as fallback — `app/api/agents/[slug]/listings/route.ts:140-148`.
6. **Saved-search system (agent path):** CRUD with ownership gates, criteria validation, Fair-Housing name scan, audit logging — `app/api/crm/saved-searches/route.ts:126-223`, `[id]/route.ts`.
7. **Alert cron:** `CRON_SECRET` timing-safe auth, daily/weekly throttle, projection-backed query, SendGrid send, `ClientListingAction('sent')` dedupe, SMTP fail-loud→503, full audit — `app/api/cron/search-alerts/route.ts`.
8. **Engine-A/B alert-gate** (`canEnableAlertForCriteria`) blocks alert enablement on projection-unsupported criteria at create, patch, **and** cron (defense-in-depth) — `lib/search/criteria-to-prisma.ts:217-231`.
9. **The projection itself is data-ready:** coverage gap 0, gate booleans 100% populated, `searchable_text`/`amenity_keys`/`feature_flags` built — verified read-only on prod (`docs/superpowers/plans/2026-06-24-pr5b-parity-verification-report.md:16-19`).
10. **CRM OData filter builder** covers 20+ params with a fail-closed checkbox allowlist — `lib/search/crm-idx-filter.ts:38-307`.
11. **Compliance disclosures present in source** across search + detail: REBNY attribution, FARE Act (rentals), NY DOS §175.25, Fair Housing, address suppression — `app/components/IDXDisclaimer.tsx`, `app/listing/[...slug]/page.tsx:2147-2168, 1032-1043`.
12. **No N+1** on the DB path (single `findMany` with relational media) or Trestle path (bounded `Promise.allSettled` concurrency 5) — `app/api/listings/route.ts:326-404, 934-1016`.
13. **P1 index pack applied** (`postal_code`, `showings(type,date)`) with EXPLAIN justification — `docs/superpowers/plans/2026-06-24-p1-query-shape-verification.md`.

---

## 4. What partially works (with failure mode)

1. **Address search** — works via a JSON-path `string_contains` with a 3-way case-variant OR workaround, but is **unindexable as a btree** and case-fragile (the "425 park avenue south → 0 rows" class). `lib/search/public-listing-db.ts:90-174`; EXPLAIN-confirmed unindexed (`p1-query-shape-verification.md:14`). `[confirmed-repo]` `[risk]`
2. **Amenity & keyword search** — work as **in-memory post-filters on the DB path** (`applyPublicListingPostFilters`, `public-listing-db.ts:357-461`); on the **Trestle path only pet-friendly + keyword are pushable** (amenity fields aren't in IDX Plus `$select`) → amenity filters silently do nothing when results come from Trestle. `app/api/listings/route.ts:744, 773-785`. `[confirmed-repo]` `[risk]`
3. **Neighborhood search** — works **only via ZIP lookup**; the CityRegion post-filter was removed because it discarded all results, so a neighborhood missing from the ZIP map returns empty. `public-listing-trestle.ts:270-281`, `app/api/listings/route.ts:853-855`. `[risk]`
4. **Pagination on the Trestle fallback** — post-filters (subtype, borough, bounds, open-house) run **after** `slice(skip, skip+limit)`, so page N is not stable and `odataCount` overstates filtered totals. `app/api/listings/route.ts:787-925`. `[risk]`
5. **ZIP filtering on the frontend** — applied client-side after fetch, not sent to the API, so result counts are inaccurate at ZIP boundaries. `app/search/page.tsx:488-492`. `[risk]`
6. **Similar listings** — a coarse price-band (30–170%) + same ZIP/neighborhood filter, not a real similarity metric; the `beds` param is accepted but unused (dead code). `app/api/listings/similar/route.ts:55-100`. `[risk]`
7. **Saved-search alerts** — work, but alert criteria are **silently narrowed** to the 59-key projection-supported set; the alert-gate blocks *enablement* on unsupported keys but a saved search created from richer CRM/Trestle criteria (Engine A) replays through the thinner projection (Engine B). `lib/search/criteria-to-prisma.ts:17-59, 182-199`. `[confirmed-repo]`
8. **Building search** — exact-component + `contains`, no fuzzy/typo tolerance; building feature arrays (`String[]`) are unindexed. `app/api/listings/building/route.ts`, `schema.prisma:2199-2226`. `[risk]`

---

## 5. What fails / is missing (with severity)

| # | Gap | Severity | Evidence |
|---|---|---|---|
| F1 | **No relevance ranking / scoring** on any path — results sort by price/recency only, never match quality | High | `public-listing-db.ts:309-337`; `core.ts:155` `[confirmed-repo]` |
| F2 | **No fuzzy / typo tolerance** — no trigram, no `pg_trgm`, no edit-distance at the DB layer (NL parser does Levenshtein on neighborhoods only, client-side) | High | `schema.prisma` (no `pg_trgm`); `natural-language-parser.ts:333-363` `[confirmed-repo]` |
| F3 | **Unit-number search unsupported** — parsed into CRM `$select` but never used as a filter | Medium | `app/api/idx/search/route.ts` select only; no filter `[needs-live-probe]` |
| F4 | **Building-name search missing on the DB path** — only works if the Trestle fallback fires | Medium | `app/api/listings/route.ts:250-270`; `public-listing-trestle.ts:135-139` `[confirmed-repo]` |
| F5 | **No client-facing saved-search management** — portal "saved"/"favorites" return liked listings; clients can create alerts via public signup but cannot view/edit/pause/delete them | High | `app/api/portal/buyer/saved/route.ts:25-37`; `app/api/portal/favorites/route.ts:15-23` `[confirmed-repo]` |
| F6 | **No price-change / status-change / open-house alert types** — alerts fire only on *new matches* (`modifiedSince` + new listing); no "price dropped on a listing you saved" | High | `app/api/cron/search-alerts/route.ts:110-148` `[confirmed-repo]` |
| F7 | **No global email suppression list** — unsubscribe is email-based and per-search; a re-entered email or another saved search resumes sends | Medium | `app/api/search-alerts/unsubscribe/route.ts:18-31`; cron `:32-35` `[risk]` |
| F8 | **Listing-detail local-JSON fallback bypasses the live display gate** — a listing that should be suppressed could render from `data/listings.json` | High (compliance) | `app/api/listings/[id]/route.ts:192-230` `[risk]` |
| F9 | **`agentEmail`/`agentPhone` mapped unconditionally** in `mapTrestleToCrmListing` — PII present in the object; gating must be proven upstream | High (compliance) | `lib/search/crm-idx-mapper.ts:229-230` `[risk]` |
| F10 | **No `tsvector`/GIN full-text and no `pgvector`** anywhere in schema or the 28 migrations | Medium (capability) | `schema.prisma`, `prisma/migrations/**` `[confirmed-repo]` |
| F11 | **`bathrooms_full` unindexed on `listings`** — baths range is a heap filter | Low | `schema.prisma:582-599` `[risk]` |
| F12 | **PR 5B held** — the indexed projection (the actual fix for F1/address/amenity) is not the live reader | High | `pr5b-parity-verification-report.md` (NO-GO) `[confirmed-repo]` |
| F13 | **`is_exclusive` in the projection is wrong** (`agent_id != null`) — mislabels third-party rows, misses SL-/RL- | High (blocks PR 5B) | `listing-search-projection.ts:324` `[risk]` |
| F14 | **`sales`/`rentals` CRM lists return full records (incl. JSON) with no `select`** — over-fetch + larger PII surface | Medium | `app/api/crm/sales/listings/route.ts:19-30` `[risk]` |
| F15 | **`agent_info` JSON not explicitly stripped** by `sanitizeForCRM` (comment suggests intent; block empty) | Medium (compliance) | `lib/compliance/dto.ts:445-450` `[risk]` |

---

## 6. Saved-search verdict (separate public / client / agent)

| Aspect | Verdict | Evidence |
|---|---|---|
| **Agent saved search** | ✅ **Works** — create/list/get/patch/delete, ownership-gated, validated, FH-scanned, audited | `app/api/crm/saved-searches/route.ts:126-223`, `[id]/route.ts` `[confirmed-repo]` |
| **Client saved search** | ⚠️ **Create-only, unmanaged** — clients can create an alert via public `/api/search-alerts` (with TCPA consent) but have **no portal endpoint** to view/edit/pause/delete | `app/api/search-alerts/route.ts:41-160`; absence across portal `[confirmed-repo]` |
| **Client portal management** | ❌ **Absent** — `/api/portal/buyer/saved` and `/api/portal/favorites` return **liked listings**, not searches | `portal/buyer/saved/route.ts:25-37`; `portal/favorites/route.ts:15-23` `[confirmed-repo]` |
| **Alerts** | ✅ **Works (new-match only)** — projection-backed, throttled, SendGrid, dedupe, SMTP fail-loud; ❌ no price-drop/status/open-house alert types | `app/api/cron/search-alerts/route.ts` `[confirmed-repo]` |
| **CRM linkage** | ✅ **Works** — optional `lead_id`, lead+inquiry created on public signup, `ClientListingAction('sent')` writes a per-listing timeline row | `search-alerts/route.ts:92-160`; cron `:158-176` `[confirmed-repo]` |
| **Email compliance** | ⚠️ **Mostly** — TCPA explicit consent captured, CAN-SPAM unsubscribe present; ❌ **email-based unsubscribe (not token), no global suppression list** | `search-alerts/route.ts:5,41-46`; `unsubscribe/route.ts:18-31` `[confirmed-repo]` / `[risk]` |
| **Audit logging** | ✅ **Strong** — create/update/delete audited; cron writes per-search-skip, bulk-summary, SMTP-unconfigured, and error events; `search-run-recorder` logs every run | `search-run-recorder.ts:19-36`; cron `:64-76, 237-252` `[confirmed-repo]` |
| **Ownership / team** | ⚠️ Broker-sees-all on single GET/alerts confirmed; **list endpoint filters by `agent_id`** with no explicit broker branch; **team sharing absent** | `[id]/route.ts:34`; `saved-searches/route.ts:75` `[needs-live-probe]` |

---

## 7. Search-quality scoring (1–10)

| Dimension | Score | Rationale |
|---|---|---|
| **Public listing search** | **6/10** | Functional, compliant, 5 view modes; but unindexable address scan, in-memory amenity/keyword, Trestle page instability, ZIP client-filter, no relevance/fuzzy |
| **CRM / agent listing search** | **6/10** | Rich OData filter set + clean exclusive separation + ownership gates; but no relevance/scoring, no dedicated agent-search UX, full-record over-fetch on sales/rentals, PII-mapping risk |
| **Saved searches** | **6.5/10** | Mature, gated, audited agent path; but no client management, new-match-only alerts, email-based unsubscribe, no suppression list, Engine A/B narrowing |
| **Search performance** | **5/10** | `postal_code` now indexed (P1); but address JSON-path + amenity/keyword in-memory + Trestle post-filter pagination + 1041 MB TOAST table; the fix (projection) is held |
| **Compliance safety** | **8/10** | Strong fail-closed gates, PUB-tier keyword boundary, FARE/DOS/FH disclosures, audit; deductions for detail-page local-JSON gate bypass (F8) and unconditional agent PII mapping (F9) |
| **Future extensibility** | **7/10** | Projection + `searchable_text` + `amenity_keys`/`feature_flags` already built is a strong base for FTS/vector; but PR 5B held, `is_exclusive` wrong, no FTS/vector yet |

---

## 8. Top-tier agent/client search blueprint (target platform)

The components below are mostly **net-new** and would build on the existing projection. None are implied to be in scope now.

- **Agent creates a saved search *for* a client** — `SavedSearch` already supports `lead_id`; surface this as a first-class CRM action that notifies/links the client.
- **Client can save/edit/pause/delete searches in the portal** — the missing F5 surface; reuse the agent CRUD with portal-role auth and a client-owned ownership branch.
- **Alert on new match / price drop / status change / open-house** — extend the cron beyond `modifiedSince` new-match to diff prior `result_count`/price/status snapshots (F6).
- **Listing match score + "why matched"** — relevance ranking (FTS `ts_rank` first, vector cosine later) with an explainable breakdown of which criteria matched.
- **Agent can recommend / pin / exclude** a listing for a client — extend `ClientListingAction` with agent-initiated actions.
- **Client can save / hide / dislike / comment / request showing** — `ClientListingAction` already has `liked/disliked/discuss/schedule/offer` + `comment`; wire the full set into the portal.
- **Every interaction writes a CRM timeline row** — already the pattern via `ClientListingAction` + `AuditEvent`; extend to all new interactions.
- **Team permissions** — resolve the broker/team visibility question (F-team) into an explicit model.
- **Compliance/audit trail** — keep every new surface behind the display/distribution gates and audit-logged (the existing posture).
- **Unsubscribe / preferences center** — upgrade to **token-based** unsubscribe + a **global suppression list** + per-channel preferences (F7).
- **Reporting for sellers/landlords and buyers** — saved-search activity, alert engagement, and listing-interest dashboards.

---

## 9. Recommended PR sequence (small, safe; no production mutation until separately approved)

> Each PR is advisory. P0–P3 need **no Neon extension and no new column**. P4/P5 need extensions and are explicitly held.

**P0 — correctness (live `listings` path; no schema/extension)**
- **PR-0a Trestle pagination stability** — fix post-filter-after-pagination (over-fetch+filter then page, or paginate the filtered set) and report accurate counts. Files: `app/api/listings/route.ts:739-925`. Risk: med. Tests: per-page parity fixtures. Probes: live `/api/listings?skip=…` count vs page. Compliance: none new.
- **PR-0b ZIP server-side** — push ZIP to the API instead of client filtering. Files: `app/search/page.tsx:488-492`, `useListings.ts`. Risk: low. Tests: count parity. Probes: live ZIP query.
- **PR-0c Detail-page gate on local fallback** — re-apply the display gate to the `data/listings.json` path (F8). Files: `app/api/listings/[id]/route.ts:192-230`. Risk: low. Tests: a suppressed listing returns 404 from local fallback. Compliance: REBNY display gate. **High priority.**
- **PR-0d Confirm agent PII gating** (F9/F15) — prove `mapTrestleToCrmListing` output and `sanitizeForCRM` never leak `agentEmail`/`agentPhone`/`agent_info` to non-authenticated callers; strip if unproven. Files: `lib/search/crm-idx-mapper.ts:229-230`, `lib/compliance/dto.ts:445-450`. Risk: low. Tests: DTO PII assertion. Compliance: PII/REBNY. **High priority.**

**P1 — backend saved-search completeness (no schema)**
- **PR-1a Price-drop/status-change/open-house alert types** (F6). Files: `app/api/cron/search-alerts/route.ts`, snapshot fields already on `SavedSearch` (`result_count`). Risk: med. Tests: alert-type fixtures. Probes: cron dry-run.
- **PR-1b Token-based unsubscribe + suppression list** (F7). Files: `app/api/search-alerts/unsubscribe/route.ts`, cron pre-send check. Risk: med. Compliance: CAN-SPAM/TCPA. Tests: suppressed email not sent.
- **PR-1c Resolve broker/team visibility** on the saved-search list endpoint. Files: `app/api/crm/saved-searches/route.ts:69-124`. Risk: low. Tests: role-visibility matrix.

**P2 — client portal saved-search management (no schema)**
- **PR-2 Client CRUD + portal UI** for saved searches (F5), reusing agent CRUD with portal-role auth. Files: new `app/api/portal/**/saved-searches`, portal UI. Risk: med. Compliance: portal DTO + consent. Tests: ownership + PII.

**P3 — alerts/matching quality (no schema)**
- **PR-3 Relevance ranking on the live path** + building-name (DB) + unit-number search (F1/F3/F4), using existing columns + the in-memory pipeline. Risk: med.

**P4 — full-text search (schema + extension, HELD; do AFTER PR 5B + storage headroom)**
- **PR-4 Postgres FTS on the projection** — generated `tsvector` over `searchable_text` + GIN (+ optional `pg_trgm`/`unaccent`), serving both live + alert paths; bundle with the PR 5B reader swap. Requires extension enable + Maya-gated migration in a low-traffic window. Risk: high. Tests: 12-gate parity suite + address-search parity. **Do not start during the Gate-5 archive trial.**

**P5 — vector / AI matching (schema + `pgvector`, HELD, P2/P3 priority)**
- **PR-5 `pgvector` column + HNSW** for semantic/AI matching (NL search, similar-listings, buyer matching). **Only after basic saved search is provably correct.** Embed only PUB-tier, display-permitted content; keep behind all display/PII gates. **Do not start now.**

**Cross-cutting prerequisite for P4/P5:** **PR 5B reader-parity project** (6 workstreams: widen gate for website-only exclusives → fix exclusive identity off `is_exclusive` → port neighborhood→ZIP + all filters/sorts/post-filters → rebuild the DTO from a fatter join → freshness/backfill SLA → full parity test suite → swap behind a flag). See `pr5b-parity-verification-report.md`.

---

## 10. Live probe plan (read-only; NO production mutations)

> Run against production or an immutable preview URL. None of these write data. CRUD probes are limited to read/GET or sandbox rows.

**Public search**
- `GET /api/listings?type=rent&neighborhood=Tribeca` → expect ZIP-expanded results; verify count vs rendered.
- `GET /api/listings?address=425%20park%20avenue%20south` → expect the address case-variant path returns the unit (regression check for the case bug).
- `GET /api/listings?amenities=doorman,gym&type=sale` once with DB results and once forcing Trestle fallback → confirm amenity filter silently no-ops on the Trestle path (F-amenity).
- `GET /api/listings?...&skip=50&limit=50` on a query that triggers Trestle post-filters → confirm page-2 stability + count accuracy (PR-0a).
- `GET /api/listings/{suppressed_id}` with `IDX_ENABLED=false` to force the local-JSON fallback → confirm whether a suppressed listing renders (F8).

**CRM/agent search**
- `GET /api/crm/listings?limit=99999` (authenticated) → confirm clamp to 200.
- `GET /api/crm/sales/listings` → inspect payload for full-record/JSON over-fetch (F14) and any `agentEmail`/`agentPhone`/`agent_info` (F9/F15).
- `GET /api/agents/{slug}/listings` → confirm exclusives-first dedupe and that Trestle rows are not mislabeled as exclusives.

**Saved-search CRUD (read-only / sandbox)**
- `GET /api/crm/saved-searches` as agent then as broker → confirm broker-sees-all vs agent-own (team visibility).
- `POST /api/crm/saved-searches` with an unsupported criterion + `alert_frequency` → expect 422 from the alert-gate.
- `GET /api/crm/saved-searches/{id}/execute` (read path) → confirm projection-backed result + `search_run` audit event.

**Pagination/sort**
- Compare server `sort=price-asc` vs the client re-sorted order on a merged-exclusive result set (F-client-resort).

**Archived/terminal exclusion**
- `GET /api/listings?status=Closed` → expect rejected/empty (allowlist).
- Confirm a `Closed` listing never appears in `/api/listings` or in an alert run.

**Client portal saved-search**
- `GET /api/portal/buyer/saved` and `/api/portal/favorites` → confirm both return **liked listings**, proving the absence of client saved-search management (F5).

---

## 11. Final recommendation

**Do next (read-only or small, safe, no-extension PRs — each separately approved):**
1. **PR-0c** (detail-page local-JSON gate bypass) and **PR-0d** (agent PII gating) — these are **compliance-shaped and should lead**, because they are display-gate / PII exposure issues, not perf.
2. **PR-0a/0b** (Trestle pagination stability, ZIP server-side) — correctness wins on the live path with no schema change.
3. Then **P1/P2** (alert types, token unsubscribe + suppression, client portal saved-search management) — these turn saved search from "agent-only, new-match-only" into a real platform.
4. Treat **PR 5B** as the staged 6-workstream reader-parity project it is — the prerequisite for **P4 full-text** and **P5 vector**.

**Do NOT touch while Gate-5 is armed:**
- **No Neon extension** (`pg_trgm`, `unaccent`, `pgvector`) — schema/DB change under hold.
- **No `tsvector`/`vector` column, GIN/HNSW index, or migration** — defer P4/P5 entirely.
- **No PR 5B reader swap** — it would silently drop website-only Mallan exclusives (SL-0004/SL-0007), lose neighborhood→ZIP, and regress the DTO.
- **No archive/drain/flag changes**, **no Neon Storage/Functions/AI Gateway onboarding**, **no R2/media changes**, **no moving functions off Vercel**.
- **No gate-composite index** in P1 (EXPLAIN shows it marginal; superseded by PR 5B).

**Gate-5 ↔ search interaction (confirmed):** the data-retention archive (`app/api/cron/data-retention/route.ts:269-276`) sets `raw_data → JsonNull`, `compliance → {}`, `media → []` on terminal rows, but **leaves `address` and `features` intact**. Therefore: archived rows stay excluded from public search (status allowlist) `[confirmed-repo]`; CRM works from scalar + `address`/`features` `[confirmed-repo]`; address search (`address` JSON) and amenity search (`features` JSON) do **not** depend on the stripped columns `[confirmed-repo]`; alerts exclude terminal rows (`ACTIVE_DISPLAY_VALUES`) `[confirmed-repo]`; CRM reads of stripped `raw_data`/`compliance` degrade gracefully (null-coalesce / type-check) `[confirmed-repo]`. The current flag/drain process is untouched by this audit. The one residual `[needs-live-probe]`: confirm no agent surface displays media for archived rows expecting it to be present (media is emptied to `[]`).

---

## 12. Live-Probe Results — 2026-06-27

**Method:** read-only continuation of the §10 plan — public `GET` probes against production (`https://mallan.nyc`) + read-only `SELECT`s on canonical production (`ep-cold-waterfall-adno3ao2` / `neondb`, host-guarded via `.env.local`). **No writes, no POSTs, no `/api/cron/*`, no authenticated CRM, no Gate-5/flag/env change.** Tag `[confirmed-live]` = verified against running prod this pass.

### 12.1 Confirmed live (upgraded from `[needs-live-probe]` / `[risk]` / static)

| Ref | Result | Source |
|---|---|---|
| **Public terminal exclusion** | `GET /api/listings?status=Closed` returns **Active** listings (first row `status:"Active"`); the Active/ComingSoon/ActiveUnderContract allowlist **cannot be bypassed** via the `status` param. Public search functional (`type=sale` → 9,574 Active total). | live GET `[confirmed-live]` |
| **F10 — no full-text / trigram / vector** | `pg_extension` contains **none** of `pg_trgm` / `unaccent` / `vector` / `pgvector`. | prod `pg_extension` `[confirmed-live]` |
| **F10 — no GIN/GIST search indexes** | **0** GIN/GIST indexes on `listings` or `listing_search_projection`. | prod `pg_indexes` `[confirmed-live]` |
| **F11 — `bathrooms_full` unindexed** | No index references `bathrooms_full` on `listings`. | prod `pg_indexes` `[confirmed-live]` |
| **F13 — `is_exclusive` mislabel quantified** | Projection marks **41** rows `is_exclusive=true`, of which **34 are NOT SL-/RL-** (third-party Trestle rows with `agent_id` set, mislabeled exclusive); only **7** real SL-/RL- exclusives exist. `agent_id != null` is provably the wrong signal → **34 false positives**. | prod `listing_search_projection` `[confirmed-live]` |
| **Gate-5 ↔ search residual** | All **1,034** archived rows keep `address` + `features` intact and `media` emptied to `[]`; every archived row is terminal (**1,033 Closed + 1 Withdrawn**) → excluded from the public Active allowlist. Confirms archived rows never surface in public search, and address/amenity JSON search does not depend on the stripped columns. | prod `listings` `[confirmed-live]` |

### 12.2 Still `[needs-live-probe]` — blocked this pass, and why

| Ref | Why blocked |
|---|---|
| **F8** — detail-page local-JSON fallback gate bypass | Requires forcing `IDX_ENABLED=false` to hit the `data/listings.json` fallback — a **prod env change** (out of read-only scope). |
| **F9 / F14 / F15** — CRM agent-PII mapping; `sales`/`rentals` over-fetch; `agent_info` strip | Require an **authenticated CRM session** (`/api/crm/*` GET returns 401 unauthenticated). **Not approved** for this pass. |
| **F3** — unit-number filter | Same authenticated-CRM constraint. |
| Amenity silent no-op on the **Trestle** fallback path | Requires forcing the Trestle fallback (no clean read-only trigger). |
| Saved-search **broker/team visibility** | Requires authenticated agent + broker sessions. |
| Exclusive-first ordering on DB `/search`; cross-surface price/status staleness | Need authenticated / A-B comparison probes. |

### Updated recommendation after live probes

1. **Do NOT proceed with the PR 5B reader swap yet** — its exclusivity identity signal is broken (see #2) and parity remains a 6-workstream project.
2. **Fix `is_exclusive` derivation/mislabeling first** — the projection mislabels **34** third-party rows as Mallan exclusives and recognizes only **7** real ones; correct (and backfill) this **before** any reader swap, or the public reader will misclassify exclusivity.
3. **Keep public terminal exclusion as a confirmed safety control** — live-verified fail-closed; treat it as a regression-test invariant for any future reader/FTS change.
4. **Full-text search is useful later, but not before correctness/saved-search gaps** — no FTS/trigram/vector exists today; defer until after `is_exclusive`, pagination/ZIP correctness, and client saved-search management.
5. **Do NOT enable any Neon extension during the Gate-5 trial** — `pg_trgm`/`unaccent`/`pgvector` are schema/DB changes under hold and add storage at the worst time.
6. **Do NOT start authenticated CRM probes without separate approval** — F8/F9/F14/F15 + visibility items stay open pending that.

### F13 status update — #455 merged (2026-06-27)

The **code-only** half of the F13 fix is **DONE**.

- **PR:** https://github.com/mallan67/mallan-nyc/pull/455
- **Merge SHA:** `ad9566fb46b5b2ad3634682195ce614aed2e313f` (squash) · **Head:** `9e04f9ed2dc60174cf6b1481d5014e6ae5553085`
- **Fix:** projection `is_exclusive` now derives from `isMallanExclusiveListing({ listing_id, rls_eligible })` (`lib/search/listing-search-projection.ts`), replacing the `agent_id != null` signal. Stale comment corrected in `lib/crm/listing-publish-contract.ts`; tests updated in `lib/search/__tests__/listing-search-projection.test.ts` + `tests/runtime/h1-dual-write-tier1.test.ts`.
- **Correct rule (now enforced):** Mallan exclusive ⇔ `listing_id` starts with **`SL-`/`RL-`** **OR** `rls_eligible === false`; **never** `agent_id`.
- **Gates passed:** `type-check` 0 · `lib/search` + runtime projection jest **537/537** · `compliance-check` 92/0 BLOCKER+STRICT · `ucba` REGRESSIONS 0 · `rls:validate` 0 · CI (`pr-check`/`guardrails`/`scan`/`claude-review`/`release-truth` CheckRun/`Vercel`) all green · **Codex clean** (no findings).
- **No production mutation occurred** — code-only; no DB write, no schema, no migration, no env change. `is_exclusive` is not a live search filter, so no public behavior changed on merge; the fix corrects only **future** projection dual-writes.
- **Existing 34 wrong projection rows are UNCHANGED** and still require a **separate, gated projection backfill** to correct (41 marked → should become the 7 SL-/RL- + any `rls_eligible=false`; the 34 false positives cleared).
- **PR-5B reader swap remains HELD.**
- **Gate 5 remains armed and untouched** (`ARCHIVE_T180_BACKLOG_ENABLED` still ON for the Night 2/3 trial).

**Recommended next step (F13):** the code fix is complete; the **only** remaining F13 work is a **separate projection-backfill *plan* (planning only, not execution)**. **Do not run the projection backfill** until separately approved — and not until after the Gate-5 trial is complete and disarmed.

---

*End of report (incl. §12 live-probe update, 2026-06-27). No code, schema, migration, env, cron, or production change was made. Remaining `[needs-live-probe]` items require live verification before being claimed fixed (CLAUDE.md §F).*
