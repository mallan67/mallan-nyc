# CRM UI — BROKERAGE AUDIT AND CORRECTION MAP

**Evidence level: `CODE` at head `f0f16253`.** Three passes:

1. Seven parallel investigators — 268 findings, each requiring file:line + a verbatim quote.
2. An adversarial verification pass — 203 sampled claims re-checked; **194 confirmed, 9 refuted.**
3. **A personal re-verification of every claim this document acts on** — which caught **five
   more errors the adversarial pass had let through.** §11 lists them.

Not independently reproduced by a second party outside this session.

**No code was changed by this audit.** It is a map, and the order at the end is the point.

---

## 1. THE PICTURE, IN NUMBERS

| | | how I checked it |
|---|---|---|
| `<input>` / `<select>` elements in the search-form partial | **1,101** | `grep -c` on `search-form-and-results.html` |
| of which checkboxes | **831** | `grep -o 'type="checkbox"'` |
| `data-field=` bindings (the only attribute a collector reads) | **421** | `grep -o 'data-field='` |
| related Cotality resources pulled on the search path | **1 of 6** — Property only | `expandMedia:false`, no `expandCustomProperty` |
| result rows a search can ever return | **200**, regardless of match count | `search-engine.js:508 params.limit = 200` |
| sort controls that sort the *result set* | **0** | `toggleSortOrder` has one definition and zero callers |
| device classes the app is usable on | **1** (desktop) | read from CSS + inline geometry, **not device-tested** |

> **A previous draft of this table said "718 controls, 186 reach the provider, 520 dead."
> I could not reproduce any of those three numbers and have removed them.** The counts above
> are ones I re-ran myself. **680 of the 1,101 controls carry no `data-field` at all**, which
> is a strong signal but is NOT the same claim as "520 are dead" — establishing that requires
> per-control tracing through the collector and the server, which has not been done. The
> named dead controls in §10 are individually verified; the aggregate is not.

---

## 2. THE THREE THINGS THAT ARE COMPLIANCE-SEVERE

These are not UX debt. They put false statements in front of a broker or a client.

### 2.1 Transit is fabricated

**Arrival times.** `pagination.js:2076` — `var lineCode = lines[i].charCodeAt(0);` then
`offset = ((lineCode * 37 + now.getMinutes()) % (headway.max - headway.min)) + headway.min`.
The next-train times are arithmetic on the **letter of the line**. The code's own comment
says *"Stagger arrivals per line using line char code as seed."* They refresh on a timer,
under a badge at `pagination.js:771` reading:

> `Live — MTA schedule data · Refreshes every 30s`

**Commute calculator** (`pagination.js:2232-2256`). Verified line by line:

```js
var address = document.getElementById('detailCommuteAddress').value.trim();
if (!address) { showToast('Please enter your work address.', 'warning'); return; }
...
// Simulate reasonable NYC commute times
var midtownDist = haversineDistance(baseLat, baseLng, 40.7549, -73.9840);
var subwayMin = Math.max(10, Math.round(midtownDist * 8 + 5));
```

The address the broker types is read **only to check it is non-empty**, then never referenced
again. Every commute is computed to a hardcoded Midtown coordinate, as **straight-line
distance × a constant** — no routing, no transit data. With no listing coordinate the origin
falls back to `40.7831, -73.9554`. Asking for the address makes the broker believe it drove
the answer.

There is no honest partial version of this. **Delete it.**

### 2.2 Building amenities are asserted with no data behind them

`pagination.js:643-654` renders twelve static cards — Doorman, Elevator, Gym, Pool, Roof
Deck, Laundry, Bike Room, Storage, Concierge, Live-in Super, Parking, Pet Friendly — **for
every listing**, bound to nothing. On a licensed IDX surface that is unqualified advertising
copy. Either bind them to `AssociationAmenities` (already fetched and mapped) or delete the
block. Shipping it unbound is an affirmative false claim.

### 2.3 Showing instructions are fabricated, and a broker can act on them

`pagination.js:526` renders `'(UCOM) ' + agentName + ' ' + agentPhone` when there is no
showing instruction. That is a made-up MLS showing code. Of everything in this audit it is
the item most likely to cause a broker to do the wrong thing. **Render `---`.**

Adjacent, and worse than first reported: **fabricated listing records ship in the markup,
labelled as provider-sourced.** `search-form-and-results.html:7240` —

```html
data-listing-id="RLS-78921" data-building="432 Park" data-source="REBNY-RLS"
```

Seven such identifiers (`RLS-78921`, `-82345`, `-65432`, `-54321`, `-43210`, `-91234`).
The `data-source="REBNY-RLS"` attribute makes them assert an MLS origin. Fabricated
identifiers carrying a provider-source attribute should not exist in a licensed IDX product
even inside a hidden block.

---

## 3. SEARCH — the result set is not what the broker thinks it is

