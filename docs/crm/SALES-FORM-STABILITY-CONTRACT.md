> **HISTORICAL NOTE (2026-09-05, Search Consolidation Packet 2):** any mention of **RealPlus** in this document describes a former submission tool and is retained as history only. RealPlus has no role in Mallan's application architecture. Cotality/Trestle (`api.cotality.com/trestle`) is the only provider and feed authority; REBNY RLS submission happens outside this system. See `docs/search/checkpoints/2026-09-05-carry-forward-after-validators.md` §5.

# Sales Form Stability Contract

Last updated: 2026-05-28

This file is mandatory reading before changing the Mallan sales listing form, sales save/load logic, listing URL logic, media upload logic, or public listing display behavior.

This document intentionally uses placeholders. Do not put real addresses, real unit numbers, real listing IDs, or one-off listing examples into this contract. Real examples get copied by agents and developers as if they are defaults. This contract must define patterns, not property-specific values.

The goal is simple:

```text
One sales form.
One save/load contract.
One status lifecycle.
One canonical public URL.
No browser draft competing with the database.
No autosave overwriting saved data.
No hidden validation field disagreeing with the visible UI.
```

## Production source of truth

The production sales form is:

```text
public/crm/SALE-FORM-REDESIGN.html
```

Clean CRM route:

```text
/crm/sale-listing
```

The read-only sales viewer is:

```text
public/crm/SALE-FORM-WITH-TOOLS.html
/crm/sale-view
```

Do not create a second sales form. Do not fork the form. Do not patch a copied HTML file. All production sales form behavior must be fixed at the actual production file.

## Core files involved

Any sales form work usually touches one or more of these files:

```text
public/crm/SALE-FORM-REDESIGN.html
public/crm/js/dashboard/panels.js
public/crm/js/core/api-client.js
app/api/crm/listings/route.ts
app/api/crm/listings/[id]/route.ts
app/api/crm/listings/[id]/status/route.ts
app/api/crm/listings/[id]/media/upload/route.ts
app/api/crm/listings/[id]/photos/route.ts
app/api/crm/listings/[id]/media-order/route.ts
lib/address/nyc-address-normalizer.ts
lib/crm/listing-urls.ts
lib/crm/status-mapping.ts
lib/listing-canonical-url.ts
lib/listing-slug.ts
app/listing/[...slug]/page.tsx
lib/idx/db-to-public-dto.ts
lib/search/public-listing-db.ts
app/components/FeaturedListings.tsx
app/components/SearchListingCard.tsx
```

If one of these files is touched, the rules below apply.

---

# 1. Acceptable vs not acceptable

## Acceptable

```text
- Edit existing sales listing by DB id/listing id and PATCH only.
- Save Draft creates or updates a Draft DB row.
- Submit/Publish validates, saves, transitions, verifies final status, then returns URL.
- Autosave is disabled until edit-load populate is fully complete.
- Browser localStorage is fallback only for unsaved new listings.
- Public URL is address-first and canonical.
- ID-only URLs redirect to canonical when address is displayable.
- Internal workflow status is stored separately from canonical public/server status.
- CRM form keys are saved and reloaded before falling back to canonical RESO keys.
- Media dedupe exists on the server, not only in the browser.
```

## Not acceptable

```text
- Creating another sales form.
- Fixing a copy of the form instead of SALE-FORM-REDESIGN.html.
- Edit mode POSTing a duplicate listing.
- Autosave running before saved DB data finishes loading.
- Browser draft overriding DB listing data.
- Visible agent filled while hidden validation agent field is empty.
- Loading form controls from lossy RESO fields when CRM raw keys exist.
- Returning success when status transition failed.
- Returning /listing/{listing-id} as the public RealPlus URL for address-displayable listings.
- Creating multiple public URLs for one listing.
- Silently failing media order persistence.
- Shipping field-specific patches without adding/adjusting tests.
```

---

# 2. Sales lifecycle contract

## New sales listing

```text
/crm/sale-listing opens a new unsaved form.
No DB id exists.
Autosave may write localStorage fallback after initialization.
Save Draft must create a DB Draft row.
```

## Save Draft

Required behavior:

```text
New listing: POST /api/crm/listings
Existing listing: PATCH /api/crm/listings/:id
Canonical status: Draft
Must not publish.
Must not create duplicate DB rows.
Must return id/listing_id/status.
Must clear mallan_draft_sale after DB save succeeds.
```

If Save Draft fails:

```text
- Show the real error.
- Do not trigger another server autosave in edit mode.
- Only use localStorage fallback when the listing has not yet been saved to DB.
```

## Edit Draft / Edit Active

Required behavior:

```text
Open existing sales listing by ?id=DB_ID or stable listing id.
Load DB data first.
Populate the form completely.
Only then enable autosave.
Existing listing must PATCH only.
Existing listing must never POST a duplicate.
Existing DB listing must not create a browser draft row.
```

## Submit / Publish

Required behavior:

```text
Validate fields.
Validate agent.
Validate display gates.
Save latest payload.
Transition to canonical status.
Verify final status.
Return publicUrl/realPlusUrl only when eligible.
```

