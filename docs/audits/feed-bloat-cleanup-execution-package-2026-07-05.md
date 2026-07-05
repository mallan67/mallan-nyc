# Feed-Bloat Cleanup — Execution Package (2026-07-05)

Status: review-only. No production rows deleted. All facts verified against the live Cotality API (`api.cotality.com/trestle`) and read-only production queries (`neonctl` connection, `SET default_transaction_read_only=on`).

## 1. Candidate population

Definition (authoritative field first, then operational columns):

| Column / field | Source | Value |
|---|---|---|
| `StandardStatus` (stored in `listings.status`) | Cotality Property enum (verified live) | `Closed` |
| `first_active_date` | internal | `NULL` (row was never in a displayable status on this system) |
| `idx_display_yn` | internal | `false` |
| `agent_id` | internal (set when the sync matches `ListAgentMlsId`/`ListAgentStateLicense` to the roster) | `NULL` |

Observed count (read-only production query, 2026-07-05): **88,933** rows.

Live Cotality confirmation (random sample of 15 candidate `listing_id`s queried against `api.cotality.com/trestle`): every one returns `StandardStatus = Closed` with a `ListAgentMlsId` and `CloseDate` (2015–2026). Field queried: `StandardStatus`. Field used for agent identity: `ListAgentMlsId`.

## 2. Hardened deletion predicate (authoritative structural identity)

Mallan structural identifiers (authoritative Cotality fields, derived from the Agent roster and Mallan-owned rows):
- `ListAgentMlsId` = `39361` (one agent has an MLS ID).
- `ListAgentStateLicense` ∈ { `10311201806`, `10401221382`, `40GO1094220` } (three agents).
- `ListOfficeMlsId` = not present in stored `raw_data` for Mallan rows (requires a live Cotality Office lookup; not used as a key).

Verification (read-only, 2026-07-05): of the 88,933 candidate rows, the count with `raw_data->>'ListAgentMlsId'`, `CoListAgentMlsId`, or `BuyerAgentMlsId` = `39361` is **0**; the count with `ListAgentStateLicense` or `CoListAgentStateLicense` (trimmed) in the three Mallan licenses is **0**.

Predicate (identity key = authoritative Cotality fields in `raw_data`; operational columns define the population; `list_office_name` text is NOT used):

```sql
status = 'Closed'                                   -- Cotality StandardStatus (authoritative, verified live)
AND first_active_date IS NULL                       -- operational: never displayable on this system
AND idx_display_yn = false                          -- operational: not displayed
AND agent_id IS NULL                                -- relational: not linked to a roster agent
-- Authoritative structural exclusion (Cotality identity fields from raw_data):
AND coalesce(raw_data->>'ListAgentMlsId','')   <> '39361'
AND coalesce(raw_data->>'CoListAgentMlsId','') <> '39361'
AND coalesce(raw_data->>'BuyerAgentMlsId','')  <> '39361'
AND btrim(coalesce(raw_data->>'ListAgentStateLicense',''))   NOT IN ('10311201806','10401221382','40GO1094220')
AND btrim(coalesce(raw_data->>'CoListAgentStateLicense','')) NOT IN ('10311201806','10401221382','40GO1094220')
-- Operational safety for system-authored rows:
AND owner_client_id IS NULL
AND listing_id NOT LIKE 'SL-%' AND listing_id NOT LIKE 'RL-%'
```

Every field named above exists in the authoritative Cotality Property model (`StandardStatus`, `ListAgentMlsId`, `CoListAgentMlsId`, `BuyerAgentMlsId`, `ListAgentStateLicense`, `CoListAgentStateLicense`) or is an internal column of the `listings` table (`first_active_date`, `idx_display_yn`, `agent_id`, `owner_client_id`, `listing_id`).

## 3. Complete read-path inventory

Every consumer that reads `listings`. "Can return candidate?" = the query could return a row matching the §1 definition. A consumer returns NO if it filters on `idx_display_yn=true`, or restricts `status` to `Active`/`ComingSoon`/`ActiveUnderContract`, or scopes by a specific `agent_id` or `owner_client_id`.