**A search returns the 200 most-recently-modified listings, then sorts those client-side.**

- The route caps at 200. Nothing on screen says the set was truncated.
- The pre-search badge and the post-search headline read **different numbers**: a search
  advertising "~1,240 matching" becomes "200 Results" the moment you press Search.
- **Every** sort control — the dropdown and all 12+ clickable grid headers — reorders only
  those 200 rows. `toggleSortOrder()` in `toolbar-functions.js:56-119` is the only path that
  re-queries the provider with a real `$orderby`, and it has **zero callers repo-wide**.

So "cheapest first" means *cheapest of the 200 most recently touched* — a different listing
from the cheapest in the borough. A broker quoting that number to a client is wrong, and
nothing in the UI tells them.

### The collector only looks in two boxes — and saved searches write into a box it never reads

`collectSearchCriteria()` scans `#searchBasicMode` or `#searchAdvancedMode`. But
`#searchBasicMode` closes at line 958 and the file continues for another **1,250 lines**
with `#searchBasicModeRental` (963) and `#searchBasicModeBuilding` (1796) — both
`style="display: none;"`. `scripts/idx-validate.js` already calls them *"Old form IDs"*.

> **CORRECTED — the audit first reported these as "never rendered, never scanned." That is
> false, and I verified it myself.** Two modules do reach into them:
>
> - `init-ui.js:34-39` — `initCustomSelectDropdowns()` lists both panels and converts every
>   `<select>` inside them at init.
> - `saved-searches.js:384, 398` — on a **rental** saved-search restore it does
>   `getElementById(tab === 'rent' ? 'searchBasicModeRental' : 'searchBasicMode')` and
>   checks/unchecks `MlsStatus` and `CommonInterest` boxes **inside the hidden panel**.
>
> Neither un-hides it. So the real defect is sharper than "dead markup":
> **restoring a saved rental search writes status and ownership criteria into a panel the
> user cannot see and the collector never reads.** The broker sees nothing restored, and the
> search then runs without those criteria.
>
> **This also makes the "delete 1,250 lines" recommendation unsafe as originally written** —
> those two callers must be handled first, or restore breaks.

Consequence: **neighborhood search is broken on rentals and buildings.** The only visible
neighborhood box writes chips to `saleNeighborhoodTags`; the collector asks for the rental
and building equivalents, which live in the hidden panels.

---

## 4. SUBSECTIONS — only Property is pulled

**`$expand` is hard-disabled on the search route.** Media, `CustomProperty`, `OpenHouse`,
`Member` and `Office` are never touched.

| section | what actually arrives |
|---|---|
| **Office** | office **name** only |
| **Agent** | name / email / phone. License #, co-listing agent = hard-coded `---` under an "Agent Only" lock badge |
| **Building** | `BuildingName` + `BuildingKeyNumeric`. `StoriesTotal` and `NumberOfUnitsTotal` **are fetched** and written to the Buildings DB, then **dropped by the mapper** — so every "Stories" and "Total Units" field prints `---` |
| **Media** | only via a second lazy endpoint, and **3 of the 5 result views cannot trigger it** — their cards lack the `data-listing-lid` hook the observer looks for |
| **Open House** | nothing. The "Open House Date/Time" column is nonetheless a **LOCKED default column** in the picker |
| **CustomProperty** | nothing — which is why all 52 NYC keys are unreachable (matches defect D1) |

**~30 grid columns render `return '--'` with no obtainable source**, offered to brokers in
the column picker as if they could fill.

---

## 5. MAP — the pins are mostly not real

The stack is genuine (MapLibre GL 4.7.1 + OpenFreeMap). The positions are not.

`/api/idx/search` **never geocodes** — `geocodeListings()` is wired only into the public
`/api/listings` route. So in the CRM, a listing with no coordinate is placed at the
**neighborhood centroid plus a golden-angle spiral offset of up to ~0.005° (~1,800 ft)**.
The repo's own comments state the feed returns null Lat/Lng, which makes that fallback **the
normal path, not the exception**.

A pin can sit a third of a mile from the building. The only disclosure is a **9px
"Approximate location"** line inside the popup — nothing on the pin. The public site has a
second, independent fabrication: ZIP centroid + deterministic hash jitter.

---

## 6. CALCULATORS — seven implementations that disagree

> **CORRECTED — the audit reported "2.5% vs 2.25%, a $17,500 error on a $7M deal." Those
> numbers are wrong.** I re-read all three files. The disagreement is real and **larger**
> than reported; the specific rates and the impact figure were not.

**Three implementations, three different answers for the same $5M sale:**

| file | rule in the $5M–$10M band | mansion tax on $5M |
|---|---|---|
| `dashboard/panels/tools/buyer-closing-costs.js:35-39` | `< 15,000,000 → price * 0.0325` | **$162,500** |
| `output/calculators.js:12` | `{ min: 5000000, max: 9999999, rate: 0.025 }` | **$125,000** |
| `dashboard/workspace.js:3635` | `price >= 1000000 ? price * 0.01 : 0` — flat, no bands | **$50,000** |

