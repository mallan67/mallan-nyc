# RLS Feed, Syndication & Distribution Research

> **Researched:** 2026-02-08
> **Brokerage:** Mallan Real Estate Inc.
> **LMP:** external to mallan.nyc (listing input to RLS — REBNY does not grant LMP licenses to individual brokers)
> **IDX Display:** Trestle IDX Plus WebAPI (Trestle-11371-20) — public display + internal CRM + reporting on mallan.nyc (REBNY confirmed 2026-03-27). IDX-eligible inventory only, not full-market search.
> **RLS Backend:** CoreLogic / Trestle (migrated Feb 2025 from Perchwell)

---

## 1. RLS Feed Status

The REBNY RLS is **active and unchanged** in name. It was NOT renamed, discontinued, or replaced.

| Metric | Value |
|--------|-------|
| Active Listings | 23,000+ |
| Total Listing Value | $45 billion |
| Participating Firms | 570+ |
| Monthly Views | ~90 million |
| Technology Providers | 100+ |

### Backend Migration (Feb 2025)
- **Old backend:** Perchwell (used ~5 years)
- **New backend:** CoreLogic / Trestle
- Migration completed Feb 11, 2025
- RLS name, rules, and feed types all stayed the same

---

## 2. Feed Types

| Feed | Purpose | Public? | Requires Login? |
|------|---------|---------|-----------------|
| **RLS** | Core REBNY listing database for Authorized Participants | No | Yes (Participant credentials) |
| **IDX** | Reciprocal display on other brokers' websites | Yes | No |
| **VOW** | Consumer-facing with extra data | Yes | Yes (registration required) |
| **Syndication** | Distribution to third-party portals via Trestle | Yes | No |

---

## 3. Trestle IDX/VOW/Internet Display Fields

### IDX Fields
| Field | Type | Default | Rule |
|-------|------|---------|------|
| `IDXEntireListingDisplayYN` | Boolean | **True** | LMPs MUST default to True. Listing sent to IDX only if True AND `ListOfficeIDXParticipationYN` is True. |
| `ListOfficeIDXParticipationYN` | Boolean | — | System-generated from REBNY membership directory. Not editable. |

### Internet Display Fields
| Field | Type | Default | Rule |
|-------|------|---------|------|
| `InternetEntireListingDisplayYN` | Boolean | Yes | Sale listings with Permissions=Null CANNOT set to False. When False, auto-sharing MUST be disabled for non-exclusive agents. |
| `InternetAddressDisplayYN` | Boolean | **Yes** | Seller controls address display on Internet. |
| `InternetAutomatedValuationDisplayYN` | Boolean | **Yes** | Seller controls AVM display. |
| `InternetConsumerCommentYN` | Boolean | **Yes** | Seller controls comments/blogs. |

### Syndication Fields
| Field | Type | Default | Rule |
|-------|------|---------|------|
| `SyndicateYN` | Boolean | **True** | LMPs MUST default to True. Master toggle for syndication. |
| `SyndicateTo` | Multi-value Enum | — | Specifies which portals receive the listing. |

### Permissions Field
| Value | Description |
|-------|-------------|
| **Private** | Co-broke only via RLS. Authorized Participants only, no public. |
| **OwnerOptOut** | Not shared on RLS or any public dissemination. |

**Rules:**
- Private and OwnerOptOut CANNOT be selected together
- If originally Private or null, CANNOT be changed to OwnerOptOut

### IDX Display Logic
A listing appears on IDX if ALL true:
1. `IDXEntireListingDisplayYN = True`
2. `ListOfficeIDXParticipationYN = True`
3. `InternetEntireListingDisplayYN = True`
4. `Permissions` is not Private or OwnerOptOut

---

## 4. SyndicateTo Portal Values (Trestle Data Dictionary)

These are Trestle-wide values. Only a subset applies to REBNY RLS.