Success means the final status transition actually succeeded.

If publish fails, the UI must say:

```text
Saved as Draft. Publish failed: [reason]
```

It must not say the listing is Active/public if the final transition did not succeed.

---

# 3. Autosave contract

Autosave was a root cause of saved values being overwritten by defaults.

Required flags:

```js
window._saleAutoSaveReady = false;
window._salePopulateInProgress = false;
```

Autosave entry points must return early when:

```js
!window._saleAutoSaveReady || window._salePopulateInProgress
```

Edit mode sequence must be:

```text
1. Set _salePopulateInProgress = true.
2. Fetch listing.
3. Populate fields.
4. Populate/confirm hidden agent fields.
5. Apply sales field rules.
6. Update derived address fields.
7. Clear any queued autosave timer.
8. Set _salePopulateInProgress = false.
9. Set _saleAutoSaveReady = true.
```

New listing mode may enable autosave only after initialization has completed.

Server autosave must use the internal edit id first:

```js
const updateId = _saleEditDbId || _saleEditListingId || visibleListingId;
```

Do not use the visible listing id display as the primary source of truth.

---

# 4. Field save/load contract

The sales form has two naming systems:

```text
CRM form keys: salePropertyType, saleStatus, saleHeatingYN, etc.
Canonical RESO/API keys: PropertyType, PropertySubType, CommonInterest, StandardStatus, etc.
```

Rules:

```text
- Save both CRM form keys and canonical RESO/API keys when needed.
- On edit-load, restore CRM form key first.
- Fall back to canonical RESO key only if the CRM form key is missing.
- Use valueMap when canonical values do not match form control values.
```

Pattern example using placeholders:

```text
crmFormPropertyType = [broker-facing value]
PropertyType = [RESO major type]
PropertySubType = [RESO subtype]
CommonInterest = [RESO ownership/common-interest value]
```

Do not restore broker-facing radios/selects from lossy canonical values when a CRM raw key exists. For example, multiple broker-facing ownership/property choices may map to the same RESO subtype; restoring from the subtype alone can select the wrong radio.

Every visible control must eventually have a field-map entry that defines:

```text
form id/name
CRM raw key
canonical RESO key
save transform
load transform
fallback key
valueMap, if needed
validation rule
```

If a field is fixed manually, add it to the map or document why it is special.

---

# 5. Address contract

Address fields must preserve direction, suffix, unit, city, state, and ZIP separately.

Use placeholders only:

```text
StreetNumber = [street number]
StreetDirPrefix = [direction prefix, if present]
StreetName = [street name only]
StreetSuffix = [street suffix]
UnitNumber = [unit, if present]
City = [city]
StateOrProvince = [state]
PostalCode = [ZIP]
```

The form must not collapse direction/suffix/unit into the wrong field. In particular, do not store an entire street line inside `StreetName` when separate address atoms are available.

Visible address fallback must include direction:

```js
[StreetNumber, StreetDirPrefix, StreetName, StreetSuffix]
```

not:

```js
[StreetNumber, StreetName, StreetSuffix]
```

Any address-based lookup must validate:

```text
StreetNumber
StreetDirPrefix, when provided
StreetName
UnitNumber, when provided
PostalCode
```

Do not accept a candidate merely because it is the only listing with the same StreetNumber and ZIP. Unit/direction must still be checked when present in the slug.

---

# 6. Public URL / RealPlus URL contract

Address-displayable listings use one canonical public route:

```text
/listing/{address-slug}/{listing-id-lowercase}
```

Placeholder example only:

```text
/listing/{address-slug}/{listing-id}
```

Rules:

```text
- realPlusUrl must use the canonical route only.
- Cards, FeaturedListings, copy buttons, sitemap, and share buttons must use the canonical route only.
- /listing/{listing-id} must not be advertised as the public URL for address-displayable listings.
- /listing/{listing-id} may resolve only by redirecting to canonical when address is displayable.
- Legacy hybrid /listing/{address-slug}-{listing-id} must redirect to /listing/{address-slug}/{listing-id}.
- If address display is legally suppressed, do not generate an address URL.
```

Use one helper everywhere:

```ts
buildCanonicalListingPath({ slug, id })
```

Metadata must also use this helper. Do not build canonical metadata with `/listing/${listing.slug}` if the runtime route uses `/listing/{slug}/{id}`.

---

# 7. Status contract

There are two layers:

```text
CRM workflow status: broker-facing pipeline label.
Canonical server/public status: controls public display, IDX, Featured, Exclusives, RealPlus URL.
```

Rules:

```text
- Do not send unsupported CRM workflow statuses raw to the server.
- Map workflow status to canonical status before API calls.
- Store workflow status separately in raw_data or a dedicated workflow field.
- On edit-load, restore workflow status first, then canonical fallback.
- Public display is based only on canonical status and display gates.
```

Mapping examples may be documented in `lib/crm/status-mapping.ts`, but this contract should not list one-off property examples.

