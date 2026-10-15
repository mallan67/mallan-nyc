# Standalone forms — as built

How the CRM's standalone forms are actually constructed and how they behave. Read from the source on `main` (commit `71381e1c`) and live-tested in a browser on 2026-10-15 against a local copy of the app.

This file records **what exists**. It is not an authority document. The owner's rules and specifications are in `MALLAN-PLATFORM-MASTER-PLAN.md` section 0.15. Provider (Cotality) facts are never copied here; they are read live. Line numbers are from `main` at the date above and must be re-checked when the files change.

The seven standalone forms (all under `public/crm/`):

| # | Form | File |
|---|---|---|
| 1 | Sale redesign | `SALE-FORM-REDESIGN.html` |
| 2 | Rental redesign | `RENTAL-FORM-REDESIGN.html` |
| 3 | Sales tools (viewer) | `SALE-FORM-WITH-TOOLS.html` |
| 4 | Rental tools (viewer) | `RENTAL-FORM-WITH-TOOLS.html` |
| 5 | Rental deal (tenant) | `TENANT-DEAL-FORM.html` |
| 6 | Buy deal (buyer) | `BUYER-DEAL-FORM.html` |
| 7 | CRM search app | `index-built.html` (generated; not covered here yet) |

Complete control-by-control outlines (tab, sub-tab, card, control id, type, label, Cotality field tag, source line) for forms 1–6 are in `docs/forms/structure/`.

## 1. How the redesign forms (1 and 2) are laid out

The left sidebar has one tab per section, and the form flows from one tab to the next. Visible tab names:

| Sidebar tab | Contents |
|---|---|
| 1 Listing Info | Sub-tabs: Essentials (property address with building lookup, agent and dates, listing type and classification, status, fees), Description, Contacts, Open Houses |
| 2 Unit Info | The unit within the building. Sub-tabs: Essentials (unit details, floor, square feet, rooms, exposure and views), Additional Rooms (kitchen, living room, dining, storage), Features |
| 3 TH / Building | Townhouse or whole-building information. Sub-tabs: Essentials (property details, lot, building size and structure, zoning and FAR, land lease, parking, documents), Description / setup, Financials |
| 4 Distribution | IDX, VOW and syndication controls; send listing to |
| 5 Preview | Listing preview and transit |
| 6 History | Update history |
| 7 Commission Request | Locked until the listing's status is Rented or Rented Thru Us (rental) or the sold equivalent (sale) |

A separate **Building Information** panel opens over the form (`showRentalBuildingInfo` line 4975 / `showSaleBuildingInfo` line 5952). It has its own tabs: building address (with a building address lookup at the top), transportation, building details, policies, personnel.

The source's own comment banners are out of date and do not match what is shown. For example the sale form's comment "TAB 2: POLICIES & REQUIREMENTS" sits above the Unit Info tab. Use the sidebar names above.

## 2. Property type flow (live-tested)

The property type radio buttons (`rentalPropertyType` / `salePropertyType`) decide whether the TH / Building tab (tab 3) is available. `applyRentalFieldRules` (`RENTAL-FORM-REDESIGN.html` lines 4896–4959) and its sale counterpart (`SALE-FORM-REDESIGN.html` line 7254 onward) set the tab's opacity to 0.4 and pointer events to none for the types listed in `shouldSkipTab3` (rental line 4768, sale line 6792). The Next and Back buttons also skip tab 3 for those types (`navigateNextFromFeatures`, `navigateBackFromDistribution`).

Observed in a real browser, for every property type option on each form:

| Property type | TH / Building tab | Unit Info tab |
|---|---|---|
| Condo, Co-op, Condop | **Blocked** (dimmed, cannot be clicked) | Open |
| Loft | **Blocked** | Open |
| Rental building (rental form) | **Blocked** | Open |
| Deeded parking (sale form) | **Blocked** | Open |
| Single-family townhouse, multi-family townhouse | Open | **Open (not locked)** |
| Single family, multi family, mixed use | Open | **Open (not locked)** |
| Duplex, triplex, quadruplex | Open | **Open (not locked)** |
| Office, retail, commercial, land (sale) | Open | **Open (not locked)** |

**Owner specification versus as built.** The owner's rule: when a *unit* is selected the townhouse tab is blocked, and when a *townhouse or house* is selected the *unit* tab is locked.
- First half: implemented and working.
- Second half: **not implemented.** No code locks the Unit Info tab, and the live test confirms it stays open for every type.

## 3. Co-op, condo and other type-specific fields

