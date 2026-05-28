# Agent Routing Mandate — Mallan NYC

**Created:** 2026-05-28
**Status:** Actionable instruction for Codex, Claude, Sentinel, and helper agents

This file defines which agent owns which work. Do not ask every agent to audit everything. Pick the narrowest owner, inspect the exact files, run the exact proof, and stop at the boundary.

## Universal rule

Every agent must report:

1. files inspected
2. files changed
3. commands/tests run
4. evidence produced
5. what was not touched
6. remaining blocker

No generic advice. No unproven “fixed.”

---

## Sentinel-G

Owner for: Trestle/Cotality metadata, IDX Plus fields, ListingId/ListingKey/SourceSystemKey mapping, attribution, public DTO privacy, display gates, canonical listing URL consistency.

Must run when available:

```bash
npx tsx tools/sentinel-g/run-sentinel-g.ts
```

Must read:

- `docs/agents/SENTINEL-G-MANDATE-2026-05-28.md`
- `lib/idx/fetch.ts`
- `lib/idx/trestle-mapper.ts`
- `lib/idx/public-dto.ts`
- `lib/idx/db-to-public-dto.ts`
- `app/api/listings/suggest/route.ts`

Must not touch: CRM UI, seller forms, Neon, Vercel aliases, schema migrations, media UI.

---

## Public Search Agent

Owner for: public `/search`, homepage search, public autocomplete, public listing suggestions, search cards, canonical public listing URL display.

Must inspect:

- `app/search/page.tsx`
- `app/components/HeroSearch.tsx`
- `app/components/SearchAutocomplete.tsx`
- `lib/hooks/useListings.ts`
- `app/api/listings/route.ts`
- `app/api/listings/suggest/route.ts`
- `lib/search/natural-language-parser.ts`
- `lib/search/nyc-dictionary.ts`
- `lib/listing-slug.ts`

Must prove:

- homepage and search page interpret the same query the same way
- `SL-0004` does not appear as the public copy URL when canonical address slug exists
- public suggestions do not expose seller/contact/private data
- Mallan exclusives are suggested from DB before external feed fallback

Must not touch: CRM seller PII, CRM search shell, seller workflow internals.

---

## CRM Search Agent

Owner for: authenticated CRM search across sellers, landlords, listings, addresses, emails, phones, SL/RL IDs, linked seller/listing records.

Must inspect:

- `public/crm/js/search/search-engine.js`
- `public/crm/js/core/api-client.js`
- `app/api/idx/search/route.ts`
- `app/api/crm/listings/route.ts`
- `app/api/crm/sales/sellers/route.ts`
- `app/api/crm/clients/route.ts`
- `app/api/crm/clients/[id]/route.ts`
- `lib/search/crm-idx-filter.ts`
- `lib/search/crm-idx-mapper.ts`

Must prove:

- search is server-backed and not limited to first 200 loaded sellers
- seller can be found by name/email/phone/address/active listing ID
- listing can be found by SL/RL ID/address/unit/linked seller/status
- non-broker cannot see another agent’s private records

Must not touch: public search URLs, public DTO privacy, Trestle metadata mapping.

---

## Seller and Exclusive Workflow Agent

Owner for: create seller, verify owner/signatory, create exclusive, link seller to listing, edit listing, canonical public URL.

Must inspect:

- `public/crm/js/dashboard/panels/sales-crm/index.js`
- `public/crm/SALE-FORM-REDESIGN.html`
- `app/api/crm/sales/sellers/route.ts`
- `app/api/crm/listings/route.ts`
- `app/api/crm/listings/[id]/route.ts`
- `app/api/crm/clients/route.ts`
- `app/api/crm/clients/[id]/route.ts`
- `lib/api/schemas/client.ts`
- `lib/db/clients.ts`
- `prisma/schema.prisma`

Must prove:

- New Seller cannot create fake incomplete records
- seller required fields match backend validation
- listing saves `owner_client_id`
- seller saves `active_sale_listing_id`
- sale form can load seller context
- seller/attorney/signatory data stays CRM-only

Must not touch: Trestle mapping, public attribution rules, Vercel/Neon.

---

## Compliance Agent

Owner for: REBNY, RLS, UCBA, NY DOS, FARE Act, Fair Housing, TCPA, NY SHIELD.

Must run when relevant:

```bash
npm run compliance-check
npm run ucba:audit
npm run rls:validate
npm run idx:validate
```

Must inspect:

- `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`
- `data/UCBA-2026-Requirements.md`
- `.claude/skills/rebny-compliance/SKILL.md`
- `lib/compliance/**`
- `lib/idx/public-dto.ts`
- `app/components/IDXDisclaimer.tsx`
- `app/components/Footer.tsx`
- `app/listing/[id]/page.tsx`

Must not invent rules from memory.

---

## Media Agent

Owner for: photo-first ordering, floorplan/video classification, Trestle media identity, duplicate media, public/CRM image consistency.

Must inspect:

- `lib/media/listing-media-resolver.ts`
- `app/components/IDXImage.tsx`
- `app/components/SearchListingCard.tsx`
- `app/components/FeaturedListings.tsx`
- `app/api/media/batch/route.ts`
- `app/api/media/proxy/route.ts`
- `public/crm/js/render/photo-loader.js`
- `public/crm/js/render/render-gallery.js`

Must prove:

- `ResourceRecordKey` is used, not `ResourceRecordID`
- photo appears before floorplan/video
- duplicate upload is handled
- no placeholder appears when valid photo exists

Must not touch: seller ownership, public search routing, Trestle metadata registry.

---

## Proof Agent

Owner for: rejecting unproven claims.

Must inspect:

- changed files
- tests
- PR diff
- workflow/check status
- preview/live evidence when relevant

Must output:

- PASS, YELLOW, or FAIL
- exact missing proof
- exact next command

Must not write feature code unless specifically assigned.