| # | Portal | Field Value | Bit Value | NYC Relevant? |
|---|--------|-------------|-----------|---------------|
| 1 | Apartments.com | Apartmentscom | 1 | Yes (rentals) |
| 2 | Austin Home Search | Austinhomesearchcom | 2 | No |
| 3 | Broker Reciprocity | BrokerReciprocity | 4 | Yes |
| 4 | Crexi | Crexi | 8 | No (commercial) |
| 5 | HAR.com | Harcom | 16 | No (Houston) |
| 6 | Homes.com (CoStar) | Homescom | 32 | Yes |
| 7 | Homesnap | Homesnap | 64 | Yes |
| 8 | IDX Sites | IdxSites | 128 | Yes |
| 9 | ListHub | Listhub | 256 | Yes |
| 10 | Naples Area | Naplesareacom | 512 | No |
| 11 | None | None | 1024 | — |
| 12 | Realtor.com | Realtorcom | 2048 | Yes |
| 13 | Rental Beast | RentalBeast | 4096 | Yes (rentals) |
| 14 | RPR (Realtors Property Resource) | Rpr | 8192 | Yes (NAR members) |
| 15 | State 27 Homes | State27homescom | 16384 | No |
| 16 | Syndication Allowed | SyndicationAllowed | 32768 | — |
| 17 | Texas Real Estate | Texasrealestatecom | 65536 | No |
| 18 | Zillow Group | ZillowGroup | 131072 | Yes |
| 19 | Zillow & Trulia | ZillowTrulia | 262144 | Yes |

**Note:** RPX does NOT exist in Trestle. RPR (Realtors Property Resource) is the closest match.

---

## 5. Actual REBNY RLS Trestle Syndication (Your Dashboard)

Only **3 opt-in portals** available in Trestle for REBNY RLS:

| Portal | Type | Feed | Status |
|--------|------|------|--------|
| **openigloo** | Portal/Publisher | IDX Plus - WebAPI | Opted IN |
| **Samaki.com** | Portal/Publisher | IDX Plus - WebAPI | Opted IN |
| **TBI Listings** | Portal/Publisher | IDX Plus - WebAPI | Opted IN |

The 19 SyndicateTo values in the data dictionary are Trestle-wide; REBNY only has these 3 approved.

---

## 6. How Listings Reach Major Consumer Sites

Major consumer portals have their **own direct data license agreements** with REBNY — they are NOT in the pre-licensed provider program or Trestle syndication dashboard.

### Listing Flow
```
REBNY RLS (Cotality)  — inbound only; mallan.nyc has no submission path
                                    ↓
              ┌─────────────────────┼──────────────────────┐
              ↓                     ↓                      ↓
        Direct Data Licensees    Trestle Opt-In        StreetEasy
        (auto from RLS)         (your 3 toggles)      (direct upload)
              ↓                     ↓                      ↓
        Realtor.com             openigloo              Zillow/Trulia
        Redfin                  Samaki.com             (auto from SE)
        Homes.com/Citysnap      TBI Listings
        RentHop

mallan.nyc (IDX Plus) ← Trestle IDX API ← REBNY RLS
  ↓
Public search + display (no write access to RLS)
Internal CRM dashboard + client management + reporting
All client emails/portals/CRM from mallan.nyc directly
(IDX-eligible inventory only — not full-market search)
```

### IDX = True is the Gate
Your `IDXEntireListingDisplayYN = True` opt-in is what allows all licensed partners to display your listings. Without it, none of the major sites would show them.

---

## 7. Syndication Cost Summary

| Portal | Sales | Rentals | How |
|--------|-------|---------|-----|
| **StreetEasy** | FREE | **$7/day** (Basic), $10 (Plus), $22 (Premium) | Direct upload (NOT via RLS) |
| **Zillow / Trulia** | FREE | FREE | Auto from StreetEasy (Zillow owns SE) |
| **Realtor.com** | FREE | FREE | Direct data license from REBNY/Trestle |
| **Redfin** | FREE | FREE | Direct data license from REBNY/Trestle |
| **Homes.com** | FREE | FREE | Direct data license from REBNY/Trestle (built Citysnap w/ REBNY) |
| **RentHop** | N/A | FREE | Direct data license from REBNY/Trestle |
| **ListHub** | FREE (Basic) / $10.75/mo (Pro) | Same | Via Trestle syndication |
| **openigloo** | N/A | FREE | Trestle opt-in toggle |
| **Samaki.com** | FREE | FREE | Trestle opt-in toggle |
| **TBI Listings** | FREE | FREE | Trestle opt-in toggle |