There is no separate "co-op form". Instead a rules table keyed by property subtype shows and hides fields: `RENTAL_FIELD_VISIBILITY_RULES` (`RENTAL-FORM-REDESIGN.html` lines 4704–4721), resolved by `resolveRentalListingSubtype` (line 4656). Examples: board approval, board interview and sublease are shown for co-op and condop; first right of refusal for condo and condop; the building requirements section and meet-and-greet for managed building types; deal fees for managed units. Commercial and mixed-use types switch the distribution settings (`applyCommercialDistribution`).

## 4. Address to building

- **Rental form:** `rentalAddressBlurLookup` (line 4476) compares the typed street address, exactly and case-insensitively, with an in-memory list of buildings (`buildingDatabase`, filled by `fetchBuildingsFromAPI`, line 4334). On an exact match it calls `selectBuildingFromIDX`, which fills the building. No match: nothing is filled.
- **Sale form:** the same mechanism, plus an independent search in the Building Information panel: `searchBuildingByAddress` (line 6943) uses the in-memory list first and falls back to the building API; `loadBuildingFromAddress` (line 7011) starts it from the panel's address box; `_syncSaleBuildingAddressFields` (line 7046) keeps the panel's address and the main form's neighborhood consistent.
- **Not yet verified live:** whether either form fills the building type and all the associated information as the owner specified. The rental form's start-up failure (below) prevents most of its wiring from running.

## 5. Unit versus building fields (observed)

- **Unit Info > Essentials** holds the unit's own fields, including `Approx. Sq Ft` (`rentalSqFt`, tagged `LivingArea`, line 1795) and `Floor in Building` (`rentalFloor`, tagged `EntryLevel`, line 1799). The floor input is a text box; Cotality's `EntryLevel` is a whole number.
- **Unit Info > Features** contains a card titled **Building Amenities** (doorman, elevator, gym, bike room, storage, roof deck, live-in super, parking; rental lines 1996–2006).
- The **Building Information** panel separately holds building-level fields (tax abatement, number of elevators and others).
- So building amenities appear in two places in the rental form. Whether the two are linked has not been checked.

## 6. Saving, drafts and the agent at start

| Behavior | Rental form (2) | Sale form (1) |
|---|---|---|
| Agent name at start | `initLoggedInAgent` (line 5030) | `initLoggedInAgent` (line 4839), `_applyAgentData` (line 4846) |
| Draft save | `saveRentalDraft` (5504), `loadRentalDraft` (5542), `manualSaveDraft` (5624) | `saveSalesDraft` (6881), `autoSaveDraft` (8172), `performAutoSave` (8180), `manualSaveDraft` (8260) |
| Draft restore | `loadRentalDraft` | `_offerDraftRestore` (10146), `_restoreDraftFromLocalStorage` (10196), `_discardLocalDraft` (10247) |
| Fair Housing check | `checkFairHousing` (6099), `checkDescriptionCompliance` (6044) | `checkFairHousing` (6714), `checkDescriptionCompliance` (6639), `scanAllContent` (8693) |
| Submit | `submitRentalListing` (5881) | via `validateAndNextSaleTab` (8121) and the submit handlers |

Findings from the live audits (2026-10-15, build `71381e1c`):
- **Rental form start-up fails.** `initLoggedInAgent` throws `companyKey is not defined`, which stops the rest of the page initialization (draft restore, edit mode, field wiring).
- **Draft restore is not reached.** Sale `_offerDraftRestore` is defined but never called; the rental draft saver and restorer use different keys.
- **The Fair Housing check blocks submission.** The owner's specification is to flag and highlight the words without blocking the save.
- **Create returns an error** from the old REBNY validator on the server (listing create: HTTP 422), so a listing cannot be created from either redesign form as shipped.

## 7. Deal forms (5 and 6)

Both forms use the same layout: Listing Search (find listing by IDX / RLS lookup, property address, listing-side information, our agent, team), Property Details (Unit Details, Features, Building), Client Info (tenant: details, employment, guarantor; buyer: details, financing, attorneys), Photos, Preview, History, Commission Request. Their unit and building details are separate sub-tabs.

Findings from the live audits: the listing search uses an empty list and never calls the search API; Save Draft shows a success message without saving; the deal API stores only a handful of fields; nothing reopens; the login script has four unterminated strings. Details are in the audit evidence and the Field Correction Ledger.

## 8. Maintenance

Regenerate the outlines in `docs/forms/structure/` and re-run the property-type flow test after any change to these forms. The flow test is described in section 2: select each property type radio on each form, then try to click the TH / Building and Unit Info tabs.
