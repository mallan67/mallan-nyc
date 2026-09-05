> **HISTORICAL NOTE (2026-09-05, Search Consolidation Packet 2):** any mention of **RealPlus** in this document describes a former submission tool and is retained as history only. RealPlus has no role in Mallan's application architecture. Cotality/Trestle (`api.cotality.com/trestle`) is the only provider and feed authority; REBNY RLS submission happens outside this system. See `docs/search/checkpoints/2026-09-05-carry-forward-after-validators.md` §5.

# Third-Party & Feed Governance

> **Feed:** REBNY RLS via Trestle (Cotality) | **LMP:** RealPlus (listing input to RLS) | **IDX Display:** Trestle IDX Plus WebAPI (read-only on mallan.nyc)
> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323

---

> ### FIELD AUTHORITY ORDER (ENFORCED — NO EXCEPTIONS)
> 1. **UCBA** governs everything. 2. **REBNY IDX Plus fields (902)** — single source of truth.
> 3. **REBNY overrides RESO/IDX.** 4. **RESO/IDX fills gaps.** 5. **INTERNAL-ONLY otherwise.** 6. **Fail closed = NON-DISPLAY.**

---

## 1. Trestle / Cotality (Primary Feed Provider)

### Connection Details

| Parameter | Value |
|-----------|-------|
| Provider | Cotality (formerly CoreLogic, rebranded Mar 2025) |
| Platform | Trestle |
| Data API | `api.cotality.com/trestle/odata/` |
| Auth endpoint | `api.cotality.com/trestle/oidc/connect/token` |
| Support | trestlesupport@cotality.com |
| Documentation | trestle-documentation.corelogic.com (may migrate) |
| Protocol | RESO Web API (OData) |
| Authentication | OAuth 2.0 (client credentials) |

### API Migration (Deadline: March 31, 2026)

- Old URL (DEPRECATED): `api-trestle.corelogic.com` / `api-prod.corelogic.com`
- New URL (REQUIRED): `api.cotality.com/trestle/`
- **Hard deadline: March 31, 2026** — old URLs will cease functioning after this date
- Media/photo URLs: Old URLs work through 2026 warranty period, but new development must use `api.cotality.com/trestle/media/...`
- **Extra quota boost** available on new endpoint — contact Cotality to enable
- Authentication: Same OAuth2 flow — no credential changes required
- Store API base URL as environment variable (`TRESTLE_API_URL=https://api.cotality.com/trestle`) — never hardcode
- **v3.3 enforcement:** CI deployment fails if `api-trestle.corelogic.com` or `api-prod.corelogic.com` detected in codebase. Go-Live gate #21 requires 0 deprecated URLs + successful live API call. See Master Audit Report Section AR.

### ⚠️ TRESTLE MEDIA API RULES — VENDOR-CONFIRMED (2026-04-07)

> **Source:** Direct feedback from CoreLogic/Trestle (Cotality) support.
> **Classification:** MANDATORY — these rules govern all Media resource queries in the codebase.

| # | Rule | Rationale | Enforcement |
|---|------|-----------|-------------|
| 1 | **Use `ResourceRecordKey` (or `ResourceRecordKeyNumeric`), NOT `ResourceRecordID`** | `ResourceRecordID` can be duplicated across MLOs (Multiple Listing Organizations). `ResourceRecordKey`/`Numeric` are always unique. Using `ResourceRecordID` risks returning wrong media for a listing. | All batch Media OData queries filter by `ResourceRecordKey`. DB column `mls_id` (Listing model) stores `ListingKey` = `ResourceRecordKey`. Fallback to `ResourceRecordID` only when `mls_id` is null. |
| 2 | **`Media/All` endpoint is DEPRECATED** | Trestle is removing `Media/All`. | Query `/odata/Media` with explicit `$filter`. No `Media/All` usage exists in codebase (verified). |
| 3 | **Use `Media.ModificationTimestamp` for individual media changes** | Source of truth for when a specific photo/floorplan was added, modified, or removed. | Included in `$expand=Media($select=...,ModificationTimestamp,ResourceRecordKey)` and batch `$select`. |
| 4 | **Use `Property.PhotosChangeTimestamp` as media change trigger** | High-level signal on the Property resource — modified when ANY media for that listing changes. Cheaper than querying Media for every listing. | Included in `CARD_SELECT_FIELDS` (`card-fields.ts`). Available for backfill optimization. |