### 3a. Cannot return the candidate population

| File:line | Function/route | Filter (evidence) |
|---|---|---|
| `app/api/listings/route.ts:327,403` | public search + count | `SEARCH_DISPLAY_GATE` (`idx_display_yn:true`) + status ∈ active (`lib/search/public-listing-db.ts:177-191`) |
| `app/api/listings/route.ts:1225` | `fetchExclusiveListings` | `status: buildSearchDisplayWhere().status` (active) |
| `app/api/listings/similar/route.ts:86` | similar | `status:'Active'` + `SEARCH_DISPLAY_GATE` |
| `app/sitemap.ts:80` | sitemap | `idx_display_yn:true` + `internet_entire_listing_display_yn:true` + `status ∈ ACTIVE_DISPLAY_VALUES` |
| `app/api/market/route.ts:131,235,252,303` | market report (active + closed stats) | `baseWhere.idx_display_yn:true` inherited by every branch incl. `closedWhere` |
| `lib/cma/engine.ts:98` | CMA comparables | `SEARCH_DISPLAY_GATE` (`idx_display_yn:true`) on all branches |
| `app/api/buildings/route.ts:369` | buildings | `AND [idx_display_yn:true, owner_opt_out:false, internet_entire_listing_display_yn:true, participant_only:false]` |
| `app/api/agents/[slug]/listings/route.ts:201` | agent profile listings | `where:{ agent_id: agentId }` (candidate `agent_id=NULL`) |
| `app/api/open-houses/route.ts:386` | local open houses | listing filtered by `isMallanOwnedLocalListing` + `evaluateDisplayGate` |
| `app/api/portal/comparables/route.ts:60` | portal building comps | `SEARCH_DISPLAY_GATE` (`idx_display_yn:true`) |
| `app/api/portal/favorites/route.ts:34` | portal favorites | `buildSearchDisplayWhere()` + interaction-bounded id set |
| `app/api/portal/listings/route.ts:51,63` | portal listings | `owner_client_id` scope / interaction-bounded |
| `app/api/portal/seller/{dashboard,fomo,demand}/route.ts` | seller portal | `lead.active_sale_listing_id` scope |
| `app/api/portal/landlord/{dashboard,relist}/route.ts` | landlord portal | `lead.active_rental_listing_id` scope |
| `app/api/portal/{offers,showings,price-history,marketing}/route.ts` | portal | `owner_client_id` scope / explicit id + owner gate |
| `lib/buyer-intent/recommender.ts:57` | buyer recommender | `status:'Active'` + `SEARCH_DISPLAY_GATE` |
| `lib/listing-momentum/scorer.ts:109` | momentum batch | `buildSearchDisplayWhere()` |
| `lib/social-proof/cache.ts:98` | social-proof batch | `buildSearchDisplayWhere()` |
| `lib/market-pulse/snapshot.ts:28-44` | market-pulse aggregates | `SEARCH_DISPLAY_GATE` + `status:'Active'` |
| `lib/demand-index/collector.ts:135` | demand distinct neighborhoods | `status ∈ [Active,ComingSoon,ActiveUnderContract]` |
| `app/api/crm/compliance/audit/route.ts:30` | CRM compliance audit | `status ∈ [Active,Pending,ActiveUnderContract,ComingSoon,Hold]`, `rls_eligible:{not:false}` |
| `app/api/crm/lease-tracker/route.ts:459` | CRM lease tracker | `owner_client_id ∈ landlordIds` + `status ∈ ACTIVE_DISPLAY_VALUES` |
| `app/api/crm/listings/route.ts:152` | CRM next-id (SQL) | `listing_id LIKE 'SL-%'/'RL-%'` (candidate ids are `RLS…`) |
| `app/api/cron/data-retention/route.ts:84` | T+24h IDX-off | `idx_display_yn:true` (candidate is `false`) |
| `app/api/cron/dom-reset/route.ts:24` | DOM reset | `status ∈ [Withdrawn,Cancelled]` |
| `app/api/cron/listing-expiration/route.ts:51,86,174` | expiration | `status ∈ [Active,ActiveUnderContract,ComingSoon,Pending]` AND `agent_id:{not:null}` |
| `app/api/cron/feed-reconcile/route.ts:178` | feed reconcile active | `status:'Active'` + `listing_id startsWith 'RLS'` |

