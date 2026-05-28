# Listing Identity Audit — Mallan CRM Exclusive vs Trestle/IDX Duplicate

> Generated 2026-05-28, **revised the same day** after Maya's correction.
> On branch `fix/listing-canonical-mallan-exclusive-identity`. **Audit only — no code changed.**
>
> **Original mis-diagnosis (now superseded):** I initially attributed SL-0004's "RLS · Listing Courtesy of MAllan Real Estate Inc" rendering on the agent page to "DTO drift / two converters out of sync." That diagnosis was incomplete. The actual render is correct — it's rendering a **DIFFERENT DB row** that legitimately has `_source: 'db+idx'`.
>
> **Corrected root cause (verified by direct API probe):** the production database contains TWO rows for the same physical listing — Maya's CRM exclusive (`SL-0004`) AND a Trestle-synced copy (`RLS20093870`) that REBNY assigned after Maya submitted the listing to RLS. Different surfaces of the frontend render different rows, producing the inconsistent attribution / URL / placement Maya observed.
>
> **Maya's decision (locked):** Option A — **query-time dedupe**. Public surfaces show only the CRM row when a CRM exclusive and an IDX-sourced duplicate exist for the same physical unit. The IDX row stays in DB for audit history; it just does not render publicly.

---

## 0 · Evidence — direct production probe

```bash
curl https://mallan.nyc/api/listings?address=333+E+46th
```