Do not map accepted-offer/pre-contract statuses to non-public status unless that is an explicit business decision.

---

# 8. Agent validation contract

Visible agent UI and hidden validation fields must agree.

Required behavior:

```text
New listing: populate listing agent from logged-in agent.
Edit listing: preserve saved listing agent if present.
Edit listing with missing hidden agent fields: fallback to logged-in agent only after confirming no saved agent exists.
```

Required fields:

```text
ListAgentMlsId
ListAgentFullName
ListAgentEmail
ListAgentDirectPhone
ListOfficeName
ListOfficeMlsId/ListOfficeKey
```

Do not allow this state:

```text
Visible agent input shows a name.
Hidden saleListingAgent is empty.
Submit fails validation.
```

Autosave must not enable until agent fallback is complete or a clear warning is shown.

---

# 9. Browser draft contract

Browser draft is fallback only for unsaved new listings.

Rules:

```text
- localStorage key mallan_draft_sale is only for unsaved browser fallback.
- Once DB draft exists, clear mallan_draft_sale.
- Existing DB listing must not create or restore a browser draft.
- Dashboard must suppress stale browser draft by listing id OR address+unit.
- Do not clear drafts by building-only address without unit.
```

Never show one DB Active listing and one stale DRAFT (browser) row for the same address/unit.

---

# 10. Media contract

Rules:

```text
- Existing server media and pending uploads must be distinct.
- Existing server media must not be re-uploaded.
- Client duplicate detection by filename+size is helpful but not enough.
- Server must compute contentHash/SHA-256 and dedupe before R2 upload.
- Duplicate upload response must be treated as success/no-op by client.
- Media order persistence failures must show a warning.
- Preferred photo must stay first.
- Floorplans and videos must never become hero photos.
```

Existing duplicate legacy media may require a repair/backfill action. Do not assume upload dedupe will clean all historical duplicates automatically.

---

# 11. Validation contract

HTML `required` attributes are not enough.

Submit must validate the business contract:

```text
address
unit when applicable
price
property type
agent
status
heating/cooling/living area when required
commission disclosure
internet display gates
media/photos when required
UCBA/REBNY/IDX rules
```

If a required business/compliance field is missing, block publish with a clear field list.

Do not publish and then discover missing required fields after the fact.

---

# 12. Route/detail-page contract

The detail route must support legacy inbound URLs but render only the canonical URL.

Required behavior:

```text
Canonical address/id URL -> render.
ID-only URL -> lookup, then 308 redirect to canonical when address displayable.
Legacy hybrid URL -> 308 redirect to canonical.
Suppressed-address listing -> id-only/generic route only if legally required.
?key= debug lookup -> do not let this become public/RealPlus URL.
```

Address lookup must not choose the wrong unit. If slug includes unit, match unit.

---

# 13. Required tests for any future sales form change

At minimum, run:

```bash
npm run type-check
npm run crm:test
npx jest tests/runtime/sales-333-e-46th.test.ts
npx jest tests/runtime/listing-slug-id-suffix.test.ts
npm run rls:validate
npm run compliance-check
npm run ucba:audit
```

If route, media, or FeaturedListings changed, also run relevant route/media/card tests.

Any PR touching the sales form must prove:

```text
- Edit-load does not autosave before populate completes.
- Save Draft creates/updates Draft only.
- Edit mode PATCHes existing listing only.
- Submit success means final status succeeded.
- Canonical URL is /listing/{address-slug}/{id}.
- realPlusUrl is not /listing/{id}.
- Direction prefix E/W/N/S is preserved.
- Unit is preserved and used in lookup.
- Agent hidden fields are populated.
- Media upload does not duplicate.
- Media order failure is visible.
```

---

# 14. Production verification checklist

Before declaring a sales form fix complete, verify production:

```text
1. Open /crm/sale-listing?id={dbId}.
2. Wait 10 seconds without touching anything.
3. Confirm no autosave overwrote saved values.
4. Confirm property type stays correct.
5. Confirm address direction and unit are correct.
6. Confirm listing agent visible and hidden fields are populated.
7. Confirm no phantom DRAFT (browser) row appears.
8. Save Draft, reload, confirm values stick.
9. Submit/Publish, confirm final status is Active.
10. Confirm RealPlus URL panel shows canonical URL only.
11. Visit canonical URL and confirm page renders.
12. Visit id-only URL and confirm 308 redirect.
13. Upload duplicate photo and confirm no duplicate row.
14. Reorder photos and confirm order persists or warning appears.
```

If any of these fail, the sales form is not stable.

---

# 15. Do-not-merge conditions

Do not merge a sales form PR if:

```text
- It introduces another public URL pattern.
- It relies on preview-only proof while production behavior is unknown.
- It changes save/load without tests.
- It changes route behavior without preserving legacy redirects.
- It changes autosave without edit-load proof.
- It changes status mapping without public-display proof.
- It changes media without dedupe/order proof.
- It fixes only a symptom and leaves the root contract undocumented.
```

This document is the contract. Future changes must comply with it or explicitly update it with a reviewed reason.