**Only paid syndication: StreetEasy rentals ($7+/day)**

---

## 8. REBNY RLS Pre-Licensed Providers (Complete List)

### Direct Network Portal (3)
1. openigloo
2. Samaki.com
3. TBI Listings

### VOW (3)
1. Lofty
2. OLR (Online Residential)
3. Zenlist

### LMP (8)
1. BrokersNYC
2. Leadkit
3. Lofty
4. OLR (Online Residential)
5. Perchwell
6. RealtyMX
7. RESoft

> **Abridged:** one REBNY-listed provider — a retired listing-entry platform no
> longer part of the Mallan architecture — is intentionally not enumerated here.
> REBNY's own count in the heading is unchanged and is not disputed by the omission.

### IDX (30)
1. blankslate.
2. blueroof360
3. BoomTown!
4. CINC
5. Constellation Real Estate Group
6. Home ASAP
7. HomeJunction
8. IDX (Elm Street Technology)
9. iHomefinder
10. kvCORE Platform
11. Leadkit
12. Lofty
13. Luxury Presence
14. MoxiWorks
15. OLR (Online Residential)
16. propertybase
17. PropMiX
18. Real Estate Webmasters
19. RealGeeks
20. RealtyMX
21. Realtyna
22. RealtyWatch Solutions
23. RESoft
24. Sierra Interactive
25. Smarter Agent Mobile
26. The House Club
27. TREM Group
28. Xome
29. Ylopo

> **Abridged:** one REBNY-listed provider — a retired listing-entry platform no
> longer part of the Mallan architecture — is intentionally not enumerated here.
> REBNY's own count in the heading is unchanged and is not disputed by the omission.

### Product (10)
1. BoldTrail
2. brokerloop
3. Core Present
4. Espresso Agent
5. Haystack
6. LiveBy
7. Nancy Packes Data Services
8. PerryStory
9. UrbanDigs
10. Vulcan7

### NOT on Pre-Licensed Lists (have own data licenses)
- Realtor.com
- Redfin
- Homes.com / Citysnap
- Zillow / StreetEasy
- RentHop
- RealtyHop
- Compass (built own platform)

---

## 9. Direct Data License Path (mallan.nyc)

To pull RLS data directly into mallan.nyc (like Compass):

| Step | What | How |
|------|------|-----|
| 1 | Direct Data License Application | "Member Direct Data License Feed Application" on REBNY site |
| 2 | Data License Agreement | Signed via Trestle — Principal Broker signs |
| 3 | Trestle API Access | CoreLogic provides API credentials |
| 4 | Compliance | Site must follow all REBNY RLS display rules |

### Two Feeds Needed
| Feed | For | Login Required? |
|------|-----|----------------|
| **IDX** | Public listing search on mallan.nyc | No |
| **VOW** | Client portal (buyer/seller/renter dashboards) | Yes |

### Contact
- **Email:** rlssupport@rebny.com
- **Phone:** 212-616-5270

---

## 10. StreetEasy-Specific Notes

- Zillow acquired StreetEasy in 2013 for $50M
- StreetEasy **refused** the REBNY RLS feed
- Sales listings on StreetEasy sync to Zillow/Trulia within 24hrs (auto)
- Rental listings: only sale listings syndicate to other Zillow sites
- StreetEasy Experts program: no upfront cost, referral fee on closed deals
- Listing description cannot contain self-promotional language (blocks Zillow syndication)
- Zillow deploying new listing standards on StreetEasy effective June 2025