### 3b. Can return the candidate population

| File:line | Function/route | Filter (evidence) | Behavior change on deletion |
|---|---|---|---|
| `app/api/buildings/search/route.ts:536` | building search (raw SQL by address) | `WHERE address->>'StreetNumber'=$1 [AND StreetName LIKE …]` — no status/`idx_display_yn`/`agent_id` gate | Current: returns candidate rows at a matched address. After deletion: does not return them. |
| `app/api/buildings/search/route.ts:645` | building search (BuildingName) | `where:{ address:{path:['BuildingName'], string_contains} }` — no gate | Current: returns candidate rows for a building name. After deletion: does not return them. |
| `lib/social-proof/cache.ts:51` | avg-days-to-sell sample | `status ∈ [Closed,Sold,Rented]`, `days_on_market>0`, `updated_at≥90d` — no `idx_display_yn` gate | Current: candidate rows with nonzero `days_on_market` and recent `updated_at` are included in the average. After deletion: they are not included. |
| `app/api/crm/listings/route.ts:60,106` | CRM listings grid (BROKER role) | OR-branch `{mls_id:{not:null}, status ∈ [Closed,Sold,Leased,Rented]}`; `agent_id` filter added only when role ≠ BROKER | Current: BROKER view returns candidate rows. After deletion: it does not. |
| `app/api/crm/sales/listings/route.ts:27` | CRM sales grid (BROKER) | `where:{listing_type:'sale'}`; `agent_id` added only when role ≠ BROKER | Current: BROKER view returns candidate sale rows. After deletion: it does not. |
| `app/api/crm/rentals/listings/route.ts:18` | CRM rentals grid (BROKER) | `where:{listing_type:'rent'}`; broker path ungated | Current: BROKER view returns candidate rent rows. After deletion: it does not. |
| `lib/market-pulse/snapshot.ts:64,112` | borough label / distinct neighborhoods | `findFirst {neighborhood}` / distinct `neighborhood` — no gate | Current: may read a candidate row to read `borough`/`neighborhood` only. After deletion: reads a different row for the same label. |
| `app/listing/[...slug]/page.tsx:366,432` | listing detail page | address/postal scan has no DB gate, but the resolved row passes `isListingDisplayable` at `:459` (`idx_display_yn=false` ⇒ returns null / 404) | Current: candidate row read then produces 404. After deletion: 404 (unchanged outcome). |
| `scripts/scanner/build-prospects.ts:150` | off-market prospect scan (offline) | `where:{ status_changed_at:{gte: 24 months} }` — no status/`idx_display_yn`/`agent_id` gate | Current: candidate rows are included as input. After deletion: they are not. |
| `scripts/comps/by-property.ts:241,319,364` | comps by property (offline CLI) | OR-branch `{status:'Closed', modification_timestamp≥since}` + address match — no `idx_display_yn` gate | Current: candidate rows are included as comps input. After deletion: they are not. |
| `app/api/cron/data-retention/route.ts:149,212` | T+30d media-null, T+180 archive | `status ∈ terminal`, `sync_status≠archived`, age gate — no `idx_display_yn` gate | Current: candidate rows are processed by the retention pipeline. After deletion: they are not processed. |
| `scripts/drain-archive-backlog.ts:113,132` | archive drain (operator) | shared `archiveWhere` (terminal, `sync_status≠archived`) | Current: candidate rows are drain candidates. After deletion: they are not. |
| `scripts/ops-health.js:211-294` | ops health (read-only counts) | counts terminal / archive-eligible rows | Current: counts include candidate rows. After deletion: counts do not include them. |

