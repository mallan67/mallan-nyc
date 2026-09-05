> **HISTORICAL NOTE (2026-09-05, Search Consolidation Packet 2):** any mention of **RealPlus** in this document describes a former submission tool and is retained as history only. RealPlus has no role in Mallan's application architecture. Cotality/Trestle (`api.cotality.com/trestle`) is the only provider and feed authority; REBNY RLS submission happens outside this system. See `docs/search/checkpoints/2026-09-05-carry-forward-after-validators.md` §5.

# External (Non-RLS) Inventory Listings — Design Spec

> **Status:** DRAFT (parked until after PR 4 closes)
> **Created:** 2026-04-30
> **Owner:** Maya Allan
> **Brainstorming session:** 2026-04-30 (auto-mode + superpowers:brainstorming)
> **Related skill:** rebny-compliance, superpowers:brainstorming
>
> **Hard limits at design time** (carried by user instruction 2026-04-30):
> - Spec only. No code, no schema, no migrations, no commits in this PR.
> - PR 4 (`refactor/04-media-batch-rewrite`) remains blocked. Implementation of this spec MUST wait until PR 4 closes cleanly.
> - The scraper (StreetEasy / aggregator ingestion) is deliberately excluded from MVP and gated behind a separate spec + legal/compliance review.

## 1. Problem statement

Today mallan.nyc reads listing inventory exclusively from REBNY RLS via Trestle IDX Plus. That feed by REBNY policy excludes:

- **For Sale By Owner (FSBO)** listings (UCBA Art. I §4 — RLS only accepts Exclusive Listings).
- **Off-market / pocket** listings owned by the brokerage's clients but not yet (or never) submitted to RLS.
- **Expired/Withdrawn RLS listings** where the owner is now selling outside RLS.
- **Other agent-discovered inventory** (yard signs, word-of-mouth, friend-of-a-friend leads).

Mallan agents currently have **no system of record** for any of this inventory. They lose deals because:
1. Buyer clients ask "what about FSBOs in Manhattan?" and the agent has no answer.
2. Off-market opportunities surfaced through agent relationships have nowhere to live in the CRM.
3. Manual entry into the existing `ExternalListing` table (per-client clipboard) doesn't fit — that model is buyer-owned, not brokerage-wide inventory.

Competitor RealPlus (verified via screenshots 2026-04-30) handles this via a parallel inventory inside their broker-only tool, with a mandatory `*THIS LISTING DID NOT ORIGINATE FROM THE RLS; PLEASE VERIFY ALL INFO*` disclaimer on every non-RLS row. The B2B-only deployment dramatically lowers the legal/compliance exposure that public republication would carry.

## 2. Goals & non-goals

### Goals

- Brokerage-wide non-RLS inventory accessible to all agents (subject to PII access controls below).
- Selective client visibility: a client sees a non-RLS listing **only** when an agent explicitly invites them to it OR includes it in a curated send.
- Mandatory non-RLS disclaimer on every surface (CRM card, CRM detail, portal card, portal detail, send email, export).
- Owner contact information (PII) is controlled, audited, and never leaves the CRM.
- Compliance posture preserves all RLS / IDX / UCBA / Fair Housing / NY DOS / TCPA boundaries that today's mallan-nyc maintains.

### Non-goals (Phase 1)

