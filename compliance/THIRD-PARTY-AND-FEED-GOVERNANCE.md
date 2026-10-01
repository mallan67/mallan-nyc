# Third-Party & Feed Governance

> **Feed:** REBNY RLS via the Cotality API | **LMP:** RealPlus (listing input to RLS) | **IDX Display:** Cotality IDX Plus Web API (read-only on mallan.nyc)
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323

---

> ### AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **NY law/DOS, Fair Housing and REBNY rules (UCBA 2026, REBNY Listing Service)** govern use, display and conduct. 2. **The live Cotality API** is the only authority for provider fields, values and picklists (`data/cotality-enums.live.json` is its committed copy).
> 3. **Mallan business rules** govern how verified facts are used; Mallan-created fields (mostly commercial and private-listing fields) are Mallan facts, never presented as provider data, and can restrict but never override a law/REBNY/provider display restriction (Master §0.2, §4, §21.1). 4. **Fail closed = NON-DISPLAY.** Plan: `MALLAN-PLATFORM-MASTER-PLAN.md`; state: `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.

---

## 1. Cotality (Primary Feed Provider)

### Connection Details

| Parameter | Value |
|-----------|-------|
| Provider | Cotality |
| Platform | Cotality Web API (OData) |
| Data API | `api.cotality.com/trestle/odata/` |
| Auth endpoint | `api.cotality.com/trestle/oidc/connect/token` |
| Support | trestlesupport@cotality.com |
| Documentation | Current Cotality provider documentation (confirm the URL with Cotality support) |
| Protocol | RESO Web API (OData) |
| Authentication | OAuth 2.0 (client credentials) |

### Base URL and Authentication

- Base URL: `api.cotality.com/trestle/`
- Store the base URL as an environment variable (`TRESTLE_API_URL=https://api.cotality.com/trestle`) — never hardcode. Runtime OAuth: `lib/idx/auth.ts` (Master §0.1).
- Media/photo URLs use `api.cotality.com/trestle/media/...`.
- The provider host migration (deadline March 31, 2026) is complete. The retired provider hosts are blocked in code by `scripts/ci/guardrails.mjs`. They remain only as a temporary frozen public-search dependency: the media proxy allowlist (`lib/media/proxy-url-policy.ts`) and the frozen listing routes still accept them for legacy photo URLs through the 2026 warranty period, until the public-search Cotality conversion removes them.

### ⚠️ COTALITY MEDIA API RULES — VENDOR-CONFIRMED (2026-04-07)

> **Source:** Direct feedback from Cotality support.
> **Classification:** MANDATORY — these rules govern all Media resource queries in the codebase.

| # | Rule | Rationale | Enforcement |
|---|------|-----------|-------------|
| 1 | **Use `ResourceRecordKey` (or `ResourceRecordKeyNumeric`), NOT `ResourceRecordID`** | `ResourceRecordID` can be duplicated across MLOs (Multiple Listing Organizations). `ResourceRecordKey`/`Numeric` are always unique. Using `ResourceRecordID` risks returning wrong media for a listing. | All batch Media OData queries filter by `ResourceRecordKey`. DB column `mls_id` (Listing model) stores `ListingKey` = `ResourceRecordKey`. Fallback to `ResourceRecordID` only when `mls_id` is null. |
| 2 | **`Media/All` endpoint is DEPRECATED** | Cotality is removing `Media/All`. | Query `/odata/Media` with explicit `$filter`. No `Media/All` usage exists in codebase (verified). |
| 3 | **Use `Media.ModificationTimestamp` for individual media changes** | Source of truth for when a specific photo/floorplan was added, modified, or removed. | Included in `$expand=Media($select=...,ModificationTimestamp,ResourceRecordKey)` and batch `$select`. |
| 4 | **Use `Property.PhotosChangeTimestamp` as media change trigger** | High-level signal on the Property resource — modified when ANY media for that listing changes. Cheaper than querying Media for every listing. | Included in `CARD_SELECT_FIELDS` (`card-fields.ts`). Available for backfill optimization. |