**A $112,500 spread on the same input.** I am deliberately not asserting which is correct —
that is a tax fact and needs an authoritative source, not a code reading.

| defect | consequence |
|---|---|
| **`workspace.js:3635-3636` sums a buyer cost and a seller cost** | `mansionTax` (buyer) + `transferTax` at `0.01425` (the NYC Real Property Transfer Tax, a **seller** cost) are added into one total labelled **"Closing Costs (NYC)"** — **a number that is correct for nobody**. Verified at both lines |
| Sale Investment Calculator | renders by default in sale mode and permanently shows **NOI $0, Cap Rate 0%, Cash-on-Cash 0%, ROI 0%**. All 15 IDs have zero JS references. A broker cannot tell it is fake |
| "Total Monthly" panel | the `+ Maint / Tax` row has no writer, and the label promises ownership-aware maintenance and tax that do not exist |

Trustworthy today: the commission-split calculator on the deal forms, the equity/carrying-cost
tools in the dashboard client workspace, and raw mortgage P&I.

---

## 7. REPORTS — two paths are safe, the rest is façade

**Safe:** PRINT (all 9 formats, real printable tab, full REBNY attribution) and CSV/EXCEL as
an agent working file.

**Not safe:**

- **"Shareable Link" copies a 404.** The route does not exist in this repo. The broker is
  told it worked.
- **Email is simulated.** Unless the individual agent has pasted their own EmailJS keys into
  their own browser, it shows a green "Email sent", writes `status:'delivered'` to
  localStorage, and **sends nothing**. The real server-side route the rest of the CRM uses
  (`app/api/crm/email/route.ts`) is never called from Reports.
- **The entire "Customize" tab** — ~100 field checkboxes and a "Save Selection" button —
  **changes nothing in any HTML report.** The audit first said it "only reaches CSV/Excel";
  the real mechanism is worse. `getSelectedReportFields()` **is** called in the HTML builder
  at `reports.js:559`, assigned to `customFields`, and that variable appears **exactly once
  in the file**. The selection is read and thrown away.
- Nine of the 32 Step-3 option checkboxes are never read.
- `report-package.js` — **1,050 lines, loaded by nothing**, promising a "Full Package
  combining all 8 report sections" the product does not have.

---

## 8. DEVICE CLASSES

| | verdict |
|---|---|
| **Desktop ≥1024px** | **USABLE** — the only class the app was built for |
| **Tablet 768–1023px** | **DEGRADED** — results table header and body split into two independently-sized tables so columns stop lining up; split-view map still forces a 360px panel |
| **Mobile <768px** | **UNUSABLE for reviewing results**, partial for entering a search |

Mobile specifics:

- Every select/input is pinned to **38px** by `liquid-theme.css:227,243`
  (`min-height: 38px !important`), while `responsive.css:242,245` sets `min-height: 44px`
  **with no `!important` at all**. The specificity argument is not even needed —
  `!important` decides it outright, and `liquid-theme.css` also loads later (index.html
  line 50 vs 48). The 44px touch minimum never applies to any control in the search form,
  and the iOS focus-zoom prevention at `responsive.css:8` loses the same way. The agent
  fights a zoom cycle on **every field** across a form with 51 selects and ~93 inputs.
- **831 checkboxes** are explicitly excluded from the touch-target rule and render at
  **15×15px**.
- The date picker is a `position:fixed` **520px** panel that JS positions at **`left:-153px`**
  on a 375px screen. Half the calendar is off-viewport with no way to scroll to it. **There
  are 16 of them.**
- Of five results views, only Gallery has a real mobile layout. Short Summary clips its
  agent/phone/email panel off-screen with `overflow-hidden` and no scroll; Summary
  hard-codes a 340px photo on a 375px screen, leaving the card body at zero width.
- Tapping the map toggle collapses results to nothing.
- **~⅓ of `responsive.css` targets a DOM this page does not have** — `.luxury-sidebar`,
  `.mobile-menu-btn`, `.sidebar-overlay`, `.mobile-tabs`, `.hide-mobile` all have **zero
  occurrences**. There is no mobile navigation because the navigation it was written for was
  never included.
- **No viewport test covers the CRM.** Mobile e2e specs *do* exist —
  `listing-detail-mobile.spec.ts` runs at 390×844 — but every one navigates to
  `/listing/${slug}`, the **public consumer** page. `grep -rln "crm" tests/e2e/*.ts` returns
  **nothing**. So the surface with 1,101 controls has zero viewport coverage, while the
  public page that has some is out of scope for this work.

---

## 8b. FINDINGS FROM THE INDEPENDENT BROKERAGE REVIEW — all verified here