- Public display of any non-RLS row (`/api/listings`, `/search`, sitemap, SEO, structured data — none of these ever read this table).
- Inclusion in `listing_search_projection` (PR 5's projection table is RLS-only).
- Automated scraping of any source (deferred to Phase 3 behind a separate spec + legal review).
- Client-side discovery of non-RLS inventory (clients cannot search for these; they only see what's been shared with them).
- Replacing or extending `ExternalListing` (the existing per-buyer clipboard remains untouched).
- Republication of expired RLS listings (UCBA Art. III §3 prohibits solicitation of existing listings; expired-RLS-derived signals are agent-review-only leads, never auto-promoted to inventory).

## 3. Phased rollout

This spec scopes Phase 1 in detail. Phases 2 and 3 are noted with their gating criteria so the data model and API shape stay forward-compatible.

### Phase 1 — Manual MVP (this spec's deliverable)

| Capability | Surface |
|---|---|
| New `external_inventory_listings` table (and `external_inventory_client_shares` join) | DB schema |
| CRM "Add Off-Market" form for agent manual entry | `app/api/crm/external-inventory/route.ts` (POST) + CRM UI |
| CRM list view, detail view, edit, soft-delete | `app/api/crm/external-inventory/[id]/route.ts` + CRM UI |
| CRM IDX search toggle: "Include non-RLS inventory" (default OFF) | `app/api/idx/search/route.ts` extended union read |
| Owner PII reveal flow with audit + agent attestation | `app/api/crm/external-inventory/[id]/owner-contact/route.ts` |
| Per-client share (1-of-1 invite) | `app/api/crm/external-inventory/[id]/share/route.ts` (POST) |
| Search-send extension: agents can include external-inventory items in `ListingSend` | depends on master plan PR 8 (`ListingSend` model) — see §10.4 |
| Client portal: shared external listings appear with disclaimer | `app/api/portal/external-inventory/route.ts` (GET) + portal UI |
| Disclaimer: stamped at write time, rendered everywhere | `lib/external-inventory/disclaimer.ts` |
| Public-route firewall: `assertNotPublicSurface()` helper + CI rule | `lib/external-inventory/access.ts` + `scripts/ci-compliance-check.js` |
| Fair Housing scanner runs before save and before share | reuses existing `lib/compliance/` scanner |
| TCPA / contact-intent gate before owner PII reveal | UI checkbox + audit |

**Phase 1 explicitly excludes** scraping, automated ingestion, bulk import, expired-RLS auto-detection, and any non-CRM source.

### Phase 2 — Bulk import (post-MVP, separate PR)

| Capability | Notes |
|---|---|
| Admin CSV upload | Broker-admin only. Validates each row through the same FH scanner + dedup as Phase 1 manual entry. Writes audit_event per row. |
| URL-assisted manual entry | Agent pastes a public listing URL (e.g., StreetEasy detail page); system fetches once via server-side fetch with strict User-Agent identifying mallan.nyc, parses Open Graph + JSON-LD only (no DOM scraping), pre-fills the manual form for agent confirmation. ToS posture per Phase 2 spec. |
| Address normalization library | Already needed for dedup; promoted to a shared `lib/listings/address-normalize.ts`. |

**Gating criteria for starting Phase 2:** Phase 1 in production for ≥4 weeks, ≥30 manually-entered rows demonstrating real workflow, broker-admin sign-off on bulk-import scope.

### Phase 3 — Scraper (deferred — separate spec required)

| Capability | Notes |
|---|---|
| StreetEasy FSBO scraper | Manhattan + Williamsburg only. Playwright + residential proxy. Daily cron. Photo storage in R2. Diff for "PRICE DROP" / "NEW" badges. |
| Source-adapter abstraction (`lib/external-inventory/sources/<source>.ts`) | Pluggable per source. |
| Rate-limit / circuit-breaker / heartbeat alarms | Daily heartbeat audit_event; alert if 0 new rows for 3 consecutive runs (likely DOM change or block). |
| Photo handling via R2 with attribution metadata | Reuse `lib/images/r2.ts` (provisioned by master-plan SN-B / PR 3). |

**Gating criteria for starting Phase 3:**
1. Phase 1 + Phase 2 in production ≥6 weeks.
2. Written legal review of StreetEasy/Zillow ToS exposure for B2B-only consumption (no public republication). Documented decision memo signed by Maya Allan as broker of record.
3. Vercel egress IP risk assessment (residential proxy decision).
4. Separate design spec for the scraper — NOT this document.
5. Separate implementation PR with its own gates (compliance-check rule extension, scraper-specific tests, manual prod canary).

**This spec treats Phase 3 as out-of-scope and exists in this section only to reserve the data-model shape (source enum, source_url, source_listing_id) so Phase 1 doesn't lock out Phase 3.** No Phase 1 implementation work touches `Playwright`, proxies, scheduled scraping, or any automated extraction path.

## 4. Data model

### 4.1 `external_inventory_listings`

A standalone table — never joined into `listings` or `listing_search_projection`.

```prisma
model ExternalInventoryListing {
  id                    BigInt   @id @default(autoincrement())

  // Provenance
  source                String   // 'agent_manual' | 'agent_pocket' | 'expired_rls_signal' (Phase 1 manual flag) | 'streeteasy_fsbo' (Phase 3 only) | 'csv_import' (Phase 2 only)
  source_url            String?  @db.VarChar(2048)
  source_listing_id     String?  @db.VarChar(255)        // origin's ID if available
  source_disclaimer     String   @db.Text                // stamped at write time; see §6
  source_disclaimer_version String  @default("v1")       // bumped if legal language changes

  // Brokerage discovery metadata
  discovered_by_agent_id  BigInt?
  discovered_at           DateTime @default(now())
  status                  String   @default("active")   // 'active' | 'pending' | 'closed' | 'stale' | 'verified' | 'rejected' | 'promoted_to_rls'
  verified_at             DateTime?
  verified_by_agent_id    BigInt?
  promoted_to_listing_id  String?                       // FK-by-string to listings.listing_id once captured into RLS
  rejected_reason         String?  @db.Text
  last_seen_at            DateTime @default(now())      // touched by manual edit (Phase 1) or scraper (Phase 3)

  // Address (mirrors Listing column shapes; canonical for dedup)
  street_number           String?
  street_dir_prefix       String?
  street_name             String?
  street_suffix           String?
  unit_number             String?
  city                    String?
  borough                 String?
  neighborhood            String?
  postal_code             String?
  address_normalized      String?  @db.VarChar(500)    // lowercased, suffix-stripped, used in dedup unique constraint

  // Property classification
  property_type           String?  // 'Residential' | 'ResidentialLease' | 'Commercial'
  property_sub_type       String?  // 'Condo' | 'Co-op' | 'Townhouse' | 'Single Family' | etc.
  list_price              Decimal? @db.Decimal(14, 2)
  bedrooms_total          Int?
  bathrooms_full          Int?
  bathrooms_half          Int?
  living_area             Decimal? @db.Decimal(10, 2)
  year_built              Int?

  // Description (subject to Fair Housing scan before save — see §8)
  public_remarks          String?  @db.Text             // agent-authored; what the client sees
  private_notes           String?  @db.Text             // CRM-only

  // Owner contact (PII — access-controlled per §5)
  owner_name              String?
  owner_email             String?
  owner_phone             String?
  owner_contact_consent_captured_at DateTime?           // set when agent attests TCPA-safe contact intent

  // Media (Phase 1: agent-uploaded to R2; Phase 3: scraper-cached to R2)
  photos                  Json     @default("[]")       // [{url, order, source: 'r2' | 'external'}]
  primary_photo_url       String?

  // Price history (Phase 1: Json; Phase 3 may promote to PriceHistory relation)
  price_history           Json     @default("[]")       // [{price, observed_at, source}]

  // Search support
  is_searchable           Boolean  @default(true)        // agent can opt out per row
  search_tokens           String[] @default([])

  // Audit / raw payload
  raw_source_data         Json?                          // full scrape payload, Phase 3 only

  created_at              DateTime @default(now())
  updated_at              DateTime @updatedAt

  shares                  ExternalInventoryClientShare[]

  @@unique([source, source_listing_id])
  @@unique([address_normalized])                         // global brokerage-wide dedup
  @@index([source, status])
  @@index([discovered_by_agent_id])
  @@index([borough, neighborhood])
  @@index([is_searchable, status])
  @@index([list_price])
  @@map("external_inventory_listings")
}
```

**Notes:**
- `address_normalized` is the dedup key. Two rows for "100 W 90th St #5A" must not both exist regardless of source. Implementation: lowercase + suffix-canonical (`Street → St`, etc.) + unit-number-canonical (`Apt 5A → #5A`). Helper: `lib/listings/address-normalize.ts`.
- `source_disclaimer` is stamped at row write. If legal language changes, new rows get the new default; old rows keep their original wording (acceptable per legal review). A future migration can bulk-update if legal demands retroactive change.
- `promoted_to_listing_id` lets a non-RLS row link to a real Listing if/when it gets exclusively listed by mallan. Status flips to `promoted_to_rls`; row stays for audit history but is no longer surfaced.
- `expired_rls_signal` is a Phase-1-allowed source string for **agent-curated** rows derived from manually reviewing expired Trestle listings. **Auto-detection of expired RLS → external inventory is NOT in Phase 1**; that is a future agent-tooling enhancement, not an automatic ingestion. UCBA Art. III §3 (no solicitation of existing listings) requires manual review.

### 4.2 `external_inventory_client_shares`

The **only** mechanism by which a client can see one of these listings.

```prisma
model ExternalInventoryClientShare {
  id                              BigInt    @id @default(autoincrement())
  external_inventory_listing_id   BigInt
  external_inventory_listing      ExternalInventoryListing @relation(fields: [external_inventory_listing_id], references: [id], onDelete: Cascade)
  lead_id                         BigInt
  lead                            Lead      @relation(fields: [lead_id], references: [id], onDelete: Cascade)
  shared_by_agent_id              BigInt
  shared_via                      String    // 'invite' | 'search_send' | 'collection'
  shared_at                       DateTime  @default(now())
  revoked_at                      DateTime?
  revoked_by_agent_id             BigInt?
  viewed_at                       DateTime?
  client_reaction                 String?   // 'liked' | 'passed' | 'discuss' | 'tour_requested'
  client_reaction_at              DateTime?
  agent_note                      String?   @db.Text

  @@unique([external_inventory_listing_id, lead_id])
  @@index([lead_id, revoked_at])
  @@index([shared_by_agent_id])
  @@map("external_inventory_client_shares")
}
```

**Read posture (the firewall):**
- Client portal queries `ExternalInventoryClientShare WHERE lead_id = current_lead AND revoked_at IS NULL` — this is the only read pattern that surfaces external inventory to a client.
- Public routes (`/api/listings`, search, sitemap, SEO endpoints) **must not query this table**. Enforced via `assertNotPublicSurface()` (§9.2) and CI rule (§9.3).

### 4.3 `external_inventory_pii_reveal_log`

Mandatory audit trail for every owner-PII access — separate from the generic `audit_events` so it's queryable as a dedicated compliance artifact.

```prisma
model ExternalInventoryPiiRevealLog {
  id                              BigInt    @id @default(autoincrement())
  external_inventory_listing_id   BigInt
  revealed_to_agent_id            BigInt
  revealed_at                     DateTime  @default(now())
  fields_revealed                 String[]  // ['owner_name', 'owner_email', 'owner_phone']
  contact_intent_attestation      Boolean   // user clicked "I will only contact this owner per their public listing intent"
  ip_address                      String?
  user_agent                      String?
  request_path                    String

  @@index([external_inventory_listing_id])
  @@index([revealed_to_agent_id, revealed_at])
  @@map("external_inventory_pii_reveal_log")
}
```

Logged by every owner-PII reveal API call regardless of who's calling.

### 4.4 Future (NOT in this spec)

- `ExternalInventoryPriceHistory` relation — promoted from the `price_history` Json column when query patterns demand SQL aggregation. Phase 1 keeps Json for write simplicity and YAGNI.
- `ExternalInventoryDelegation` — extra ACL grants beyond `discovered_by_agent_id` (e.g., agent partner sharing). Phase 1 ACL is just discovering-agent + broker_admin (§5).
- `ExternalInventorySource` table — pluggable source configs for Phase 3 scraper. Phase 1 uses a string enum.

## 5. Owner PII access control

PII fields: `owner_name`, `owner_email`, `owner_phone`.

### 5.1 Access matrix

| Caller | Default access | Audit on read |
|---|---|---|
| Discovering agent (`discovered_by_agent_id === viewer.id`) | Visible | Yes |
| Broker admin (`viewer.role === 'broker_admin'`) | Visible | Yes |
| Other agents in the brokerage | **Hidden** (DTO returns `null` for the three PII fields) | N/A |
| Client portal (any lead) | **Hidden** (always — even on shared listings) | N/A |
| Public/SEO/system | Never queries this table | N/A |

`ExternalInventoryDelegation` (Phase 2+) lets the discovering agent grant view rights to specific teammates. Out of scope for Phase 1.

### 5.2 Reveal flow (Phase 1)

The CRM detail page does NOT auto-render owner contact in the initial response. PII reveal is an explicit second-step API call:

`POST /api/crm/external-inventory/[id]/owner-contact/reveal`

Body:
```json
{
  "contact_intent_attestation": true
}
```

Server:
1. Auth — caller must be a logged-in agent or broker_admin.
2. ACL — `discovered_by_agent_id === caller.id` OR `caller.role === 'broker_admin'`. Else 403.
3. Attestation — if `contact_intent_attestation !== true`, return 400 with the attestation prompt text.
4. Lookup the row, return ONLY `{owner_name, owner_email, owner_phone}` plus a `revealed_at` timestamp.
5. Write a row to `external_inventory_pii_reveal_log` capturing fields revealed, attestation, IP, UA, path.

Frontend:
- "Show owner contact" button on CRM detail.
- Modal: "I will only contact this owner per the contact intent published on their listing. Contact attempts that violate TCPA, CAN-SPAM, or DOS §175.25 are my responsibility." + checkbox + Cancel / Reveal buttons.
- On reveal, render contact fields with a small "Logged at <timestamp>" line so the agent knows the action was audited.

### 5.3 Contact-intent attestation language

> "I will only contact this owner using the contact information they themselves published on their listing, for the purpose they indicated (sale of this property). I understand TCPA and CAN-SPAM apply to any communication I initiate, that NY DOS §175.25 disclosure requirements apply to my real-estate communications, and that this access has been logged."

Rendered verbatim. Stored as a hash of the rendered text + timestamp on each reveal so the precise wording at the time of attestation is recoverable from logs.

### 5.4 What clients can see

Even on a shared external-inventory listing, the client portal DTO **never** includes owner_name / owner_email / owner_phone. The portal client experience for an external listing is:

- Property details (address, beds/baths/sqft/price/photos/public_remarks)
- The non-RLS disclaimer banner
- "Tour request" / "Discuss with my agent" buttons that ROUTE TO THE SHARING AGENT, not to the owner

There is no path through which client UI discloses owner PII. Enforced by the portal DTO sanitizer (§9.4).

## 6. Disclaimer system

### 6.1 Default text (v1)

> "**THIS LISTING DID NOT ORIGINATE FROM THE RLS / REBNY. PLEASE VERIFY ALL INFORMATION INDEPENDENTLY.** Listing data is sourced from third parties or directly from the property owner; mallan.nyc has not verified accuracy and makes no representation as to the truth of any statement herein. Photos, descriptions, and pricing may be outdated. Owner contact information is governed by the publishing platform's terms; broker contact is encouraged."

Lives at `lib/external-inventory/disclaimer.ts`:

```ts
export const DISCLAIMERS = {
  v1: 'THIS LISTING DID NOT ORIGINATE FROM THE RLS...',
  // future versions added here
} as const;

export const CURRENT_DISCLAIMER_VERSION = 'v1';
```

### 6.2 Stamping policy

- Every new row gets `source_disclaimer = DISCLAIMERS[CURRENT_DISCLAIMER_VERSION]` and `source_disclaimer_version = CURRENT_DISCLAIMER_VERSION` at write time.
- Existing rows retain their original disclaimer (acceptable per legal review).
- If legal demands a retroactive update for all rows, a one-shot SQL UPDATE bumps every row's `source_disclaimer` and `source_disclaimer_version` (separate ops PR with audit).

### 6.3 Render surfaces — disclaimer MUST appear on all of these

| Surface | Render location |
|---|---|
| CRM list view (each card) | Small badge "NON-RLS" + tooltip with full text |
| CRM detail view | Banner above the property summary |
| CRM print/export | Top of every printed page or first row of CSV |
| Send email (search-send, invite) | Within each external-inventory item block + once at email footer |
| Client portal list view | "NON-RLS" badge per card |
| Client portal detail view | Banner above property summary, before any photo |
| Outbound email of any kind referencing a non-RLS listing | Full text included |

All renders pull from the row's `source_disclaimer` field, NOT from a constant — so older rows show the version stamped at their write time.

## 7. Workflows

### 7.1 Manual "Add Off-Market" (the Phase 1 entrypoint)

Agent CRM → workspace → "Add Off-Market" button (visible only to authenticated agents).

Form fields (validated, address-normalized, FH-scanned before save):
- Address (street number, dir prefix, name, suffix, unit, city, postal, borough, neighborhood)
- Property type / sub type / bedrooms / bathrooms / sqft / year built
- List price
- Public remarks (FH-scanned; rejection blocks save with specific feedback)
- Private notes (CRM-only; not FH-scanned because it's never client-visible)
- Owner contact (optional; if entered, audit_event written marking PII first-write)
- Photos (uploaded to R2 via existing `lib/images/r2.ts`)
- Source: defaults to `agent_manual` (free-text override allowed for `agent_pocket` / `expired_rls_signal`)

On save:
1. Address normalize.
2. Dedup check: if `address_normalized` matches existing row, present "merge or override" UI to the agent.
3. Fair Housing scan on `public_remarks`. Rejection blocks save with specific terms flagged.
4. Insert row with `source_disclaimer` stamped, `discovered_by_agent_id = current.id`, `last_seen_at = now`, `discovered_at = now`.
5. Audit event: `external_inventory_created`.

### 7.2 CRM IDX search toggle

`/api/idx/search` and the dashboard search UI gain a single new boolean parameter: `include_external_inventory` (default **false**).

When true, the response unions:
- Trestle/RLS results (existing logic, unchanged)
- `ExternalInventoryListing WHERE status = 'active' AND is_searchable = true` filtered by the same address/type/beds/price/etc. predicates as the RLS query

External rows in the response carry an explicit `_source: 'external_inventory'` flag and the disclaimer text. The CRM result-list renderer applies the "NON-RLS" badge styling.

The toggle is OFF by default. Agents must opt-in per-search. The toggle state is NOT persisted (deliberate — every search re-evaluates the agent's intent).

External inventory is **never** included via `/api/listings`, `/api/listings/similar`, the search projection, saved searches, or the `search_alerts` cron. Enforced by `assertNotPublicSurface()` at the helper level and by CI rule (§9.3).

### 7.3 Per-client share — explicit invite

Agent CRM detail of an external-inventory listing → "Share with client" → modal:

- Client picker (agent's assigned leads only; broker_admin can pick any lead)
- Optional `agent_note` (private to the share record — not the row itself)
- Submit → server creates `ExternalInventoryClientShare` with `shared_via = 'invite'`
- Audit event: `external_inventory_shared`
- Client portal subsequently shows the listing on next page load

Reverse flow:
- "Revoke share" → sets `revoked_at` and `revoked_by_agent_id`. Client loses access immediately.

### 7.4 Search-send bulk share

Builds on master plan PR 8's `ListingSend` / `ListingSendItem` (see `memory/REFACTOR-2026-04-25.md` PR 8). When PR 8 ships, a `ListingSendItem` gains an optional `external_inventory_listing_id` (mutually exclusive with the existing `listing_id` for RLS sends).

Agent flow:
1. Agent runs an IDX search with `include_external_inventory=true`.
2. Result list shows RLS listings + external inventory; agent selects which items to include.
3. **Selection is explicit per item.** The send pipeline NEVER auto-includes external inventory; the agent must check each one.
4. On send, for each selected external item, the system creates an `ExternalInventoryClientShare` with `shared_via = 'search_send'` if one doesn't already exist.

The send email lays out RLS items and external items in **separate sections** with the disclaimer rendered above the external section and within each item.

### 7.5 Client portal — read-only

Client portal `/api/portal/external-inventory` returns:
- All `ExternalInventoryClientShare WHERE lead_id = current_lead AND revoked_at IS NULL`
- Joined to the `ExternalInventoryListing` row
- DTO sanitized: NO `owner_*` fields, NO `private_notes`, NO `raw_source_data`, NO `discovered_by_agent_id`, NO `verified_by_agent_id`. Yes to: address, property fields, public_remarks, photos, primary_photo_url, list_price, the disclaimer text.

Client cannot:
- Search external inventory (no search route exposed)
- View details that aren't shared (404 on direct access)
- See owner contact (filtered out)
- Submit an "offer" (existing portal Offer model is RLS-only; external inventory triggers an "Email my agent" CTA instead)

Client can:
- React (`liked` / `passed` / `discuss` / `tour_requested`) — writes to `client_reaction` on the share row
- Comment via the existing `Comment` model (linked to the share row, not the listing row)
- Request a tour — opens an email/note to the sharing agent (not to the property owner)

### 7.6 Listing transitions

| Event | Action |
|---|---|
| Owner removes listing from public source | Agent manually marks `status = 'closed'` or system flips to `'stale'` after Phase 3 detection |
| Owner signs RLS exclusive with mallan | Agent creates the RLS Listing in CRM; status of the external row → `'promoted_to_rls'` with `promoted_to_listing_id` set |
| Property closes | Status → `'closed'` with manual reason |
| Listing turns out to be a Listing falsely advertised as FSBO (e.g., licensed broker hiding affiliation) | Status → `'rejected'` with `rejected_reason`. Row retained for audit. |

## 8. Fair Housing scanning

Reuses the existing `lib/compliance/` Fair Housing scanner (`data/compliance/prohibited-terms.json` with 80+ terms across 8 categories — see rebny-compliance skill).

### 8.1 Save-time scan

Every `public_remarks` save (manual entry, edit, future scrape) runs through the scanner. Any flagged term blocks save with a specific error response listing the terms. Save retried after agent edits.

### 8.2 Share-time scan

When agent shares a listing, the system re-runs the FH scan on `public_remarks` at the moment of share. Reason: `public_remarks` may have been edited between save and share, or the scanner may have updated terms since save. Share-time rejection blocks the share (no `ExternalInventoryClientShare` row created) and surfaces the violations to the agent.

### 8.3 Scope clarification

- `private_notes` is NEVER scanned (CRM-only, never client-visible).
- `owner_name` is not scanned (proper noun).
- Future scraper-ingested `public_remarks`: scanned at ingest time. Block (don't store) any row that would fail. Phase 3 specifies this.

## 9. Compliance posture (the firewall)

### 9.1 Boundaries — what external inventory is NOT

- **Never publicly displayed.** No `/api/listings`, `/api/listings/[id]`, `/api/listings/similar`, `/api/listings/featured`, `/search` page, neighborhood pages, building pages, or any other public surface reads `external_inventory_listings`.
- **Never in the search projection.** `listing_search_projection` is RLS-only (PR 5). External inventory has its own table; no projection write.
- **Never in the sitemap.** `app/sitemap.ts` does not enumerate this table.
- **Never SEO-indexed.** No structured-data/JSON-LD for external inventory pages. No open graph metadata.
- **Never attributed as "REBNY listing courtesy of"** (UCBA Art. III §2(C)). Attribution is reserved for RLS data.
- **Never described with "Off-Market" in advertising copy** (UCBA Art. I §5(D) — but note: the `agent_pocket` source string is internal-only metadata, not advertising copy. The disclaimer banner is the public-facing wording, not "Off-Market.")
- **Never re-published as if it were exclusive RLS inventory.** A row's status `promoted_to_rls` is recorded only after a real RLS Listing exists.

### 9.2 Public-surface firewall — `assertNotPublicSurface()`

```ts
// lib/external-inventory/access.ts
const PUBLIC_ROUTE_MARKERS = ['/api/listings', '/api/health', '/sitemap', ...];

export function assertNotPublicSurface(routePath: string): void {
  for (const marker of PUBLIC_ROUTE_MARKERS) {
    if (routePath.startsWith(marker)) {
      throw new Error(
        `External inventory access denied: caller path "${routePath}" is a public surface. ` +
        `External inventory is CRM/portal-only.`
      );
    }
  }
}
```

Every `lib/external-inventory/**` query helper calls `assertNotPublicSurface(request.nextUrl.pathname)` as the first line. Defense in depth: even if a public route accidentally imports an external-inventory helper, the helper throws.

### 9.3 CI rule — block external-inventory references in disallowed paths

Added to `scripts/ci-compliance-check.js`:

```js
// Section: External inventory must never be referenced from public surfaces
const externalInventoryReferences = findFiles(ROOT, ['ts', 'tsx', 'js'])
  .filter(f => /external_inventory|external-inventory|ExternalInventory/.test(fs.readFileSync(f, 'utf8')))
  .filter(f => {
    const rel = path.relative(ROOT, f);
    const allowed = /^(app\/(api\/(crm|portal)\/external-inventory|portal\/(buyer|tenant|seller|landlord)\/.*\/external-inventory)|lib\/external-inventory|scripts\/.*-external-inventory|tests?\/.*-external-inventory)/;
    return !allowed.test(rel);
  });

if (externalInventoryReferences.length === 0) {
  pass('External inventory references confined to approved CRM/portal/lib paths');
} else {
  fail(`External inventory references found in disallowed paths: ${externalInventoryReferences.map(f => path.relative(ROOT, f)).join(', ')}`);
}
```

Compliance check count rises from 90 → 91. CI fails any PR that introduces an external-inventory reference outside the allowlist.

### 9.4 Portal DTO sanitizer

Reuses `lib/compliance/dto.ts`'s pattern. New function:

```ts
// lib/external-inventory/portal-dto.ts
export function externalInventoryPortalDTO(
  share: ExternalInventoryClientShare & { external_inventory_listing: ExternalInventoryListing },
): PortalExternalInventoryDTO {
  // Strip ALL owner_* fields, private_notes, raw_source_data, discovered_by_agent_id, verified_by_agent_id, internal status reasons.
  // Returns: address (subject to typical address-suppression rules — but FSBO is by definition publicly listed, so no suppression here),
  //   public_remarks, photos, primary_photo_url, list_price, beds/baths/sqft, neighborhood, city, postal_code, source_disclaimer.
}
```

### 9.5 REBNY / RLS / UCBA boundaries preserved

| Rule | How this design preserves it |
|---|---|
| UCBA Art. I §4 — RLS only accepts Exclusive Listings | External inventory never enters RLS. Submission to RLS is via RealPlus (not mallan.nyc), unchanged. |
| UCBA Art. I §5(D) — no "Off-Market" language | Source enum value `agent_pocket` is internal-only; never rendered on public-facing or client-facing surface. |
| UCBA Art. III §2(C) — attribution | Disclaimer says "did NOT originate from RLS/REBNY" — no false attribution. |
| UCBA Art. III §3 — no solicitation of existing listings | Expired RLS listings detected manually only; auto-promotion banned. |
| Fair Housing | Save-time + share-time scan (§8). |
| NY DOS §175.25 advertising | External inventory is NEVER advertising (never public). Internal CRM display + invited-client portal display. Disclaimer makes the non-licensed-broker source explicit. |
| TCPA / CAN-SPAM | PII reveal requires contact-intent attestation (§5.3). Owner-contact emails sent by the agent are subject to existing TCPA controls in mallan.nyc. |
| NY SHIELD Act | PII access logged in dedicated table (§4.3) with timestamps, IP, UA. Retention follows existing data-retention cron policy. |

## 10. Implementation surface (Phase 1 only)

Files this spec proposes to add or touch — **for the Phase 1 implementation PR**, NOT this design doc.

### 10.1 New files

| Path | Purpose |
|---|---|
| `lib/external-inventory/disclaimer.ts` | Disclaimer constants + version pointer (§6) |
| `lib/external-inventory/access.ts` | `assertNotPublicSurface()` + ACL helpers (§5, §9.2) |
| `lib/external-inventory/normalize.ts` | Address normalization (already needed; could promote to shared `lib/listings/`) |
| `lib/external-inventory/portal-dto.ts` | DTO sanitizer for client-portal reads (§9.4) |
| `lib/external-inventory/__tests__/*.test.ts` | Tests for ACL, dedup, FH scan, disclaimer stamping |
| `app/api/crm/external-inventory/route.ts` | GET (list), POST (create) |
| `app/api/crm/external-inventory/[id]/route.ts` | GET (detail), PATCH (edit), DELETE (soft-delete) |
| `app/api/crm/external-inventory/[id]/owner-contact/reveal/route.ts` | POST (PII reveal with attestation) |
| `app/api/crm/external-inventory/[id]/share/route.ts` | POST (share with client) |
| `app/api/crm/external-inventory/[id]/share/[shareId]/route.ts` | DELETE (revoke share) |
| `app/api/portal/external-inventory/route.ts` | GET (client-portal list of shared) |
| `app/api/portal/external-inventory/[id]/route.ts` | GET (client-portal detail of shared) |
| `app/api/portal/external-inventory/[id]/react/route.ts` | POST (client reaction) |
| `public/crm/js/dashboard/panels/external-inventory.js` | CRM UI |
| `app/portal/buyer/external-inventory/page.tsx` (and tenant/seller/landlord variants) | Portal UI |

### 10.2 Modified files

| Path | Change |
|---|---|
| `prisma/schema.prisma` | +3 models (`ExternalInventoryListing`, `ExternalInventoryClientShare`, `ExternalInventoryPiiRevealLog`) + 3 indexes; back-relations on `Lead`, `Agent`. Schema-only migration. |
| `app/api/idx/search/route.ts` | Accept `include_external_inventory` boolean param; union with external rows when true. Default false; existing behavior unchanged. |
| `scripts/ci-compliance-check.js` | +1 check (path-allowlist for external-inventory references — §9.3) |
| `lib/compliance/dto.ts` | (Optional) export shared portal-DTO pattern for reuse |
| `app/sitemap.ts` | (Verify only — confirm it does not enumerate the new table) |
| `app/robots.ts` | (Verify only — confirm new route paths under `/portal/*/external-inventory` are not crawlable) |

### 10.3 Migration

One additive migration creates the three tables + indexes. No backfill required (table starts empty). Apply manually to Neon prod per `NEON.md` discipline before code merge.

### 10.4 Dependency on master plan PR 8

Search-send bulk share (§7.4) requires the `ListingSend` / `ListingSendItem` models from master-plan PR 8 (`memory/REFACTOR-2026-04-25.md`). Two options for sequencing:

1. **Block this spec's implementation on PR 8.** Cleanest. PR 8 ships first; this spec's implementation extends `ListingSendItem` to support external-inventory items.
2. **Ship this spec first without the bulk-send extension.** §7.3 (per-client invite) and §7.5 (client portal read) work standalone. Bulk send via `ListingSend` becomes a follow-up after PR 8.

**Recommendation:** option 2 — ship the manual-entry + per-client-invite + portal-display slice first, then layer search-send when PR 8 lands. This decouples the two and avoids stalling Phase 1 on master-plan progress.

## 11. Edge cases

| Case | Resolution |
|---|---|
| Agent enters duplicate (same `address_normalized`) | UI shows "matching row exists, merge or override?" — agent picks. Audit either way. |
| Agent enters something already in RLS | Address-normalize match against `listings.listing_id` (best-effort) — UI warns "this property appears to be RLS listing X; use that row instead?" Agent confirms or proceeds anyway. |
| Multiple agents discover the same FSBO | First writer wins on `discovered_by_agent_id`. Phase 2 adds a "co-discovery" log. |
| Agent who discovered a row leaves the brokerage | Row's `discovered_by_agent_id` retained for audit; ACL falls back to broker_admin only. Offboarding workflow can transfer ownership to a successor agent. |
| External listing transitions to RLS Exclusive with mallan | Agent flips status to `promoted_to_rls`, sets `promoted_to_listing_id`. Row stays for audit; client shares retained but marked superseded in portal UI. |
| External listing transitions to RLS with another broker | Agent flips status to `rejected` with reason "exclusive with another broker". Existing client shares stay viewable for historical context but show a "no longer available via mallan" banner. |
| Owner contact info changes | Agent edits row; old PII captured in audit_event. PII reveal log retains historical access record. |
| Stale detection (Phase 1) | Manual only — agent flips status to `stale` if they confirm no longer for sale. Phase 3 scraper auto-detects. |
| Photo licensing on Phase 1 manual entry | Agent uploads photos directly (their own captures or owner-provided); they assert ownership/permission via a checkbox at upload. |
| Photo licensing on Phase 3 scraper | Out of scope here — addressed in Phase 3 spec with separate legal review. |

## 12. Testing posture

Phase 1 tests organized to mirror existing `lib/external-listings/` and `lib/seller-signals/` patterns:

| Test suite | Coverage |
|---|---|
| `lib/external-inventory/__tests__/access.test.ts` | `assertNotPublicSurface` throws on every public-route prefix; ACL allows discovering agent + broker_admin, denies others |
| `lib/external-inventory/__tests__/normalize.test.ts` | Address normalization (suffix canonical, unit canonical, dedup key produces same string for equivalent inputs) |
| `lib/external-inventory/__tests__/portal-dto.test.ts` | Client portal DTO strips PII; never returns owner_* fields under any input |
| `lib/external-inventory/__tests__/disclaimer.test.ts` | Stamping at write time; row retains original disclaimer when default changes; retroactive update path |
| `lib/external-inventory/__tests__/share-flow.test.ts` | Per-client invite create/revoke; can-only-be-shared-by-discovering-agent-or-broker; revoked share invisible to client |
| `lib/external-inventory/__tests__/fair-housing.test.ts` | Save-time and share-time FH scans block on prohibited terms |
| Integration test on `app/api/crm/external-inventory/[id]/owner-contact/reveal/route.ts` | Reveal requires attestation; logs to `external_inventory_pii_reveal_log`; respects ACL |
| CI rule test (in `scripts/ci-compliance-check.js`) | Adding a reference to `external_inventory_listings` in `app/api/listings/route.ts` causes compliance-check fail |

All tests run via the existing Jest config pattern (`lib/external-inventory/jest.config.js` mirrors `lib/external-listings/jest.config.js`).

## 13. Rollout plan (when Phase 1 implementation PR ships)

1. Migration applied to Neon prod (manual, per NEON.md).
2. Code merged to main (one PR for the Phase 1 surface; targets ~3-4 weeks of active dev).
3. Internal canary: brokerage-admin Maya enters 5-10 test rows manually, walks through CRM flow, share flow, portal read.
4. Agent rollout: announce in agent meeting + brief written guide. Agents start manual entry as discovered.
5. Observation window: 4 weeks. Track row count, share count, PII reveals, FH scan rejections, audit_event volume.
6. Phase 2 gating decision after observation: if row count is justifying bulk import, scope Phase 2 as separate PR.

**No production deploy of Phase 1 until master plan PR 4 closes cleanly** (per active observation gate at session-close 2026-04-30).

## 14. Self-review

Per spec self-review requirements (user-specified 2026-04-30):

> **Does this ever expose non-RLS inventory publicly?**
>
> No. §9.1 enumerates every surface and the answer is "never" for all of them. §9.2 defines `assertNotPublicSurface()` that throws if a `lib/external-inventory/**` helper is invoked from a public route. §9.3 adds a CI rule that fails on any reference to `external_inventory_listings` from `app/api/listings/`, `app/api/health/`, sitemap, or other public paths. §9.4 sanitizes the portal DTO so PII never reaches the client surface either.

> **Could external inventory leak into `/api/listings`, sitemap, SEO, or `listing_search_projection`?**
>
> No. (a) `/api/listings` only reads `listings` and never imports `lib/external-inventory/**` — enforced by the CI rule. (b) Sitemap explicitly verified not to enumerate (modified-files §10.2). (c) No JSON-LD / structured data emitted for external rows. (d) PR 5's `listing_search_projection` is RLS-only by design; this spec adds no projection write paths and the CI rule blocks accidental references.

> **Are owner PII controls explicit?**
>
> Yes. §5 defines the access matrix (discovering agent + broker_admin only), the explicit two-step reveal flow with TCPA/CAN-SPAM/§175.25 attestation (§5.2-§5.3), the dedicated audit log table (§4.3), and the absolute prohibition on PII reaching the client portal (§5.4 + §9.4). Every reveal writes to `external_inventory_pii_reveal_log` with fields revealed, IP, UA, and request path.

> **Is scraper work excluded from MVP?**
>
> Yes. §3 explicitly puts the scraper in Phase 3 with FOUR gating criteria (Phase 1+2 in production ≥6 weeks, written legal review, separate spec, separate PR). §10 lists no scraper files in the Phase 1 implementation surface. The data model in §4 reserves source enum values like `streeteasy_fsbo` solely so Phase 3 doesn't require a schema change — but no Phase 1 code reads or writes those values.

> **Are legal/ToS risks documented?**
>
> Yes. §1 acknowledges the RealPlus B2B-only pattern as the reference posture. §3 notes the Phase 3 scraper requires written legal review of StreetEasy/Zillow ToS exposure as a gating criterion. §9.5 cross-references each REBNY/UCBA/NY DOS rule and explains how the design preserves it. Photo licensing per source is called out (§11). Owner-contact licensing is governed by the publishing platform's terms (cited in the disclaimer text §6.1).

> **Are client-share gates auditable?**
>
> Yes. `ExternalInventoryClientShare` (§4.2) is the only mechanism for client visibility; the table records `shared_by_agent_id`, `shared_via`, `shared_at`, `revoked_at`, `revoked_by_agent_id`, and reaction trail. Every share write emits a generic `audit_event` with the share details. Portal reads of the join produce additional `audit_event` entries (matches existing portal-event policy from search-spine work). PII reveals are logged separately in `external_inventory_pii_reveal_log` (§4.3).

> **Are REBNY / RLS / UCBA boundaries preserved?**
>
> Yes — §9.5 enumerates each rule (UCBA Art. I §4, §5(D), Art. III §2(C), Art. III §3, Fair Housing, NY DOS §175.25, TCPA, CAN-SPAM, NY SHIELD) and the specific design element that preserves it. The design ALSO preserves the existing REBNY-IDX-Plus-pre-filter writer fix (mapper `0309875b`) by leaving `lib/idx/trestle-mapper.ts` and the reader gates untouched — external inventory has its own ingest path. Note (added 2026-05-01): the writer fix's null-handling logic is **specific to REBNY's policy layer applied at Cotality's data-serving boundary**, not universal Trestle behavior. When Phase 2-A subscribes to OneKey or NY State MLS, those feeds carry different MLS-policy layers and runtime payload behavior must be verified per feed. Each new ingest path gets its own coverage-probe + writer-test cycle before promotion to production.

## 15. Open questions / decisions deferred

- **§10.4 sequencing decision.** Recommend ship Phase 1 manual + per-client invite first, layer search-send onto master-plan PR 8 later. User confirmation needed at implementation-plan time, not at design-doc time.
- **Address normalization library scope.** Should `lib/external-inventory/normalize.ts` be promoted to `lib/listings/address-normalize.ts` for shared use with the eventual RLS dedup story? Defer to implementation review.
- **Phase 3 ToS legal review.** Required before Phase 3 starts. Not a blocker for Phase 1.
- **Disclaimer language v1.** §6.1 text is a draft. Legal-review pass before ship; expected to be approved with minor edits.
- **PII retention.** External-inventory PII (`owner_*` fields) follows the existing data-retention policy: rows soft-deleted at status `closed` retain PII for 6 years per NY DOS. Hard-purge after 6 years via the existing `data-retention` cron, extended to cover this table.

## 16. Cross-references

- `lib/idx/trestle-mapper.ts` — RLS mapping (untouched by this spec)
- `lib/idx/db-to-public-dto.ts` — public reader gates (untouched)
- `lib/search/listing-access-decision.ts` — search-side gates (untouched)
- `lib/compliance/gates.ts` — fail-closed permission helpers (referenced for design pattern, not modified)
- `lib/compliance/dto.ts` — portal DTO pattern (referenced; new sanitizer follows this shape)
- `prisma/schema.prisma` — three new models added at implementation time
- `scripts/ci-compliance-check.js` — +1 new check at implementation time (count 90 → 91)
- `data/compliance/prohibited-terms.json` — Fair Housing scanner source (reused)
- `memory/REFACTOR-2026-04-25.md` — master plan; this spec orbits PR 4 + PR 8 timing
- `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` — recent incident; this spec preserves the writer-side fix and reader-side gates the incident closed
- `CLAUDE.md` — Memory File Policy and follow-up block reference this spec at implementation time

## 17. Resume instructions for the implementation session

When the implementation PR for this spec begins (NOT before PR 4 closes):

1. Re-read this entire spec end-to-end. No skimming.
2. Re-read `CLAUDE.md`, `NEON.md`, and the rebny-compliance skill in full.
3. Confirm PR 4 has merged AND the post-PR-4 observation window has passed AND ops:health is clean.
4. Confirm master plan PR 8 status — if MERGED, plan to extend `ListingSendItem`. If still NOT_STARTED, ship Phase 1 without the search-send extension and add it in a separate follow-up PR after PR 8 lands.
5. Invoke `superpowers:writing-plans` to convert this spec into a per-PR implementation plan.
6. Apply the migration manually to Neon prod **before** code merge (per NEON.md §4).
7. Update `memory/REFACTOR-2026-04-25.md` "Recently landed" with the merged PR.
8. Mirror any new memory files to `C:\Users\MayaAllan\Desktop\memory\` per CLAUDE.md.

---

*End of design spec — 2026-04-30. Approved with revisions per user instruction. Self-review complete (§14). Awaiting user review before transition to writing-plans.*