**Field mapping reference:**
- Property.`ListingKey` = Media.`ResourceRecordKey` (string, always unique)
- Property.`ListingKeyNumeric` = Media.`ResourceRecordKeyNumeric` (numeric, always unique)
- Property.`ListingId` = Media.`ResourceRecordID` (string, **NOT guaranteed unique across MLOs**)

**Files enforcing these rules (17 total — deep-audited 2026-04-07):**
- **Production (7):** `lib/idx/sync.ts`, `lib/idx/fetch.ts`, `lib/idx/card-fields.ts`, `app/api/media/batch/route.ts`, `app/api/agents/[slug]/listings/route.ts`, `app/api/idx/search/route.ts`, `scripts/import-closed-from-trestle.ts`
- **Utility (3):** `scripts/rebuild-past-deals.js`, `scripts/fetch-real-photos.js`, `scripts/trestle-audit.js`
- **Test/diagnostic (7):** `scripts/test-media-coverage.js`, `scripts/test-media-fix.js`, `scripts/test-photos.js`, `scripts/test-media-types.js`, `scripts/time-pipeline.js`, `scripts/test-media-public.js`, `scripts/test-media-cats.js`

---

### Field/value renames in the live feed

These field/value names are what the live `api.cotality.com/trestle` feed returns:

| Change | Detail |
|--------|--------|
| PropertySubType rename | "Quadraplex" → "Four Or More Units" |
| Interior features relocated | "Intercom" → OtherEquipment, "Office" → RoomType |
| Lookup corrections | "Lightning" → "Lighting", "Cathedral Ceilings" → "Cathedral Ceiling(s)" |
| New fields | CoBuyerAgent*, CoListAgent*, BackOnMarketTimestamp, ExpirationDate |
| CurrentPrice | Separated from ListPrice (new field) |

---

## 2. mallan.nyc (IDX Consumer — Public Display + Internal CRM + Reporting)

### Role (Confirmed by REBNY 2026-03-27, Michaela Parker mparker@rebny.com)

- mallan.nyc uses IDX Plus feed for: **(1) public website listing display, (2) internal backend dashboard with client management, and (3) reporting**
- mallan.nyc does NOT submit listings to the RLS and is NOT an LMP
- RealPlus is the LMP (listing input to RLS). REBNY does not grant LMP licenses to individual brokers.
- mallan.nyc reads listings via Trestle IDX Plus WebAPI (Trestle-11371-20) — **IDX-released fields and IDX-eligible inventory only (not full-market search)**
- All client communication (emails, portals, CRM) runs through mallan.nyc directly — client data never passes through RealPlus or third parties
- Agents use RealPlus for full RLS inventory search and listing submission

### Capabilities

| Feature | Description |
|---------|-------------|
| Listing entry | Full form with all 902 IDX Plus fields |
| Photo management | Upload, sort, manage listing photos |
| Distribution controls | IDX, Syndication, Permissions toggles |
| Status management | Status changes with date tracking |
| Validation | Pre-submission field validation |
| Reporting | Listing performance, DOM, activity logs |

### Contact

- Via Trestle/Cotality support (trestlesupport@cotality.com)
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

## 4. Syndication Portals (via Trestle)

### Active Trestle Opt-In Portals

| Portal | Cost | Status | Notes |
|--------|------|--------|-------|
| openigloo | Free | **Opted IN** | Tenant reviews + listings |
| Samaki.com | Free | **Opted IN** | NYC focused |
| TBI Listings | Free | **Opted IN** | NYC focused |

- 19 SyndicateTo values exist in Trestle, but only 3 are active for REBNY
- Principal Broker selects vendors via Trestle portal
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

A direct data license (like Compass) would upgrade from IDX Plus to full RLS read access through the same Trestle API. This would add PrivateRemarks, ShowingInstructions, and non-IDX-eligible listings to the CRM. Not currently needed for authorized CRM use, but would eliminate the need for RealPlus for agent search.

### Connect NYC (Separate Product)

Connect NYC is a separate REBNY building database product (1M+ buildings). It does NOT replace the Trestle IDX Plus WebAPI. They are independent services.

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
| Update timestamps | RESO IDX Rules |
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
| Cotality/Trestle | RLS data feed | RESO certified, REBNY authorized |
| mallan.nyc | IDX Plus: public display + internal CRM + reporting (NOT an LMP — does not submit to RLS). IDX-eligible inventory only, not full-market. | REBNY authorized (confirmed 2026-03-27) |
| PostgreSQL (managed) | Database | Per provider (e.g., Supabase, Neon) |