A second reviewer went through this as a brokerage operating system at head `25df5b18`.
**Every new claim below I re-checked myself** — the live ones against the `$metadata`
inventory captured this session, the code ones at source. All confirmed.

### The server bug I missed entirely

**The Search cache key omits the sort expression.**

```js
// app/api/idx/search/route.ts:199
const cacheKey = `idx:${filter}:${limit}:${skip}`;
```

`sort` is read and passed to `fetchFromTrestle` as `orderby`, but is **not in the key**. Two
requests with identical criteria and page but **different sort** collide in the 5-minute
cache, so the second one is served the first one's ordering. `LIVE`/`CODE`, verified.

### Sorting does not just mis-order — it can change the universe

The toolbar's server re-fetch reconstructs only **price, beds, baths and at most one
neighborhood** from the active criteria. Advanced criteria are not carried back. So a sort
can return a **different result set**, not a reordering of the same one. Sort must never
change the universe.

### Media: the load-bearing comment is factually wrong

```js
// app/api/media/batch/route.ts:19
// Trestle Media has only 2 categories: Photo and FloorPlan.
```

**Live `Media.MediaCategory` has 18 members**, verified in the captured inventory:

`Addendum · AerialView · AgentPhoto · BrandedVirtualTour · Disclosure · Document ·
FloorPlan · Map · OfficeLogo · OfficePhoto · Other · Photo · RentalDocuments · Restriction ·
Survey · Topography · UnbrandedVirtualTour · Video`

