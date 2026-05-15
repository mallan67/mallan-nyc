# COMPLIANCE-SURFACES.md — Where Compliance Logic Attaches

> **Maintained by:** Mallan Search Cartographer.
> **Primary skill:** `.claude/skills/rebny-compliance/SKILL.md` (always read first when reasoning about compliance).

## REBNY attribution ("Listing courtesy of [Brokerage]")

Required on every public listing display per UCBA Art. III §2(C).

| Surface | Where | Function |
|---------|-------|----------|
| `/api/listings` response envelope | `app/api/listings/route.ts:444` | `generateAttributionText()` |
| `/api/listings/[id]` response envelope | `app/api/listings/[id]/route.ts` | Same |
| `/api/listings/suggest` | Not surfaced (suggest doesn't render listing data) | n/a |
| `/search` listing cards | `app/components/SearchListingCard.tsx` | reads `_compliance.attribution` |
| `/listing/[id]` page | `app/listing/[id]/page.tsx` | reads `_compliance.attribution` |
| Building page, similar page | Same DTO consumed | |

## IDX/RLS disclaimer

Required on every IDX-sourced display per REBNY checklist + UCBA Art. III §2.

| Surface | Where |
|---------|-------|
| `_compliance.disclaimer` field | `app/api/listings/route.ts:445` |
| `IDXSearchDisclaimer` component | `app/components/IDXDisclaimer.tsx` (rendered on `/search`) |

## Address suppression (`InternetAddressDisplayYN`)

REBNY skill §2.1.1 (provider-gated, fail-OPEN on the writer; fail-CLOSED in the suggest endpoint — DEFECT).

| Surface | Logic |
|---------|-------|
| Trestle mapper writer (DB sync) | `lib/idx/trestle-mapper.ts:834` — `raw.InternetAddressDisplayYN !== false` (fail-open per REBNY pre-filter) |
| DB-first DTO | `lib/idx/db-to-public-dto.ts` `canDisplayAddress()` |
| `/api/listings/suggest` | `lib/compliance/gates.ts` `affirmPermission()` (fail-closed) — **DEFECT** per R-AFFIRM-SUGGEST |
| Public read DTO | `lib/compliance/idx-display-gate.ts` `canDisplayAddress(listing)` |

## §2.05 terminal-status guard (Closed / Cancelled / Expired / Withdrawn → 24h removal)

| Surface | Logic |
|---------|-------|
| Trestle mapper writer | `lib/idx/trestle-mapper.ts` `TERMINAL_STATUSES` set; primary writer guard (PR #112 `df67d915`) |
| Secondary writers (CRM edits, batch endpoints) | `normalizeStandardStatus()` from `lib/idx/trestle-mapper.ts` + guard (PR #113 `7c61fc4f` + `cd91637f`) |
| Cron mirror | `app/api/cron/data-retention/route.ts:79` (daily 03:00 UTC) |

## Agent PII masking (UCBA Art. III §2 + REBNY display rules)

| Surface | What's stripped |
|---------|-----------------|
| Public DTO | `ListAgentEmail`, `ListAgentDirectPhone`, `ListAgentURL`, `BuyerAgentEmail`, all CoListAgent direct contact |
| Suggest endpoint | Only surfaces Mallan-internal agents (queries `prisma.agent` not Trestle Member) |
| Buyer / Tenant portals | DTO sanitizer `sanitizeForPortal(listing, 'buyer'|'tenant')` masks to `{ company }` only |
| Seller / Landlord portals | Full agent info on own listing only |

## FARE Act fee disclosure (NYC LL 119/2024)

| Surface | Where |
|---------|-------|
| Rental listing card | `app/components/SearchListingCard.tsx` (compliance-check confirms FARE wired) |
| Rental listing detail | `app/listing/[id]/page.tsx` (compliance-check confirms FARE wired) |
| Search page card | `app/search/page.tsx` (same compliance-check entry) |

## Distribution gates (6 mandatory — REBNY skill §2.1)

| Gate | Trestle field | Enforced at |
|------|---------------|-------------|
| 1. Owner Opt-Out | `Permission = OwnerOptOut/'Owner Opt-Out'` | `lib/idx/trestle-mapper.ts` writer |
| 2. Participant Only | `Permission = 'Private'` | Same |
| 3. Internet Entire Display | `InternetEntireListingDisplayYN` (fail-OPEN per IDX-Plus pre-filter) | Same |
| 4. Address Display | `InternetAddressDisplayYN` (fail-OPEN at writer; fail-CLOSED in suggest endpoint — DEFECT) | Multiple |
| 5. Terminal Status §2.05 | `StandardStatus` ∈ {Closed, Cancelled, Expired, Withdrawn} | Writer + cron + secondary writers |
| 6. Coming Soon | `StandardStatus = 'ComingSoon'` | Badge-gated, sales only, max 14 days |

## Fair Housing scanner

| Surface | Where |
|---------|-------|
| Client-side input scan | `public/crm/js/compliance/fair-housing.js` (46 patterns) |
| Server-side hard blocks | `lib/compliance/rls-enforcement.ts` `FAIR_HOUSING_HARD_BLOCKS` (13 regex) |

Public search inputs are NOT subject to listing-content Fair Housing scanning (the input is a user's search term, not listing content). But the search results page DOES surface listing content (e.g., PublicRemarks) which IS scanned at write time. No public-facing FH issue identified on search surfaces.

## NY DOS advertising (19 NYCRR §175.25)

Required on every public-facing page:
- Brokerage name: "Mallan Real Estate Inc."
- Office address OR phone

| Surface | Where |
|---------|-------|
| Site footer | global layout |
| Listing detail | included in `_compliance` payload |
| Search results | `IDXSearchDisclaimer` + footer |

## TCPA / CAN-SPAM (`consent_captured_at`)

| Surface | Endpoint |
|---------|----------|
| Contact form | `/api/contact` |
| Inquiry modal | `/api/inquiries` |
| Sign-up | `/api/sign-up` |
| CMA | `/api/cma` |
| Guides | `/api/guides/download` |
| Favorites | `/api/favorites/sync` |
| Search alerts | `/api/search-alerts` |
| Open-house RSVP | `/api/open-houses/rsvp` |

Cartographer is read-only on these — does not test consent capture, just confirms the endpoints exist and `compliance-check` wires `consent_captured_at` for each.

## What the Cartographer must verify each run

1. **REBNY attribution** present on every list/detail response (probe + grep `_compliance.attribution`).
2. **IDX disclaimer** present on every list/detail response.
3. **§2.05 violations** count = 0 (read `npm run ops:health` output).
4. **Address suppression** active — sample one listing with `InternetAddressDisplayYN=false` if any exist and assert masking.
5. **Distribution gates** — sample one tombstoned/owner-opt-out listing and confirm 0 results returned.
6. **PR #104 closed** — `gh pr view 104 --json state`.
7. **media-backfill cron present** — `grep '/api/cron/media-backfill' vercel.json`.

## Cross-links

- Skill: `.claude/skills/rebny-compliance/SKILL.md`
- Routes: `ROUTES.md`
- API: `API-MAP.md`
- Active compliance defects: `KNOWN-REGRESSIONS.md`
