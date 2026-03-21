# Third-Party & Feed Governance

> **Feed:** REBNY RLS via Trestle (Cotality) | **LMP:** Direct (mallan.nyc)
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

### Data Dictionary

- **RESO DD 2.0** certified (April 15, 2025) — **NOW LIVE** on Trestle
- Cotality achieved RESO DD 2.0 vendor certification
- DD 1.7 certifications downgraded to "Certified Legacy"

### Key DD 2.0 Changes

| Change | Detail |
|--------|--------|
| PropertySubType rename | "Quadraplex" → "Four Or More Units" |
| Interior features relocated | "Intercom" → OtherEquipment, "Office" → RoomType |
| Lookup corrections | "Lightning" → "Lighting", "Cathedral Ceilings" → "Cathedral Ceiling(s)" |
| New fields | CoBuyerAgent*, CoListAgent*, BackOnMarketTimestamp, ExpirationDate |
| CurrentPrice | Separated from ListPrice (new field) |

---

## 2. mallan.nyc (LMP — Direct via Trestle Add/Edit API)

### Role

- mallan.nyc serves as its own listing management platform
- Agents enter/edit listings via CRM forms, submitted directly to RLS via Trestle Add/Edit API
- Manages distribution settings, status changes, photos

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

## 6. Direct Data License for mallan.nyc

### Status: Applying

| Parameter | Detail |
|-----------|--------|
| Purpose | Pull RLS data into mallan.nyc for IDX + VOW display |
| Contact | rlssupport@rebny.com / 212-616-5270 |
| Need | Both IDX feed (public search) and VOW feed (client portal) |
| Example | Like Compass, which has its own direct data license |

### Requirements for Direct License

- REBNY RBD membership
- Compliance with all UCBA/IDX rules
- Attribution on all displayed listings
- Server-side only data access
- No redistribution, scraping, or AI training
- Regular compliance audits

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
| mallan.nyc (Direct) | LMP via Trestle Add/Edit API | REBNY authorized |
| PostgreSQL (managed) | Database | Per provider (e.g., Supabase, Neon) |