### 3c. Point-lookup consumers (resolve a single row only if its `listing_id` is explicitly supplied)
`app/api/listings/[id]/route.ts`, `app/api/portal/comparables/route.ts:24`, `app/api/portal/price-history/route.ts:20`, `app/api/crm/listings/[id]/*`, `app/api/crm/syndication/refresh/route.ts:30`, `lib/listing-auditor/auditor.ts:60`, `app/api/listings/similar/route.ts:79` (excludeId). None scan for the population; after deletion each returns a 404 if its id is supplied.

### 3d. Live Cotality (not DB)
`app/api/market/route.ts` (Trestle fallback), `app/api/open-houses/route.ts` (Trestle), `app/api/listings/[id]` detail body, `app/api/buildings/search` (Trestle branch) — read from `api.cotality.com/trestle` via `getAccessToken()`; unaffected by deletion.

## 4. Ingestion guard (exact implementation)

`lib/idx/sync.ts` — field evaluated: `mapped.status` (mapped from Cotality `StandardStatus`, fallback `MlsStatus`, at `trestle-mapper.ts:963`). Values compared: the four live Cotality StandardStatus values `Active, ActiveUnderContract, ComingSoon, Pending` (verified against `$metadata`).

```ts
const CREATABLE_NEW_STATUSES = new Set(["Active", "ActiveUnderContract", "ComingSoon", "Pending"]);

export function shouldSkipNewTerminalListing(existing: unknown, status: string): boolean {
  return !existing && !CREATABLE_NEW_STATUSES.has(status);
}

// in the per-record loop, before the upsert:
if (shouldSkipNewTerminalListing(existing, mapped.status)) {
  skippedNewTerminal++;
  if (skippedNewTerminalSample.length < 25) skippedNewTerminalSample.push(mapped.listing_id);
  continue;                         // no CREATE; loop proceeds to the next record
}
await prisma.listing.upsert({ where: { listing_id: mapped.listing_id }, create: {...}, update: {...} });
```

- `existing` is the row fetched at `sync.ts:406` (`findUnique({ where: { listing_id } })`). When `existing` is non-null the guard returns false, so an existing row always proceeds to the UPDATE branch (a genuine `Active→Closed` transition still records and hides via §2.05).
- When `existing` is null AND `StandardStatus` is not one of the four active values, no CREATE occurs.
- Invariant surfaced in `SyncResult.skipped_new_terminal` (count) + `skipped_new_terminal_sample` (≤25 ids) + a `console.warn` each run.
- Regression detection at the DB level: `scripts/health/probe.ts` "Feed-bloat invariant" cell counts the §2 predicate; non-zero renders 🔴.
- Unit test: `tests/runtime/idx-sync-new-terminal-guard.test.ts` (17 cases).

## 5. Validation plan (controlled batch execution)

1. Pre-run: record `count(*)` of the §2 predicate; total row count; count by `status`; FK-dependent counts (`showings`, `inquiries`, `comments`, `price_history`, `client_listing_actions`); and the Mallan-marker count (must remain unchanged throughout).
2. Create a fresh protected Neon rollback branch; record its LSN and the `main` commit SHA.
3. Delete in batches of 5,000 matching the §2 predicate.
4. After each batch: recount the §2 predicate (decreases by the batch size); confirm total decreases by the batch size; confirm FK integrity (no `showings`/`comments`/`price_history`/`client_listing_actions` rows orphaned); confirm the Mallan-marker count is unchanged.
5. After each batch, run one incremental sync and re-count the §2 predicate. If the count increases (any deleted record recreated), stop: the ingestion guard is incomplete and must be corrected before continuing.
6. Application checks between batches: public search returns active listings; `/api/market` and `/api/listings/similar` return values; portals and agent-profile pages load.
7. Completion: §2 predicate count = 0; `health:probe` "Feed-bloat invariant" cell = 🟢; monitor active.

No deletion is performed by this document.