**Field mapping reference:**
- Property.`ListingKey` = Media.`ResourceRecordKey` (string, always unique)
- Property.`ListingKeyNumeric` = Media.`ResourceRecordKeyNumeric` (numeric, always unique)
- Property.`ListingId` = Media.`ResourceRecordID` (string, **NOT guaranteed unique across MLOs**)

**Where these rules are enforced:** `lib/idx/sync.ts`, `lib/idx/media-sync.ts`, `lib/idx/fetch.ts`, `lib/idx/card-fields.ts`, `app/api/media/batch/route.ts`, `app/api/agents/[slug]/listings/route.ts`, `app/api/idx/search/route.ts`, and the agent past-deals scripts `scripts/import-closed-from-trestle.ts` and `scripts/rebuild-past-deals.js`. Re-check with `git grep ResourceRecordKey` before relying on this list.

---

## 2. mallan.nyc (IDX Consumer — Public Display + Internal CRM + Reporting)

### Role (Confirmed by REBNY 2026-03-27, Michaela Parker mparker@rebny.com)

- mallan.nyc uses IDX Plus feed for: **(1) public website listing display, (2) internal backend dashboard with client management, and (3) reporting**
- mallan.nyc does NOT submit listings to the RLS and is NOT an LMP
- RealPlus is the LMP (listing input to RLS). REBNY does not grant LMP licenses to individual brokers.
- mallan.nyc reads listings via the Cotality IDX Plus Web API (licence Trestle-11371-20) — **IDX-released fields and IDX-eligible inventory only (not full-market search)**
- All client communication (emails, portals, CRM) runs through mallan.nyc directly — client data never passes through RealPlus or third parties
- Agents use RealPlus for full RLS inventory search and listing submission

### Capabilities

| Feature | Description |
|---------|-------------|
| Listing entry | Sale and rental listing forms (Sale Redesign, Rental Redesign; provider fields to be verified against the live Cotality API in their Cotality conversion) |
| Photo management | Upload, sort, manage listing photos |
| Distribution controls | IDX, Syndication, Permissions toggles |
| Status management | Status changes with date tracking |
| Validation | Pre-submission field validation |
| Reporting | Listing performance, DOM, activity logs |

### Contact

- Via Cotality support (trestlesupport@cotality.com)
- For REBNY fee field enablement: contact REBNY RLS Support

---

## 3. StreetEasy

### Connection Method

| Parameter | Value |
|-----------|-------|
| Method | **Direct upload** (NOT via RLS feed) |
| Sales | Free |
| Rentals | $7+/day |
| Auto-syndication | Zillow + Trulia (via StreetEasy ownership) |

### Key Rules

- StreetEasy is NOT part of the RLS syndication pipeline
- Listings must be separately uploaded/managed on StreetEasy
- Must comply with REBNY rules (same content restrictions apply)
- Must comply with FARE Act for rentals

---

## 4. Syndication Portals (via Cotality)

### Active Cotality Opt-In Portals

| Portal | Cost | Status | Notes |
|--------|------|--------|-------|
| openigloo | Free | **Opted IN** | Tenant reviews + listings |
| Samaki.com | Free | **Opted IN** | NYC focused |
| TBI Listings | Free | **Opted IN** | NYC focused |

- The live `SyndicateTo` enum lists the provider's portal values (`data/cotality-enums.live.json`); only 3 portals are active for REBNY
- Principal Broker selects vendors via the Cotality vendor portal
- All 3 are opted IN for Mallan Real Estate

### Syndication Control

- Controlled by `SyndicateTo` field (Gate 4) *(UCBA references as `SyndicateYN`)*
- Default: True (LMPs must default to True)
- Individual listing opt-out available
- All 6 distribution gates must pass before syndication

---

## 5. Direct Data Licensees (Auto from REBNY)

These portals receive data directly from REBNY via license agreement. NOT via broker syndication settings.

| Portal | Cost | Method |
|--------|------|--------|
| Realtor.com | Free | REBNY direct license |
| Redfin | Free | REBNY direct license |
| Homes.com | Free | REBNY direct license |
| RentHop | Free | REBNY direct license |
| RealtyHop | Free | REBNY direct license |
| Compass | Free | REBNY direct license (own data license) |

### Broker Action Required

None — these are automatic via REBNY membership. Listings that pass all distribution gates are automatically included.