And `MediaClassification` has **6**, `MediaType` has **44** — three *different* fields, as
the coverage matrix already required. Two unsafe inferences sit on top of that false premise
(`media-sync.ts:1700-1706`, quoting the repo's own comment):

- `classifyTrestleMediaCategory` **defaults a MISSING `MediaCategory` to `Photo`**;
- a `DOCUMENT-*` URL shape is inferred to be a **FloorPlan**.

With 18 live categories, both inferences will misfile `Disclosure`, `Document`,
`RentalDocuments`, `Restriction`, `Survey` and `Addendum`. The classifier itself is good
architecture — one `classifyMediaItem`, reused rather than duplicated. **The premise it
reasons from is wrong.**

### Three rich provider families the search route does not even select

| field | live shape | in `SEARCH_SELECT_FIELDS`? |
|---|---|---|
| `Property.DocumentsAvailable` | **multi-enum, 94 members** — `BuildingRules`, `BylawsAndAmendments`, `Financials`, `Floorplan`, `OfferingPlan`, `Deed`, `Appraisal`, `EngineeringReport` … | **no** |
| `Property.ShowingRequirements` | **multi-enum, 39 members** — `AppointmentOnly`, `TwentyFourHourNotice`, `CallListingAgent`, `DoNotDisturbTenant`, `Lockbox`, `ShowAnytime` … | **no** |
| `Property.Disclosures` | **multi-enum, 119 members** — not mentioned by either review until now | **no** |

The detail UI meanwhile renders document cards for Building Rules, Bylaws, Financial
Statement, Offering Plan and Board Package as **static boxes**. The provider has a
94-value structured field for exactly this and it is never requested.

**And the fabricated showing instruction exists while `ShowingRequirements` — 39 structured
values describing precisely that — is not selected.** The invention and the real fact are
one `$select` entry apart.

### Reports and CMA, verified at source

| claim | verified |
|---|---|
| CMA treats the first row as the subject | `reports.js:1590` — `var subject = listings[0] || {};` |
| report fields fall through to whatever the row happens to have | `reports.js:483` — `map[field] !== undefined ? map[field] : (listing[field] \|\| '')` |
| Search GET performs a building-DB upsert while an agent searches | `route.ts:255` — `upsertBuildingFromSearchResult(...)` inside the request |

The last one matters architecturally: **search consumption is doing ingestion.** Building
data should arrive from synchronization, and Search should read it.

### The status panel mixes provider status with Mallan deal state

`Active` · `Coming Soon` · `Back on Market` sit in the same tree as `Offer`, `Offer Out`,
`Contract Signed`, `Board Approved`, `ACRIS Verified`, `Financed`, `No Financing` — all
bound as if they were one provider status dimension. They are at least six different facts:
provider listing status, offer state, contract state, board state, recording state and
financing state. Only the first is a Cotality status.

---

## 8c. SECOND INDEPENDENT AUDIT — verified here, and it corrects me again

A third-party audit of the **authenticated Agent/CRM Search only** at head `be53e7d0`.
Every claim below I re-checked myself. **All confirmed.** Three change the P0 list.

### It refuted my own Google statement — the third scope failure

I reported the geocoding vendor removed and named the directories I scanned:
`lib/search`, `lib/listings`, `lib/idx`, `lib/compliance`, `tests/runtime`. **That scan
excluded `public/crm` — the surface a broker actually sees.** Live in the CRM today:

```js
// public/crm/js/output/reports.js:1301
'<a href="https://maps.google.com/?q=' + encodeURIComponent(displayAddr(first) + ' New York NY')
  + '" ...>Google Map</a>'
```

Plus a `googleMapLink` report option (`data-loader.js:99`) and three more generators in
`report-package.js` (the 1,050-line orphan). So the product **emails clients a Google Maps
link** while the architecture layer declares no vendor. Stating a scope is not the same as
having a true claim — this is the third time the narrow version was accurate and the
impression was not.

### The two-engine split is documented in the code itself

```
// lib/search/criteria-to-prisma.ts:336-339
// Saved searches can be created from the CRM live-Trestle search (Engine A).
// Alerts replay through the Postgres projection (Engine B) ...
// Engine B's criteria vocabulary is a strict subset of Engine A's
```

An agent can build a search, see a result, save it, replay it, and **get a different
universe because a different engine executed it.** This is the architectural reason Search
loops, and it is written down in the repo.

### Count and `hasMore` describe different populations — the code admits it

```
// app/api/idx/search/route.ts:362-366
// Post-fetch filtering means total counts reflect the post-filter
// page size, not the unfiltered Trestle total. ...
// This is a known limitation
```

`total: finalTotal` is post-gate; `hasMore: result.hasMore` (line 385) comes straight from
the provider's pre-gate query. So the number and the "is there more" flag are computed from
**two different universes**, and with sponsor filtering a third appears — the sponsor rows
found inside the current page.

### The Sale universe is objectively wrong

The sale filter is `PropertyType ne 'ResidentialLease'`. Live `PropertyType` has **13**
members: `BusinessOpportunity` · `CommercialLease` · `CommercialSale` ·
`DisasterReliefRental` · `Farm` · `HighRise` · `Land` · `ManufacturedInPark` · `MultiFamily`
· `Residential` · `ResidentialIncome` · `ResidentialLease` · `Specialty`.

**"Not ResidentialLease" is not "residential sale."** It admits commercial leases, land,
farm, business opportunity and specialty into a Sale search. And because the mapper treats
anything whose `PropertyType` contains *"lease"* as a rental, **a `CommercialLease` can enter
through Sale criteria and leave as a rental row.**

### Status: the agent's "Pending" does not search Pending

```js
// public/crm/js/search/search-engine.js:461
{ 'ACTIVE':'Active', 'COMING_SOON':'ComingSoon', 'PENDING':'ActiveUnderContract',
  'CONTRACT':'ActiveUnderContract', ..., 'FUTURE':'Incomplete' }
```

Live `StandardStatus` has **11** members and carries `Pending` **and**
`ActiveUnderContract` as **separate** values. Live `MlsStatus` has **25** — including
`Leased`, `Contingent`, `AttorneyReview`, `PendingInspection`, `CompSold`, `PrepShow` — and
the mapper covers a subset, so the rest fall to `UNKNOWN`. `Leased` being unmapped matters
for every rental.

### Facts fetched from Cotality and then thrown away

`ClosePrice` and `LeaseAmount` are in `SEARCH_SELECT_FIELDS` and appear **zero times** in
`crm-idx-mapper.ts`. Mallan pays the request cost for the fact and discards it before the
agent — or CMA — can use it. `ClosePrice` is the transaction truth a CMA is built on.

Same shape for `PreviousListPrice`, `AvailabilityDate`, `AssociationFeeFrequency`,
`LeaseAmountFrequency`, `Furnished`, `MoveInCosts`, `OngoingFees`, `TenantPays`,
`TenantPaysDescription`, `StoriesTotal`, `NumberOfUnitsTotal`.

### Association fees are assumed monthly

```js
// lib/search/crm-idx-mapper.ts:60,192
const maintCC = Number(raw.AssociationFee) || 0;
totalMonthly: isRental ? price : monthlyTax + maintCC,
```

`AssociationFeeFrequency` is fetched, has **16 live members** (Annual, Quarterly,
SemiAnnual, Weekly, OneTime …), and is ignored. A `$12,000 Annual` fee can present as
`$12,000/month`. The `|| 0` also converts unknown into zero, and that number flows into
carrying cost, reports and every calculator. `LeaseAmountFrequency` has 16 members too.

### Two more fabrications and one wrong sort field

- `reports.js:1796,1799` — `(l.photoCount || 6)` renders **"6 photos"** and lays out six
  image slots when the count is missing or zero.
- `toolbar-functions.js:65` — sorting by **"Listed Date" orders by `ModificationTimestamp`**.
  Those are different facts; a re-listed row sorts as new.
- `managementCompany` maps to `ListOfficeName` — the **listing brokerage**, not the managing
  agent. Live `Property` declares no `ManagementCompany`. The honest answer is UNAVAILABLE,
  not a substitution.

---

## 9. WHY THIS KEEPS LOOPING

### A bug shape the deeper pass found twice — READ-THEN-DISCARD

Not "never called". **Called, assigned to a variable, and never referenced again.** It
defeats every "is this wired?" check that greps for a caller, which is why both instances
survived the first two passes:

| input | read at | used |
|---|---|---|
| the work address in the commute calculator | `pagination.js:2232` | only as a non-empty gate; never in the calculation |
| the ~100 Customize-tab report fields | `reports.js:559` — `var customFields = getSelectedReportFields();` | **never.** `customFields` occurs exactly once in the entire file |

Both surfaces take deliberate input from a broker and visibly respond, while the input
reaches nothing. This is the most deceptive class of defect in the codebase because the UI
confirms receipt.

### And four structural mechanisms — every finding above is one of them:

1. **UI was built ahead of the data contract.** Controls, columns and panels were shipped
   for facts the route never fetches. Nothing failed loudly, so nothing got fixed — a dead
   control looks identical to a working one until a broker relies on it.
2. **A placeholder is indistinguishable from a value.** `--`, `---`, `$0`, `0%` and a
   fabricated `(UCOM)` code all render like data. There is no "unavailable" state anywhere
   in the UI, so the system cannot tell the broker what it does not know.
3. **The same concept was implemented repeatedly instead of once.** Seven calculators, three
   transit datasets, two geocode fallbacks, two neighborhood inputs. They drift, and the
   drift is invisible until two of them are on screen together.
4. **Coverage was measured by what the form shows, not by what the provider serves.** That
   is the same error the field-family matrix corrected at the data layer — here it produced
   718 controls over a 186-control contract.

**The correction is not more features. It is deleting what cannot be true, making
unavailability visible, and collapsing duplicates to one implementation.**

---

## 10. THE LOCKED CORRECTION SEQUENCE

**This supersedes the earlier six-step map in this document.** Two independent reviews
produced the same diagnosis and two different orderings; this is the reconciled one. It is
a sequence, not a menu — later phases depend on earlier ones.

> **The single sentence:** you are not missing another twenty filters. You are missing **one
> completed information chain** —
> `Cotality fact → exact mapping → storage → Search universe → result → workspace → map →
> report → CMA → client delivery`. Every piece has been allowed to build its own
> interpretation of incomplete data. That is the loop.

### P0 — nothing else starts until these are done

**Reconciled across three reviews.** Two items were promoted to P0 by the second
independent audit: **semantics** (the Sale universe and status mapping are objectively
wrong, not merely imprecise) and **mapping loss** (facts already paid for and discarded).

| # | P0 | why it is P0 |
|---|---|---|
| 1 | **Stop false information** | brokerage risk today — fabricated transit, commute, showing instructions, photo counts, and every unknown-becomes-a-value default |
| 2 | **ONE Search engine and one universe** | Engine A (live passthrough) and Engine B (projection) execute the same saved search differently — documented at `criteria-to-prisma.ts:336` |
| 3 | **Sale / Rental / status semantics** | `PropertyType ne 'ResidentialLease'` is not residential sale; the agent's "Pending" searches `ActiveUnderContract`; `Leased` is unmapped |
| 4 | **Count / paging / sort** | `total` is post-gate while `hasMore` is pre-gate; the cache key omits sort; sort changes the universe |
| 5 | **Close the mapping loss** | `ClosePrice`, `LeaseAmount` and ~13 more are fetched and dropped before the agent — CMA cannot work without `ClosePrice` |
| 6 | **Cotality subresource hydration** | `CustomProperty`, `OpenHouse`, `Office`, `Member`, plus `DocumentsAvailable` (94), `ShowingRequirements` (39), `Disclosures` (119) |
| 7 | **Media contract + permissions** | 18 categories read through a 2-category premise; permissions must be evaluated on the Media row, not inherited from Property |

**Hydration architecture, explicitly:** do **not** `$expand` everything on every search —
that produces a slow, bloated Search. Synchronization hydrates into canonical storage;
**Search returns a compact row, and opening a listing hydrates the full workspace.**

---

### PHASE 1 — STOP FALSE INFORMATION

Deletions and one behaviour change. No dependencies; ship first.

- Synthetic "Live — MTA schedule data" arrivals + the commute calculator.
- The `(UCOM)` fabricated showing instruction → `---`.
- The twelve static building-amenity cards; the static document boxes.
- The fabricated `RLS-*` demo cards carrying `data-source="REBNY-RLS"`.
- **The mapper's invented defaults** — the highest-leverage item in the phase:

| today | must become |
|---|---|
| missing borough → `Manhattan` | **unknown** |
| provider listing → `Exclusive` | **unknown** |
| absent owner opt-out / participant-only → `false` | **unknown → fail closed** |
| `idxDisplay` / syndication → `true` | **unknown → fail closed** |
| missing numeric → `0` | **unknown** |
| missing status → `Active` | **unknown** |
| missing `MediaCategory` → `Photo` | **unknown** |

  `search-engine.js` re-applies several of the same defaults after the server responds, so
  both layers must change together.

- Simulated email must stop writing a delivered status. Three honest states:
  **sent · failed · not configured.**

**UNKNOWN is a real state.** Unknown borough is not Manhattan. Unknown fee is not $0.
Unknown permission is not permitted. This is the same change as "make unavailability
visible" in the earlier map, and it is what stops the loop.

### PHASE 2 — CLOSE THE COTALITY READING CONTRACT

One exact map for `Property` · `CustomProperty`/`CustomFields` · `Media` · `OpenHouse` ·
`Member` · `Office`, plus verified building/parcel inputs. Per fact: path · type ·
enum/multi-enum · semantics · permissions · null/sentinel behaviour · Mallan canonical fact ·
storage · searchability · workspace/report use. **No second registry.**

Add to the select what is currently absent and structured: `DocumentsAvailable` (94),
`ShowingRequirements` (39), `Disclosures` (119).

### PHASE 3 — FINISH THE CANONICAL SEARCH UNIVERSE

Replace provider-passthrough result authority with, through `ListingSearchProjection`:

> Mallan canonical local listings **+** synchronized third-party Cotality inventory
> **−** suppressed Cotality representations of Mallan listings

Then: complete count · complete paging · complete sort · the same criteria on every page and
every sort · **no 200-row universe cap**. Fix the cache key to include the canonical sort.
Move the building upsert out of the search GET — synchronization ingests, Search reads.

### PHASE 4 — FIX SEARCH SEMANTICS AS GROUPS, NOT FIELDS

Sale · Rental · Building, each with one canonical meaning per criterion and one exact
execution path. **Split the status panel**: Listing Status from verified Cotality facts;
Mallan Deal/CRM State (offer · contract · board · closing · financing) as its own dimension.

### PHASE 5 — RESULTS WORKBENCH

One universe powers Grid · Gallery · Summary · Master/Detail · Map. Server-side sort against
the full criteria. In-result filtering and search are explicitly **secondary**. Selection
persists across view changes. The Map shares exact Search state.

### PHASE 6 — LISTING WORKSPACE HYDRATION

Keep the existing structure; rebuild the data under it. Canonical section order:

Identity & Attribution · Address/Parcel/Building · Listing/Transaction · Unit ·
Financial & Carrying Costs · **Co-op/Condo Purchase Requirements** (financing limit · flip
tax · tax deductibility · abatement · board · sublet/pied-à-terre/guarantor) · Amenities
(unit **and** building, separated) · Building · Showing & Access · Open Houses · Media ·
Documents & Disclosures · Neighborhood/Map/Transportation (verified only) · CRM.

The test: an agent answers all of it from one screen — what is it, who listed it, what does
it cost, what does the building allow, what financing is permitted, flip tax, fees,
amenities, showing rules, open houses, media, documents, where, what transit is verified,
what changed, and what have I done with this listing.

### PHASE 7 — MAP

Keep MapLibre/OpenFreeMap. Correct the geometry hierarchy: exact coordinate → exact pin;
neighborhood only → **polygon or labelled area, never a point**; unresolvable → **no pin**.
Then device modes — desktop split, tablet toggle, mobile full-screen either/or. Restore
bounds search only after that.

### PHASE 8 — REPORTS

Keep every format. Connect them to a **canonical Search snapshot**, not loaded browser rows.
Offer a field only when it is VERIFIED + HYDRATED + AUTHORIZED for that audience. Real
delivery status. **Per-listing attribution**, since the universe mixes Mallan-authored and
third-party inventory — one blanket footer cannot be correct for both.

### PHASE 9 — CMA

Not another engine — CMA consumes corrected Search:
subject → comp criteria → candidate universe → broker include/exclude/reorder →
Closed/Pending/Active → adjustments → value range → report. The existing renderer becomes
the last step and stops treating the first row as the subject.

### PHASE 10 — CALCULATORS

Keep all six. One calculation-input contract: verified facts auto-fill, **unknown stays
blank**, agent assumptions marked as assumptions. Collapse the duplicate mansion-tax and
transfer-tax implementations to one. Separate buyer costs from seller costs.

### PHASE 11 — DEVICE PROOF

Only after the data contract is correct. 1440 / 1024 / 390 through
Search → Results → Detail → Map → Report → Send, testing touch targets, date picker,
selection, sort, filters, map, gallery, modal scrolling, calculator, report preview and
client send — with **the same criteria and the same result universe on all three**.

---

### DO NOT REMOVE

Map · Transportation **as a capability** · Reports · CMA · Calculators · Townhouse ·
Multi-Family · Building search · Advanced criteria · Media · Documents · Saved searches ·
Comparison · Client actions.

**Their current implementations need correction. The capabilities are right.** Only what is
provably misleading gets deleted.

---

## 11. WHAT I CHALLENGED IN MY OWN AGENTS' REPORTS

The subagent reports were **not** accepted as written. An adversarial pass re-checked 203
sampled claims and refuted 9. I then personally re-verified every claim this document acts
on. Three survived-the-verifier claims still failed when I checked them at source:

### A SIXTH failure — my own, and the third of its kind

**"Google is no longer named anywhere" / "removed from the architecture surfaces" was false
for the product.** My scan named its directories — `lib/search`, `lib/listings`, `lib/idx`,
`lib/compliance`, `tests/runtime` — and **excluded `public/crm`**, which is the only surface
a broker or client actually sees. `reports.js:1301` emails a `maps.google.com` link labelled
"Google Map", there is a `googleMapLink` report option, and `report-package.js` has three
more generators.

Three times now the narrow claim was accurate and the impression was broader than the check.
**Stating a scope does not make a claim true — it only makes the gap findable.** The
standing rule from here: if the claim is about the product, the scan covers the product.

### FIVE agent claims failed my own check

| agent claim | what I found at source | outcome |
|---|---|---|
| "718 controls, 186 reach the provider, 520 dead" | could not reproduce **any** of the three | **REMOVED.** Replaced with counts I re-ran: 1,101 / 831 / 421 |
| `#searchBasicModeRental` / `Building` "never rendered, never scanned" | **False.** `init-ui.js:34-39` converts their selects; `saved-searches.js:384,398` writes restore state into them | **REWRITTEN.** Sharper finding — a saved rental search restores into a hidden panel the collector never reads — and it made the proposed 1,250-line deletion **unsafe as written** |
| mansion tax "2.5% vs 2.25%, $17,500 on $7M" | **3.25% / 2.5% / flat 1%** across three files — **$112,500 spread on $5M** | **CORRECTED.** Larger than reported; the figures were wrong |
| "no responsive or viewport tests of any kind" | **False.** `listing-detail-mobile.spec.ts` runs at 390×844 | **CORRECTED** to the true, narrower claim: those specs target `/listing/${slug}` on the **public** site; `grep -rln "crm" tests/e2e/*.ts` returns nothing |
| Customize tab "only reaches CSV/Excel" | **False.** It IS called in the HTML builder at `reports.js:559` | **CORRECTED**, and the real mechanism is worse — assigned to `customFields`, which appears **once in the file**. Read and discarded |

### Claims I re-verified at source and confirmed

`charCodeAt(0)`-seeded arrivals (`pagination.js:2076`) · the "Live — MTA schedule data"
badge (`771`) · the commute address read only as a gate (`2232`) then a hardcoded Midtown
haversine (`2249`) · `(UCOM)` showing instruction (`526`) · twelve unbound amenity cards
(`643-654`) · seven fabricated `RLS-*` IDs carrying `data-source="REBNY-RLS"` (`7240`) ·
`toggleSortOrder` zero callers · `expandMedia:false`, no `expandCustomProperty` · the
200-row cap (`search-engine.js:508`) · `StoriesTotal`/`NumberOfUnitsTotal` present in
`SEARCH_SELECT_FIELDS` (`route.ts:48,50`) and absent from the mapper · Open House column
`locked: true` (`data-loader.js:131`) · `geocodeListings` imported only by
`app/api/listings/route.ts` and `[id]/route.ts`, never the CRM route · the spiral fallback
capped at `0.005°` (`results-map.js`) with a 9px "Approximate location" note (`282`) ·
`app/reports` absent behind "Shareable Link" · email writing `status: 'delivered'` with
`method: 'simulated'` (`reports.js:1892-1902`) · `report-package.js` 1,050 lines, zero
references · buyer/seller tax mixing (`workspace.js:3635-3636`).

### One code comment that understates its own behaviour

`results-map.js` caps the fallback radius at `0.005°` and comments *"Max radius ~0.005° ≈
2-3 blocks — tight enough to stay on land."* 0.005° of latitude is ~555 m — closer to **six
or seven** NYC short blocks. The comment reads as reassurance; the number does not support
it.

### The lesson

Seven investigators produced 268 findings. An adversarial pass refuted 9 of 203. **A third,
personal pass still found five more material errors — two of them the headline numbers.**

**Verify personally before deleting code on any single finding.** The aggregate picture held
up under all three passes; individual figures did not.

---

## 12. WHAT THIS AUDIT DOES NOT COVER

- The public consumer site (`app/search`, `/api/listings`) beyond the geocode comparison —
  it is zero-delta scope.
- Runtime behaviour. Every finding is a static read at this SHA. Nothing was rendered in a
  browser, and **no device was actually tested** — the device verdicts are read from CSS,
  inline geometry and the JS that writes it.
- 9 of 203 verified claims were **refuted** by the adversarial pass. Treat any single
  finding as needing confirmation before code is deleted on the strength of it; treat the
  aggregate as sound.