Returns SIX rows. **Two of them are the same physical unit (333 E 46th St #2G):**

| Row | `id` | `mlsId` | `unit` | `_source` | `listOfficeName` | `attributionText` | Origin |
|---|---|---|---|---|---|---|---|
| 1 | `SL-0004` | `SL-0004` | 2G | `'exclusive'` | `'REBNY RLS'` (DTO fallback when `agent_info.ListOfficeName` is empty) | `Exclusive listing by Mallan Real Estate Inc.` | CRM POST by Maya |
| 2 | `RLS20093870` | `RLS20093870` | 2G | `'db+idx'` | `'MAllan Real Estate Inc'` (literal value from Trestle, including the capital-A typo as Maya submitted it to REBNY) | `Listing courtesy of MAllan Real Estate Inc` | Trestle sync → after Maya submitted SL-0004 to REBNY RLS, the sync pulled the listing back as a separate row |
| 3 | `RLS20087929` | `RLS20087929` | 20B | `'db+idx'` | `'Douglas Elliman Real Estate'` | `Listing courtesy of Douglas Elliman` | Real third-party IDX — different unit, NOT a dedupe candidate |
| 4 | `RLS20078427` | `RLS20078427` | 16F | `'db+idx'` | `'Douglas Elliman Real Estate'` | — | Real third-party IDX — different unit |
| 5 | `RLS20036865` | `RLS20036865` | 1D | `'db+idx'` | `'Douglas Elliman Real Estate'` | — | Real third-party IDX — different unit |
| 6 | `RLS20092195` | `RLS20092195` | 12L | `'db+idx'` | `'Douglas Elliman Real Estate'` | — | Real third-party IDX — different unit |

Rows 1 and 2 are **the same physical listing** (same address, same unit `2G`). The frontend surfaces render them inconsistently:

- **Featured listings card** (homepage) renders row 1 (SL-0004) — the right one, labeled "Exclusive listing by Mallan Real Estate Inc."
- **Listing detail page sidebar** renders row 2 (RLS20093870) or its attribution — brokerage-only widget, no Maya contact info, "Mallan Real Estate Inc." brokerage line
- **Agent listings page** (`/agents/maya-allan`) renders row 2 (RLS20093870) — placeholder house icon, "RLS · Listing Courtesy of MAllan Real Estate Inc" prefix with the REBNY typo
- **Exclusive section** (`?exclusive=mallan` filter) returns only row 1 ✓

This is what Maya saw across her four screenshots.

---

## 1 · Two clarifications about my earlier audit

- The **"MAllan" typo with the capital A in the middle** is **not a render bug** in our code. It is the literal value Maya submitted to REBNY RLS, returned verbatim by the Cotality/Trestle feed (`agent_info.ListOfficeName: 'MAllan Real Estate Inc'`). To fix it, Maya updates her brokerage record in the REBNY/Cotality submission portal. **Our codebase cannot and should not silently rewrite REBNY-supplied data.**
- The **"DTO drift" finding** from the earlier audit (two converters producing different output for the same DB row) is a real secondary issue that is worth fixing eventually for consistency — but it is **not the cause** of the symptoms Maya reported. The symptoms are caused by frontend surfaces rendering the wrong DB row, not by one converter mis-rendering the right row. **Drop the DTO-drift fix from this PR's scope** to keep it focused on dedupe.

---

## 2 · Per-surface dedupe map

Every server endpoint that returns public listing data calls `filterDisplayableDbListings(...)` and then maps through `dbListingToPublicDTO(...)`. The dedupe helper plugs in **after the map**, before the listings are sent down the wire. One helper, called in five places.

| # | Surface | Server entry point | Current query path | Current row shown for SL-0004 / 2G | Expected row | Current URL emitted | Expected URL | Dedupe helper insertion point |
|---|---|---|---|---|---|---|---|---|
| **S1** | `/api/listings` (general public search + featured + exclusive sub-filter) | `app/api/listings/route.ts:325-405` | `prisma.listing.findMany` → `filterDisplayableDbListings` → `dbListingToPublicDTO.map` (line 405) | BOTH rows returned (SL-0004 AND RLS20093870) | SL-0004 only | API returns `slug` for each — consumers concat. Both hybrid slugs returned. | Only SL-0004's canonical address+id | Insert `preferCrmExclusiveOverIdxDuplicate(...)` between line 405 (the `.map(dbListingToPublicDTO)`) and the response (line ~509). One line. |
| **S2** | `/api/listings/suggest` (typeahead search) | `app/api/listings/suggest/route.ts` | `prisma.listing.findMany` (also `agent.findMany`) | BOTH rows returned in typeahead | SL-0004 only | — | — | Same helper, after the listing-side map. |
| **S3** | `/api/agents/[slug]/listings` (drives `/agents/maya-allan`) | `app/api/agents/[slug]/listings/route.ts:152-203` | `prisma.listing.findMany` → `filterDisplayableDbListings` → `.map(dbListingToPublicDTO)` (line 200, 203) | RLS20093870 (the IDX duplicate, because the agent listings query keys differently — see §3) | SL-0004 (the CRM exclusive) | RLS20093870's slug + `?key=` query | SL-0004 canonical | Same helper, after the two `.map(dbListingToPublicDTO)` calls. |
| **S4** | `/api/listings/similar` (sibling listings on listing detail page) | `app/api/listings/similar/route.ts:71` | `prisma.listing.findMany` → mapping (need to verify path uses `dbListingToPublicDTO`) | TBD — likely both rows can appear if the seed listing is the same building | The CRM row only (when both exist) | — | — | Same helper. |
| **S5** | `app/sitemap.ts` (sitemap.xml) | `app/sitemap.ts:76` | `prisma.listing.findMany` directly | BOTH rows → BOTH URLs indexed → SEO duplicate content | Only the CRM canonical URL when a CRM exclusive exists for the address | Two slugs in sitemap | One slug per physical listing | Same helper, but applied to the DB-row level (before URL emission). Slightly different shape since sitemap doesn't go through `dbListingToPublicDTO`. |
| **C1** | `FeaturedListings.tsx` (consumes S1) | `app/components/FeaturedListings.tsx` | Client fetch of `/api/listings?exclusive=mallan` (line 382) + generic feed | Inherits whatever S1 returns | Inherits from S1 | Inherits from S1 | Inherits from S1 | **No client-side change needed** — once S1 dedupes, this page is fixed automatically. |
| **C2** | `SearchListingCard.tsx` (consumes S1) | `app/components/SearchListingCard.tsx` | Same — inherits from S1 | Inherits | Inherits | Inherits | Inherits | **No client-side change needed.** |
| **C3** | Exclusive sub-section (consumes S1 with `?exclusive=mallan`) | Already filtered server-side | Already returns only mallan exclusives (correct row) | SL-0004 ✓ | SL-0004 ✓ | (uses canonical via `buildCanonicalListingPath` consumers) | Same | **No change needed.** Already works because the `?exclusive=mallan` filter excludes IDX rows entirely. |
| **C4** | Listing detail page (`/listing/[...slug]`) | `app/listing/[...slug]/page.tsx` | Direct `prisma.listing.findFirst` by slug/id | When URL hits the canonical SL-0004 path → renders SL-0004 directly (no dedupe needed). When URL hits an old RLS-style link → renders the IDX row. | When the URL is for a physical unit that has BOTH rows, redirect to the CRM canonical URL | Some pages render hybrid `…-sl-0004?key=` | Canonical | **Add a 308 redirect** at the page-level when the seen `listing_id` is the IDX duplicate AND a CRM exclusive exists for the same address+unit. |

### Why the agent page picks the IDX duplicate (S3)

`/api/agents/[slug]/listings/route.ts:152` queries `prisma.listing.findMany` with a `where` that includes the agent's `mls_id` matching `agent_info.ListAgentMlsId`. Maya's listing was submitted to REBNY with her ListAgentMlsId attached, so the Trestle sync wrote that to `RLS20093870.agent_info.ListAgentMlsId`. The query matches both rows, but the IDX row sorts earlier (probably by `modification_timestamp` since the sync is more recent than the CRM POST), so the agent page renders RLS20093870 first.

**Net:** the dedupe helper at S3 is required — the IDX duplicate is literally the active first match in the query result. Without dedupe, the agent page shows the wrong row.

---

## 3 · The dedupe helper

### 3.1 Module + signature

New file: `lib/listings/dedupe-crm-vs-idx.ts`

```ts
/**
 * Public-surface dedupe — prefer Mallan CRM exclusive over Trestle/IDX duplicate
 * when both rows represent the same physical unit.
 *
 * Background: when a CRM exclusive (SL-/RL- prefix) is submitted to REBNY RLS
 * via Cotality, Trestle syncs the listing back into our DB as a separate row
 * keyed by REBNY's ListingKey. The two rows are the same physical unit but
 * have different listing_ids, slugs, attribution text, and URLs. Public
 * surfaces should show only the CRM row to avoid duplicate cards, wrong
 * attribution, and SEO duplicate content.
 *
 * IMPORTANT: this helper does NOT delete or mutate any DB rows. It is a
 * read-side filter only. The IDX duplicate stays in the DB for audit history.
 *
 * COMPLIANCE: dedupe MUST NOT collapse different units in the same building.
 * Matching requires StreetNumber + StreetDirPrefix + StreetName + StreetSuffix
 * + UnitNumber + PostalCode all to match (case-insensitive, trimmed).
 * Listings with no UnitNumber on at least one side are NOT deduped (cannot
 * prove they are the same physical unit).
 */
export function preferCrmExclusiveOverIdxDuplicate<T extends DedupCandidate>(
  listings: T[],
): T[];
```

### 3.2 Matching key (Maya-locked spec)

A duplicate pair matches when ALL of the following match on both rows, case-insensitively, after `trim()`:
- `StreetNumber`
- `StreetDirPrefix` (empty string on both sides is allowed; one empty + other populated is a non-match)
- `StreetName`
- `StreetSuffix`
- `UnitNumber` (**required on both sides** — a row with empty/null UnitNumber is never deduped against any other row)
- `PostalCode`

Key derivation is from the DTO's `address` object. Falls back to the underlying `address` JSON for cases where the DTO normalized form differs.

### 3.3 Prefer-CRM rule

When a key group has more than one listing:
1. If exactly one row has `listing_id` starting with `SL-` or `RL-`, that row wins. Drop the others.
2. If multiple rows have `SL-`/`RL-` prefix (shouldn't happen in practice but defensive), keep the most recent `modification_timestamp` and log a warning.
3. If no row has `SL-`/`RL-` prefix (pure IDX group), keep all rows (real third-party listings, not a dedupe scenario).

### 3.4 Where to call it (the 5 insertion points)

- `app/api/listings/route.ts:405` — after `.map(dbListingToPublicDTO)`, before response
- `app/api/listings/suggest/route.ts` — after the listing-side map
- `app/api/agents/[slug]/listings/route.ts:200, 203` — after BOTH `.map` calls (sales + rentals)
- `app/api/listings/similar/route.ts` — after the result map
- `app/sitemap.ts:76` — equivalent dedupe on raw DB rows (sitemap doesn't go through the DTO); shares the same address-key derivation via a small adapter

### 3.5 CRM backend search is explicitly NOT deduped

Per Maya's spec: broker/backend CRM search may still surface both rows (the CRM exclusive AND the IDX duplicate), so the agent can see the duplicate exists and decide what to do about it on REBNY's side. The dedupe helper is public-surface only — `app/api/crm/listings/*` routes are NOT changed.

To make this explicit in the UI, the CRM My Listings table should label rows with a small badge:
- `Mallan Exclusive` (for SL-/RL- rows)
- `IDX duplicate of <SL-XXXX>` (for IDX rows whose address matches an SL-/RL- row)

That UI label is a small follow-up — not required for the dedupe PR but worth noting. **Out of scope of this PR per Maya's "do not touch CRM frontend" implication; flag for separate PR.**

---

## 4 · Required tests (matching Maya's spec)

1. **Given** SL-0004 CRM row + RLS20093870 IDX row with same `address.StreetNumber/StreetDirPrefix/StreetName/StreetSuffix/UnitNumber/PostalCode`, `/api/listings?address=333+E+46th` returns only SL-0004 (count drops from 6 to 5).
2. **Given** the same pair, `/api/agents/maya-allan/listings` returns only SL-0004 under Active Sales.
3. **Given** the same pair, `/api/listings?exclusive=mallan` continues to return SL-0004 (no regression — exclusive filter already passes).
4. **Given** dedupe is applied at S1, the URL emitted in the response payload for the deduped CRM row uses `buildCanonicalListingPath` → `/listing/{address}/sl-0004` only. No hybrid, no `?key=`.
5. **Given** SL-0004 and a hypothetical SL-0005 in different units of the same building, both are returned (different `UnitNumber`, no dedupe). Regression guard.
6. **Given** "333 E 46th" and "333 W 46th" rows (same number/name, different `StreetDirPrefix`), both are returned (different direction, no dedupe). Regression guard.
7. **Given** an SL-0004 row with `internet_address_display_yn === false` (suppressed address) and a Trestle row with the same address, **neither row is shown publicly** (suppression wins) — and the deduper does NOT leak the suppressed address by matching on it.
8. **Given** a pure-IDX group with no CRM exclusive (4 Douglas Elliman rows in the audit, different units), all are kept (helper is a no-op when no SL-/RL- row in group).
9. **Sitemap** test: when a CRM exclusive + IDX duplicate exist, sitemap emits only the canonical CRM URL (one entry per physical listing).
10. **CRM /api/crm/listings is untouched**: the same DB state returns BOTH rows on the CRM backend search path (broker can see the duplicate). Regression guard against accidentally deduping the CRM path.

---

## 5 · PR scope (TIGHT, matches Maya's directive)

**Branch:** `fix/listing-canonical-mallan-exclusive-identity` (already on it)
**Title:** `fix(listing): prefer Mallan CRM exclusive over synced IDX duplicate`

| Track | File(s) | Change |
|---|---|---|
| **D1** | `lib/listings/dedupe-crm-vs-idx.ts` (NEW) | The helper + 60-line unit test for the matching key + prefer-CRM rule |
| **D2** | `app/api/listings/route.ts` | One line: call helper after `.map(dbListingToPublicDTO)` |
| **D3** | `app/api/listings/suggest/route.ts` | Same one-line call after the listing-side map |
| **D4** | `app/api/agents/[slug]/listings/route.ts` | Same one-line call after each of the two `.map` calls (active sales + active rentals) |
| **D5** | `app/api/listings/similar/route.ts` | Same one-line call after the result map |
| **D6** | `app/sitemap.ts` | Adapter + helper call before URL emission (slightly different shape — sitemap doesn't use DTO) |
| **D7** | `tests/runtime/listing-dedupe-crm-vs-idx.test.ts` (NEW) | Cases 1–10 from §4 |

**Explicitly OUT of scope** (per Maya's "do not touch" boundaries):
- DTO converter consolidation (was track B in earlier audit — defer, not the cause of the reported symptoms)
- Detail-page render conditionals for `_source === 'exclusive'` (the prior B/C/D tracks — defer)
- Listing-agent sidebar widget redesign (the prior D track — defer, separate work)
- URL builder consolidation per se (Maya's earlier directive — once dedupe lands and only CRM rows are public, hybrid IDX URLs simply don't appear; consumers either already use `buildCanonicalListingPath` or get a canonical slug)
- CRM My Listings backend search (explicit Maya boundary — broker side may still show both)
- "MAllan" typo in REBNY data (Maya fixes in REBNY portal, not in our code)
- Sentinel-L, rental form, media platform rebuild, full SALE_FIELD_MAP rewrite (all explicit Maya boundaries)

---

## 6 · Compliance check

- **UCBA Art. III §2(C)** (listing attribution must identify the ACTUAL listing broker): preserved. The CRM row's attribution IS Mallan because Mallan IS the listing broker. The IDX duplicate is hidden, not relabeled. No false attribution.
- **REBNY RLS §2.05** (terminal-status removal in 24h): unaffected. Dedupe is at read time; terminal-status writes still flow through `idx_display_yn` and the cron.
- **REBNY IDX disclaimer requirement** for true third-party rows: preserved. The 4 Douglas Elliman rows in the audit example still render with their `disclaimerRequired: true` flag.
- **Address suppression (`internet_address_display_yn === false`)**: test case 7 above verifies the dedupe helper does NOT leak suppressed address by using it as a match key for visible rows.
- **No DB mutation**: the IDX duplicate row stays in the DB. Compliance audit history is preserved. Reversible at any time by removing the helper call.

---

## 7 · TL;DR

- **You were right.** The "looks like RLS" rendering is not a render bug — there are literally two rows in our DB for the same listing (SL-0004 CRM exclusive + RLS20093870 Trestle-synced duplicate).
- **One dedupe helper, five insertion points.** New `lib/listings/dedupe-crm-vs-idx.ts`. Wired into `/api/listings`, `/api/listings/suggest`, `/api/agents/[slug]/listings`, `/api/listings/similar`, and `app/sitemap.ts`. ~5 lines of integration each.
- **CRM backend NOT deduped.** Broker can still see both rows so duplicates remain visible internally for cleanup decisions.
- **No DB mutation, no destructive operation.** The IDX duplicate stays in the DB for audit history; it just doesn't render publicly.
- **10 tests cover the spec.** Including regression guards for different units in same building, different street directions, suppressed addresses, and CRM-backend non-deduplication.
- **Out of scope:** DTO drift fix (deferred, not the cause), listing-agent sidebar (deferred, separate work), URL builder consolidation (becomes a no-op once IDX duplicates stop rendering), CRM My Listings label badges (separate small PR), "MAllan" typo (Maya fixes in REBNY portal).

**Awaiting Maya's go-ahead on this revised scope before any code.**