---

## 6. IDX License Scope Clarification (REBNY Confirmed 2026-03-27)

### Status: Confirmed — Current IDX Plus License Covers CRM Use

REBNY confirmed (Michaela Parker, mparker@rebny.com, 2026-03-27) that the IDX Plus WebAPI license authorizes:
1. **Public website listing display** (mallan.nyc/search, listing pages)
2. **Internal backend dashboard with client management** (CRM, portals, search alerts)
3. **Reporting features** (market reports, analytics, agent dashboards)

| Parameter | Detail |
|-----------|--------|
| License | IDX Plus - WebAPI (Trestle-11371-20) |
| Scope | Public display + internal CRM + reporting |
| Limitation | IDX-released field set and IDX-eligible inventory only — NOT full-market search |
| Client data | Stays on mallan.nyc — never passes through third parties |
| Contact | rlssupport@rebny.com / 212-616-5270 |

### Direct Data License (Future Option)

A direct data license (like Compass) would upgrade from IDX Plus to full RLS read access through the same Cotality API. This would add PrivateRemarks, ShowingInstructions, and non-IDX-eligible listings to the CRM. Not currently needed for authorized CRM use, but would eliminate the need for RealPlus for agent search.

### Connect NYC (Separate Product)

Connect NYC is a separate REBNY building database product (1M+ buildings). It does NOT replace the Cotality IDX Plus Web API. They are independent services.

---

## 7. IDX Providers (Pre-Licensed by REBNY)

30 IDX providers are pre-licensed for REBNY data display:

blankslate, blueroof360, BoomTown, CINC, Constellation RE, Home ASAP, HomeJunction, IDX (Elm Street), iHomefinder, kvCORE, Leadkit, Lofty, Luxury Presence, MoxiWorks, OLR, propertybase, PropMiX, RE Webmasters, RealGeeks, RealPlus, RealtyMX, Realtyna, RealtyWatch, RESoft, Sierra Interactive, Smarter Agent, The House Club, TREM Group, Xome, Ylopo

---

## 8. VOW Providers (Pre-Licensed by REBNY)

3 VOW providers are pre-licensed:

- Lofty
- OLR
- Zenlist

---

## 9. Data Use Restrictions (All Third Parties)

Per UCBA Art. III and Art. VIII:

| Prohibited | Source |
|------------|--------|
| Bulk export of MLS data | F1 |
| Scraping or automated collection | H9 |
| AI training on MLS data | F1 |
| Redistribution to unlicensed parties | F1 |
| Use in mailing lists | H9 |
| Embedding in vector databases | F1 |
| Public/unsecured API endpoints | Security |

### Required

| Required | Source |
|----------|--------|
| Server-side only access | Security |
| Attribution on all displays | H1, F6 |
| Update timestamps | IDX display practice — source not yet verified (no UCBA 2026 citation) |
| Respect all 6 distribution gates | Gates 1-6 |
| Respect address suppression | H10, InternetAddressDisplayYN |
| Statistical data disclaimer | H8 |

---

## 10. Vendor Security Assessment

### Before Integrating Any Third-Party Service

| Check | Requirement |
|-------|-------------|
| SOC 2 compliance | Verify vendor has SOC 2 Type II |
| Data encryption | TLS 1.2+ in transit, encrypted at rest |
| Access controls | Role-based, principle of least privilege |
| Data retention | Clear retention and disposal policies |
| Breach notification | Contractual obligation to notify |
| SHIELD Act compliance | If handling NY resident data |
| REBNY approval | Must be pre-licensed for RLS data (if displaying listings) |

### Current Vendor Stack

| Vendor | Service | Compliance |
|--------|---------|------------|
| Vercel | Hosting | SOC 2, GDPR |
| Cloudflare R2 | Image storage | SOC 2, ISO 27001 |
| Cotality | RLS data feed (IDX Plus Web API) | REBNY authorized |
| mallan.nyc | IDX Plus: public display + internal CRM + reporting (NOT an LMP — does not submit to RLS). IDX-eligible inventory only, not full-market. | REBNY authorized (confirmed 2026-03-27) |
| PostgreSQL (managed) | Database | Per provider (e.g., Supabase, Neon) |
