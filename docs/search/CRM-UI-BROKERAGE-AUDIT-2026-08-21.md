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

## 10. CORRECTION MAP — ordered, bounded

Each step is independently shippable and independently verifiable. Nothing new is
introduced.

### STEP 0 — REMOVE WHAT IS FALSE (do first, no dependencies)

Not fixes — deletions. Each removes a statement the system cannot support.

| delete | file |
|---|---|
| the whole Transportation block + synthesized arrivals + commute calculator + the 92-entry inline station array | `pagination.js:760-783, 1901-2009, 2061-2131, 2238-2257` |
| `transit-search.js` (never script-tagged, absent from the built output) + `mta-stations-manhattan.json` | whole files |
| the 12 static building-amenity cards | `pagination.js:643-654` |
| the `(UCOM)` fabricated showing instruction → render `---` | `pagination.js:526` |
| the fabricated demo listing cards + `#resultsGridLegacy` (656 lines) | `search-form-and-results.html:7153-7821` |
| `#searchBasicModeRental` + `#searchBasicModeBuilding` (1,250 lines, 153 controls) | `search-form-and-results.html:963-2211` |
| the 180-entry unbound neighborhood tree + its cascade handler | `search-form-and-results.html:2862-3065`, `search-engine.js:1459-1490` |
| the 108 unbound advanced checkboxes — **including the agent-scoping and "RLS Participant Only" rows, which read as compliance controls** | `search-form-and-results.html` (11 blocks) |
| the Sale Investment Calculator panel (15 IDs, zero JS refs) | `search-form-and-results.html:3593-3719` |
| `report-package.js` (1,050 lines, zero callers) | whole file |
| "Shareable Link" tile + generator (copies a 404) | `reports.html:183-186`, `reports.js:2347-2366` |
| the 6 never-read + 3 validation-only report checkboxes | `reports.html:101-123` |
| the dead `href="#"` links in report Detail/Open House panels | `reports.js:1298, 1302, 1763` |
| the dead `responsive.css` blocks targeting an absent DOM | `responsive.css:15-30, 35, 41, 45, 50-56, 87, 102, 120-124, 151-153` |
| `toggleSortOrder()` — **or wire it (Step 2). Do not leave it unreachable** | `toolbar-functions.js:56-119` |

### STEP 1 — MAKE UNAVAILABILITY VISIBLE

One shared "unavailable" treatment, applied everywhere a placeholder is rendered today.
`--`, `---`, `$0` and `0%` must stop being indistinguishable from values. This is the single
change that stops the loop, because after it a dead control is visible to whoever ships it.

### STEP 2 — MAKE THE RESULT SET HONEST

- Report the **provider count**, not the slice size; one number, one source.
- Say the set is truncated when it is.
- Sorting re-queries the provider (`toggleSortOrder` already does it — wire it to the
  dropdown and the grid headers) **or** the UI stops claiming to sort the result set.

### STEP 3 — FIX MOBILE, IN THE ORDER THAT UNBLOCKS WORK

1. `liquid-theme.css` specificity — restore the 44px / 16px rules.
2. The date picker's clamp order (`date-range-picker.js:231`) — one-line fix, unblocks 16 controls.
3. Remove `thead/tbody { display: table }` — actively harmful, breaks tablet too.
4. Give List/Grid, Short Summary and Summary real mobile layouts, or hide the views that
   cannot have one.
5. Add the first viewport tests — there are none.

### STEP 4 — COLLAPSE THE DUPLICATES TO ONE

One mansion-tax implementation. One transfer-tax implementation. One geocode fallback
policy. Separate the **buyer's** costs from the **seller's** — a combined "Closing Costs
(NYC)" total is correct for nobody.

### STEP 5 — THEN, AND ONLY THEN, EXPAND THE DATA

This is where the existing defect register resumes: `CustomProperty` expand (D1–D3), then
Media as a real resource, then OpenHouse. **Expanding the data before Steps 0–2 just adds
more surfaces that can lie.**

---

## 11. WHAT I CHALLENGED IN MY OWN AGENTS' REPORTS

The subagent reports were **not** accepted as written. An adversarial pass re-checked 203
sampled claims and refuted 9. I then personally re-verified every claim this document acts
on. Three survived-the-verifier claims still failed when I checked them at source:

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
