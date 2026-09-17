# VALIDATOR AUDIT — Cotality-authority conformance

Contract state used throughout: `data/cotality-property-fields.live.json` pull **2026-09-05**, 757 Property fields; `data/cotality-enums.live.json` pull **2026-09-08** (this is what `COTALITY_CONTRACT_PULLED_AT` reports); `data/cotality-contract/contract.compact.json` 17 resources, Property 757 fields with `populated` / `filterable` / `rlsField` / `lookup` per field.

---

# 0. THE SPECIFIC QUESTION — `validate-rls-compliance.js:482`

```js
482:  const collectableBy = (data, bound, f) => f.startsWith('_') || SERVER_DERIVED.has(f) || bound.has(f) || new RegExp('data[.]' + f + '[ \\t]*=').test(data.raw);
```
Used at `:500` (is a rule *triggerable*) and `:504` (is a requirement *satisfiable*). The identical grep is also the Section-2 escape hatch at `:337`.

### 0.1 Are the five fields live Cotality fields?

**None of the five is a live Cotality field. All five are declared Mallan-internal keys.**

| key | `cotality-property-fields.live.json` | `contract.compact.json` `resources.Property.fields` | `MALLAN_INTERNAL_KEYS` |
|---|---|---|---|
| `MinLeaseMonths` | ABSENT | ABSENT | `lib/listings/mallan-form-contract.ts:77` |
| `LeaseType` | ABSENT | ABSENT | `lib/listings/mallan-form-contract.ts:77` |
| `FurnishedListPrice` | ABSENT | ABSENT | `lib/listings/mallan-form-contract.ts:76` |
| `FurnishedMinLeaseMonths` | ABSENT | ABSENT | `lib/listings/mallan-form-contract.ts:76` |
| `FurnishedMaxLeaseMonths` | ABSENT | ABSENT | `lib/listings/mallan-form-contract.ts:77` |

They are REBNY **obligations** (`lib/compliance/rebny-ucba-rules.ts:273-293` RENTAL-001 / RENTAL-002, `:436-447` FURNISHED-001) with **no provider field**. So the correct payload home is a Mallan bucket, not a provider-shaped top-level key — which is exactly what the rental form's `_unresolvedCotalityFacts` quarantine is (`RENTAL-FORM-REDESIGN.html:5732` and the doc block at `:5722-5732`). **This decides the fix: the behavioural replacement must inspect the nested Mallan bucket, not just the flat payload.**

### 0.2 What the grep makes possible — measured, not hypothetical

**The regex runs over `data.raw`, the ENTIRE FILE** (set at `:213`), not the collect function. In `RENTAL-FORM-REDESIGN.html`, `collectRentalFormData` occupies bytes 428282–459185 of a 556,951-byte file — **94.5% of the surface the regex searches is not the collect function.** Sale form: 38,911 of 796,399 bytes → **95.1% off-target.**

**False PASSES the pattern admits:**

1. **A comparison counts as a write.** `[ \t]*=` is satisfied by the first `=` of `===`. Two live instances today:
   - `RENTAL-FORM-REDESIGN.html:5922` `data.InternetAutomatedValuationDisplayYN = data.InternetEntireListingDisplayYN === false ? …`
   - `SALE-FORM-REDESIGN.html:7719` `if (data.InternetEntireListingDisplayYN === false) { … }`
   Both are *reads*; both satisfy `collectableBy`. Harmless only because a real assignment also exists.
2. **Any scope counts.** A `data.X =` in the hydrate/populate path, a modal handler, a dead `<script>`, or a never-called function passes. Today no rule field is satisfied *only* outside the collect function — but nothing prevents it and nothing would report it.
3. **Comments and string literals count.** `codeLines()` (`:126`) strips comments for Section 3/4, but `collectableBy` is given `data.raw` — unstripped.
4. **Left-unanchored substring.** `metadata.LeaseType =` or `formdata.MinLeaseMonths =` satisfy `data[.]…`. `f` is also interpolated unescaped into `RegExp`.
5. **It proves nothing about the VALUE.** `data.MinLeaseMonths = undefined` or `= ''` passes identically to a real collection.

**False FAILURES the pattern produces:**

6. **The form's own primary collection mechanism is invisible to it.** `RENTAL-FORM-REDESIGN.html:5738-5748` collects with `data[key] = field.value` where `key = field.id || field.name` — a runtime bracket write keyed by *control id*, never `data.<FieldName> =`.
7. **The architecturally correct home is invisible to it.** `data._unresolvedCotalityFacts.MinLeaseMonths = …` (`:5849`) does **not** match `data[.]MinLeaseMonths[ \t]*=`. Same for the other four (`:5829`, `:5835`, `:5841`, `:5855`).
8. `Object.assign(data, …)`, a `setField(data,'X',v)` helper, or `data\n  .X =` all fail.

### 0.3 The measurable damage this has already caused

Because #7 is a false failure, **the rental form carries five duplicate flat assignments that exist only to feed this grep**, each with a comment that says so:

```
5829: data._unresolvedCotalityFacts.FurnishedListPrice = parseFloat(data.rentalFurnishedRent || '') || null;
5830-5833: // REBNY conditional rule requires this fact to be COLLECTABLE by its requirement name
           // (RENTAL-001 / RENTAL-002 / FURNISHED-001). It is kept alongside the _unresolvedCotalityFacts
           // routing above, which records that no LIVE Cotality field is proven for it …
5834: data.FurnishedListPrice = parseFloat(data.rentalFurnishedRent || '') || null;
```
Same pairing at `:5835/:5840`, `:5841/:5846`, `:5849/:5854`, `:5855/:5860`. **The validator's implementation detail is now shaping production form code**, and it does so by re-emitting provider-*shaped* names at the top level of the payload — the precise pattern `mallan-form-contract.ts:45-49` says was removed on Maya's 2026-09-09 ruling.

### 0.4 None of the five has a bound control — the grep is the *only* thing satisfying them

| key | control | binding attribute | resolver verdict |
|---|---|---|---|
| `MinLeaseMonths` | `rentalMinLease` (`:1310`) | `data-cotality-field="LeaseTerm"` | Layer 1 → bound to **`LeaseTerm`**, not MinLeaseMonths |
| `LeaseType` | `rentalLeaseType` (`:1302`) | `data-mallan-field="LeaseType"` | Layer 0 → Mallan control |
| `FurnishedListPrice` | `rentalFurnishedRent` (`:1898`) | `data-mallan-ignore="true"` + `data-unresolved-cotality-field` | Layer 0 → Mallan control |
| `FurnishedMinLeaseMonths` | `rentalFurnishedMinMonths` (`:1902`) | same | Layer 0 |
| `FurnishedMaxLeaseMonths` | `rentalFurnishedMaxMonths` (`:1906`) | same | Layer 0 |

Measured across both submission forms, **20 REBNY rule-field satisfactions rest entirely on the source grep** (no bound control, not `_`-prefixed, not server-derived):

- `SALE-FORM-REDESIGN.html` (5): `Basement`, `ListAgentMlsId`, `ListingAgreement`, `ListingContractDate`, `TaxLot` — all LIVE fields.
- `RENTAL-FORM-REDESIGN.html` (15): `AssociationFee`, `AssociationFeeFrequency`, `Basement`, `ListAgentMlsId`, `ListPrice`, `ListingAgreement`, `ListingContractDate`, `LivingAreaUnits`, `TaxLot`, `WithdrawnDate` (LIVE) + the five MALLAN keys above.

### 0.5 The behavioural replacement

Replace the grep with **execution**, in a Jest/jsdom runtime test (not in the reporter, which must stay dependency-light):

1. `jsdom` loads `public/crm/RENTAL-FORM-REDESIGN.html` with `runScripts: 'dangerously'`.
2. Drive the form the way an agent would for each rule's `appliesWhen`: set the trigger controls (`rentalPropertyType`, `rentalFurnished`, `rentalOfficeRetailOwnership`, `rentalStatus`), and fill **every** control the rule's `requireFields` could plausibly come from with a distinctive sentinel (`"__RLS_PROBE__"` / `999901`), dispatching `change`.
3. Call `window.collectRentalFormData()` (and `collectSaleFormData()`).
4. Flatten the returned payload **including nested Mallan buckets**:
   ```js
   const flat = { ...payload, ...(payload._unresolvedCotalityFacts ?? {}) };
   // _unresolvedCotalityFacts entries may be raw values OR {concept, value} (see hydrate at :7238)
   ```
   Resolve each `{concept, value}` entry by its `concept`, since the bucket is **control-keyed, not concept-keyed** (`:5751-5766`).
5. Run the payload through the real server normalizer (`lib/crm/listing-form-mapping.ts` + `lib/compliance/normalizer.ts`) so server-derived fields (`PropertyType`, `PropertySubType`, `CommonInterest`, …) are proven produced rather than asserted by `SERVER_DERIVED.has(f)` at `:482`.
6. Assert per rule: for every `f` in `requireFields`, `f` is present in the normalized payload **and** carries the sentinel — i.e. it traces back to a real control, not a hardcoded default.
7. Feed the same payload through `liveEnumViolations()` (`lib/cotality/live-contract.ts:152`) so every emitted provider enum value is member-checked at the same time — which the current grep cannot do at all.

This flips all eight false-pass/false-failure classes at once, and it makes lines `5834 / 5840 / 5846 / 5854 / 5860` deletable: once the bucket is inspected, the five duplicate flat provider-shaped keys can be removed and the facts live only under `_unresolvedCotalityFacts`, where the architecture says they belong.

---

# 1. `scripts/validate-rls-compliance.js` (`npm run rls:validate`)

**1. WHAT IT CHECKS.** 10 sections over 5 CRM HTML surfaces: classifies every form control against `LIVE_PROPERTY_FIELDS ∪ MALLAN_INTERNAL_KEYS`, member-checks select/radio/checkbox values against live enums, asserts REBNY required + conditional rules are collectable, asserts the distribution-gate fields exist live, checks `RESO_FIELD_MAP` source==built, plus role-masking and viewer-lockdown greps.

**2. AUTHORITY TODAY — YES.** `:40 const liveContract = require(path.join(REPO_ROOT,'lib','cotality','live-contract'))`, consumed at `:46-49` (`LIVE_FIELDS`, `liveEnumMembers`, `isLiveMultiField`, `liveRlsListedMembers`). Rules from `:41`, Mallan keys `:42`, phantoms `:43`. **This is the best-wired validator of the five.** It does *not* read `lib/cotality/generated/contract.ts` or `data/cotality-contract/**` (see §5 below).

**Current result: `TOTAL: 0 ERRORS, 53 WARNINGS, 0 MISSING`, `UNKNOWN: 0`, `RESULT: PASS`, exit 0.**

**3. HARDCODED LISTS**

| line | literal | class | verdict |
|---|---|---|---|
| `:89` | `FORM_PREFIXES = ['sale','rental','bldg','search','oh','crm','comm']` | UI config | correct |
| `:90` | `RENTAL_ONLY = ['NetMonthlyRent','AvailabilityDate','LeaseType','MinLeaseMonths']` | **FIELD claim** | see Drift D1 |
| `:91` | `SALE_ONLY = ['FlipTax','FlipTaxType','FlipTaxRemarks','MaximumFinancingAmount','MaximumFinancingPercent','MaximumFinancingRemarks','PercentOfCommonElements','TaxDeductionPercent']` | **FIELD claim** | all 8 ABSENT from live, all 8 declared Mallan keys — accurate today, unverified structurally |
| `:93` | `SERVER_DERIVED = ['PropertyType','PropertySubType','CommonInterest','StructureType','View','BuildingFeatures','MoveInCosts','OngoingFees','TenantPays']` | **FIELD claim** | all 9 LIVE ✓ |
| `:95-98` | `SERVER_DERIVED_VALUES` — sale `PropertyType:['Residential','CommercialSale','Land']`, rental `['ResidentialLease','CommercialLease','Land']` | **ENUM claim** | all 5 are live PropertyType members ✓, but hardcoded rather than read from `classifyMallanPropertyType` (`lib/crm/listing-form-mapping.ts:104-117`) — a second source of truth for the server's own behaviour |
| `:99` | `CLOSING_ONLY_FIELDS` (10 names incl. `BuyerAgentRLSParticipantYN`) | **FIELD claim** | 9 LIVE; `BuyerAgentRLSParticipantYN` ABSENT-from-live but declared Mallan (`mallan-form-contract.ts:78`) ✓ |
| `:241` | `SKIP_VALUES = ['','Select','select','--','Choose','choose','All','Any']` | UI config | correct |
| `:242` | `YES_NO = [...]` | UI config | correct |
| `:385-393` | `GATE_FIELDS` — 7 field names | **FIELD/ENUM claim** | correct pattern: every entry is re-asserted against the live contract at `:405-408`; all 7 LIVE, `ComingSoon`/`Closed` are live StandardStatus members ✓ |
| `:400` | `MALLAN_ONLY_GATE_FACTS = ['_mallanPermission','_mallanIdxDisplay','owner_opt_out','participant_only','idx_display_yn']` | RULE/Mallan storage | correct |
| `:425` | `['ownerOptOut','participantOnly','idxDisplay','internetDisplayYN','ComingSoon']` | mixed — first 4 are Mallan DTO keys (correct); **`ComingSoon` is a live enum member literal** (correct value, but hardcoded rather than `liveEnumMembers('StandardStatus')`) |
| `:429` | `'SyndicateTo'` | FIELD claim | LIVE ✓ |
| `:526` | `['broker','agent','buyer','tenant','seller','landlord']` | UI config (Mallan roles) | correct |
| `:518-519` | `applySaleRoleMasking` / `applyRentalRoleMasking`, defaults `buyer`/`tenant` | UI config | correct |

**No retired status word appears anywhere in this file** — grep for `'ACTIVE'`, `COMING_SOON`, `OFF_MARKET`, `'UNKNOWN'`, `Cancelled` (two-L), `OffMarket`, `TERMINAL_STATUSES` returns **zero hits**. Clean on that axis.

**4. DRIFT ALREADY PRESENT**

- **D1 — `:90` `RENTAL_ONLY` contains `NetMonthlyRent`, which exists in NO authority.** Not in the 757 live Property fields, not in any of the 17 `contract.compact.json` resources, not in `MALLAN_INTERNAL_KEYS`. The validator's own Section-3 logic calls this class "neither a live Cotality field nor a declared Mallan-internal key" — it warns about the *alias* `NetRent → NetMonthlyRent` at Section 3 while silently hardcoding the same orphan name at `:90`. Corroborating evidence in the form itself: `RENTAL-FORM-REDESIGN.html:5780` `// "NetMonthlyRent" is not a Cotality field (live $metadata 2026-09-09)`. Inert today (no rule names it), but it is a phantom field name inside the validator.
- **D2 — `MALLAN_GROUPS` (`:138`) is module-level and never reset between files.** `passA_Discovery` (`:191-194`) accumulates radio/checkbox *group names* across all five files in `FILE_CONFIG` order. **Measured contamination, 2 real cases:** in `SALE-FORM-WITH-TOOLS.html`, groups `saleGuarantors` and `saleAttendanceType` are **not** marked Mallan in that file but are classified Mallan because `SALE-FORM-REDESIGN.html` (walked first) marked them. Section 1 picklist checking and Section 3 name-checking are silently skipped for those controls in the viewer.
- **D3 — Section 3's attribute scan is on retired attribute spellings only.** `:355` `content.matchAll(/data-(rls|reso|mallan)-field="([^"']+)"/g)` — it does **not** match `data-cotality-field`, the current spelling (`:132`, `:142`). Measured: `data-rls-field` count is **0** in all four form files; `data-cotality-field` count is 164/221/160/203. So the literal-claim check at `:358-360` runs against zero current bindings. The current-spelling names are checked only indirectly, via `resolveElement` on id/name-bearing controls (`:369`).
- **D4 — the `data-cotality-resource` attribute is ignored by every code path.** `RENTAL-FORM-REDESIGN.html:6435` declares `data-cotality-field="OpenHouseType" data-cotality-resource="OpenHouse"`. `resolveElement:142-143` reads only `data-cotality-field` and resolves it against **Property**, so `isCanonical('OpenHouseType')` is `false`. It does not error only because the element is inside a JS template literal (§6-V4).
- **D5 — a live enum field bound to a free-text number input, unchecked.** `RENTAL-FORM-REDESIGN.html:1310` `<input type="number" id="rentalMinLease" placeholder="12" data-cotality-field="LeaseTerm">`. `LeaseTerm` is a live **enum** with 26 closed members (`Daily … TwelveMonths … Weekly`); a typed `12` is not a member (`TwelveMonths` is). `lib/cotality/generated/contract.ts:4775` further records `LeaseTerm … populated: 0, rlsField: false` and `:2549` "REBNY-referenced 0". Section 1 checks only `<select>` options (`:276-292`) and `input[type=checkbox|radio]` values (`:294-316`) — **a text/number input bound to a closed enum is never value-checked, and `rebnyReferenceAdvisory` (`:256`) is only called from those two loops (`:280`, `:299`), so not even the advisory fires.**
- **D6 — UI configuration overrides Cotality authority for three live fields.** `INTERNAL_ONLY_IDS` is tested at `:146` (before `isCanonical` at `:147`) and at `:171` (before `isCanonical(remainder)` at `:173`). `data/mallan-form-ui-only-ids.json` contains `LeaseTerm`, `OwnerName`, `OwnerPhone` — all three are live Property field names. Consequence for `LeaseTerm`: `rentalLeaseTerm` (`RENTAL-FORM-REDESIGN.html`) offers `ShortTerm`, `Summer`, `MonthToMonth`, `SixMonths`, `LongTerm`; **`ShortTerm` and `Summer` are NOT live LeaseTerm members** (the live members are `ShortTermLease` and `Seasonal`). The validator emits only a WARN about the config entry, never about the values.
- **D7 — a bad enum claim in the alias config, hidden by two accidents.** `data/mallan-form-control-aliases.json:223 "PiedATerre": "BuildingFeatures"`. `BuildingFeatures` is a live 123-member multi-enum and **`PiedATerre` is not among them** (zero members match `/Pied/`). The alias never fires — `bldgPiedATerre`/`saleBldgPiedATerre` are diverted by the `bldg` branch at `:156-159`, and `PiedATerre` is *also* in `mallan-form-ui-only-ids.json:191`, which wins at `:171`. Dead config carrying a false enum claim, with **no diagnostic for the shadowing** (`PiedATerre` is the only id present in both files).
- **D8 — advisory, not drift:** 34 Section-1 warnings and 19 Section-3 warnings are all correctly derived from the contract (16 rejected alias targets naming fields that exist in no Cotality resource; 3 UI-only ids shadowing live fields). These are reported honestly. Worth noting they are non-blocking.

**5. CAN IT BE WIRED TO COTALITY? — Partly (it mostly already is).**
- `:90` `RENTAL_ONLY` / `:91` `SALE_ONLY`: these are **business scope** (which transaction a fact belongs to), not provider facts. They should be moved into `lib/compliance/rebny-ucba-rules.ts` as a per-rule `appliesToFormTypes` field, and each name asserted `isCanonical()` at load (which immediately catches D1). Breaks nothing; changes only where the list lives.
- `:95-98` `SERVER_DERIVED_VALUES`: import from `lib/crm/listing-form-mapping.ts` (`classifyMallanPropertyType` / `TYPE_ROWS`) instead of retyping, then member-check against `liveEnumMembers('PropertyType')` at startup. Safe.
- `:425` `'ComingSoon'`: replace with a `liveEnumMembers('StandardStatus').includes('ComingSoon')` guard so a provider vocabulary change surfaces as an error instead of silently making the grep meaningless.
- **D2** is a one-line fix (make `MALLAN_GROUPS` per-file). Would newly classify 2 controls in `SALE-FORM-WITH-TOOLS.html`; may surface new Section-1/3 findings — that is the point.
- **D3/D4**: add `data-cotality-field` to the `:355` regex and honour `data-cotality-resource` by widening `isCanonical` to a `(field, resource)` lookup over `contract.compact.json`'s 17 resources. **This will break the current green run**: `OpenHouseType` and the `BuildingFeatures` script-template bindings become visible. That is a true-positive unmasking, not a regression.
- **D5**: add a Section-1 rule — a control that is not a `select`/`radio`/`checkbox` bound to a field where `isLiveEnumField(f)` is a SHAPE MISMATCH error. Would newly fail on `rentalMinLease → LeaseTerm`.
- **D6/D7**: at load, error (not warn) when a `mallan-form-ui-only-ids.json` entry is a live field name, when an alias target is not a live enum member of the field it names, and when an id appears in both config files.

**6. VACUOUS / SOURCE-TEXT CHECKS**
- **V1 — `:482` and `:337`** — the grep. Covered in §0. Sections 2 and 7 both report PASS today; **that PASS is a statement about file text, not about any payload.**
- **V2 — Section 8 (`:513-537`) is 100% `raw.includes()`.** Every assertion is a substring test on the viewer HTML: `raw.includes('function applySaleRoleMasking')`, `raw.includes('VIEWER_VALID_ROLES')`, `raw.includes("'broker'")`, `raw.includes('isInsideSkipZone')`, `raw.includes('listing-agent-mask')`. **No masking behaviour is executed.** A file whose masking function exists but is never called, or is called after render, passes identically.
- **V3 — Section 4's browser-gate check (`:422-427`) is substring-anywhere.** Counts in `index-built.html`: `ownerOptOut` 12, `participantOnly` 17, `idxDisplay` 34, `internetDisplayYN` 17, `ComingSoon` 45, `checkListingCompliance` 18. With that density, the check cannot distinguish a working gate from a commented-out one.
- **V4 — controls inside `<script>` template literals are invisible to the DOM walk.** `passA_Discovery:196` walks `dom.querySelectorAll('input, select, textarea')`. Measured `data-cotality-field=` raw-text vs DOM-visible: sale 164 vs 162, rental 221 vs 219, sale-viewer 160 vs 159, rental-viewer 203 vs 202. The invisible ones are `BuildingFeatures` (×2 sale, ×1 rental) and `OpenHouseType` (×1 rental, `RENTAL-FORM-REDESIGN.html:6435`, inside the `addRentalOpenHouse()` template at `:6404-6445`). **Its 9 option values are never member-checked** — they happen to all be correct live `OpenHouse.OpenHouseType` members, but only 2 of the 9 (`Broker`, `Public`) are RLS-referenced, which is exactly what `rebnyReferenceAdvisory` exists to surface and cannot.
- **V5 — controls with neither `id` nor `name` are dropped without a count.** `:197-198` `if (!identifier || seen.has(identifier)) continue;`. Measured drops: sale 29, rental 27, sale-viewer 189, rental-viewer 40, **`index-built.html` 841**. None currently carries a binding attribute, but the silent discard is the mechanism by which V4's `OpenHouseType` would still be missed even if it were in the DOM.
- **V6 — Section 10 (`:562-582`)** — `raw.includes('data-rls-viewer="true"')` plus 4 regexes. Note it still enforces the **legacy `rls` attribute spelling** while the forms migrated to `data-cotality-*` on 2026-09-08.
- **V7 — `SERVER_DERIVED.has(f)` at `:482` is an unconditional pass for 9 fields**, on both forms, with no check that the form actually supplies the input the server derives from. `SERVER_DERIVED_VALUES` only constrains 3 of the 9; for `StructureType`, `View`, `BuildingFeatures`, `MoveInCosts`, `OngoingFees`, `TenantPays` the `if (producible && …)` guard at `:490-492` short-circuits on `undefined`.
- **V8 — Section 1 skips the search surface entirely** (`:274 if (config.category === 'search') continue`), so `index-built.html`'s 11 bound controls are never enum-checked.
- **V9 — the `data-mallan-ignore` / `data-mallan-field` escape hatch is total and unmeasured.** Layer 0 (`:141`) exits before any Cotality check. Counts: sale 390 + 41, rental 247 + 46, sale-viewer 248 + 41, rental-viewer 274 + 49. **D5 and D6 both live inside this exempt population** — `rentalLeaseType` (`:1302`, `data-mallan-field="LeaseType"`) and `rentalLeaseTerm` (`data-mallan-ignore="true"`, offering two non-member values). Declaring a control Mallan is currently a permanent, unreviewed exemption from every field and enum check.

**What green proves / does not (J.8):** `rls:validate` PASS proves the 1,900 id/name-bearing form controls resolve to *some* name in `LIVE_PROPERTY_FIELDS ∪ MALLAN_INTERNAL_KEYS`, that select/radio/checkbox option values on *bound* controls are live members, and that the 7 gate fields exist on the 2026-09-08 pull. It does **not** prove any payload is produced, any disclosure renders, any masking runs, that free-text-bound enum fields carry members, or that the ~980 Mallan-exempt controls are correct.

---

# 2. `scripts/validate-form-rls.js` (`npm run validate:form-rls`)

**1. WHAT IT CHECKS.** Regex-parses the two submission forms and their `collect*FormData` bodies; 4 checks (numbered 1, 3, 4, 5): element refs exist in HTML, bound fields are live/Mallan, picklist values are live members, no duplicate ids.

**2. AUTHORITY TODAY — YES, partially.** `:38 const liveContract = require(path.join(ROOT,'lib','cotality','live-contract'))`; `:42-44` additionally reads `data/cotality-contract/contract.compact.json` for `resources.CustomProperty.fields`; `:41` Mallan keys. Field existence `:48-50`, vocabularies `:52-59`.

**Current result: 1 WARNING, 7 PASSes, exit 0.**

**3. HARDCODED LISTS**
| line | literal | class |
|---|---|---|
| `:42-44` | resource whitelist: **`Property` + `CustomProperty` only** | **FIELD claim** — see Drift D9 |
| `:262` | `NATIVE_MEMBERS = ['push','length','forEach','map','filter','find','some','every','includes','indexOf','slice','splice','concat','join','split','trim','toLowerCase','toUpperCase']` | neither (JS heuristic) |
| `:35-36` | the two form paths | UI config |
| `:448`, `:455` | `'collectSaleFormData'`, `'collectRentalFormData'` | UI config |

No status literals. No enum literals.

**4. DRIFT ALREADY PRESENT**
- **D9 — the one warning it emits today is a FALSE POSITIVE.** `WARN bound field "OpenHouseType" is not a live Cotality field (Property / CustomProperty) nor a declared Mallan-internal key`. `OpenHouseType` **is** a live Cotality field: `contract.compact.json → resources.OpenHouse.fields.OpenHouseType`, `enum:"OpenHouseType"`, `lookup:9`, `filterable:true`, `populated:613`, `probeHttp:200`, `rlsField:true`. The HTML already declares the resource (`data-cotality-resource="OpenHouse"`, `RENTAL-FORM-REDESIGN.html:6435`); `:334` ignores that attribute and hardcodes a two-resource whitelist. The contract has **17 resources**.
- **D10 — the whole Cotality half of this validator is non-gating.** `criticalCount++` occurs at exactly two lines: `:319` (Check 1, element id missing from HTML) and `:402` (Check 5, duplicate id). Exit 1 is driven solely by `criticalCount` (`:468`). **Check 3 (`:344`) and Check 4 (`:366`, `:381`) — the only Cotality-authority checks in the file — increment `warnCount` only, and `:471-472` explicitly exits 0 on warnings.** It runs in CI (`.github/workflows/pr-check.yml:147`) and cannot fail on a Cotality violation.
- **D11 — "CHECK 2" does not exist.** Numbering at `:293`, `:329`, `:349`, `:393` is 1, 3, 4, 5. A check was removed without renumbering or a note; nothing records what it asserted.

**5. CAN IT BE WIRED TO COTALITY? — Yes, and it should be, or retired.**
- Read `data-cotality-resource` and resolve `(field, resource)` against all 17 resources in `contract.compact.json` (`:42-44` already loads the file). Fixes D9 outright.
- Promote Check 3 and Check 4 to `criticalCount`. **This is what makes the CI step mean anything.** Risk: currently 0 critical, so promotion after fixing D9 leaves it green — verify before flipping.
- **Honest alternative: delete it.** Check 3 is a strict subset of `rls:validate` Section 3 and Check 4 a strict subset of Section 1 (which additionally handles aliases, prefix-stripped ids and multi-enum shape). Only Check 1 and Check 5 add anything, and both are DOM hygiene, not compliance.

**6. VACUOUS / SOURCE-TEXT CHECKS** — this validator is **entirely** regex-over-source; it never builds a DOM and never executes anything.
- **V10 — Check 1 fails open.** `:154` `funcRegex = new RegExp('function\\s+' + funcName + '\\s*\\(\\s*\\)\\s*\\{')` requires a **zero-parameter** declaration. Add one parameter, or convert to `const collectSaleFormData = () => {…}`, and `funcFound` is false → `:297` emits a WARN → exit 0. The validator's central check silently stops running.
- **V11 — Check 4's coverage is far smaller than its PASS message.** It requires `el.rlsField && el.id` (`:356`) *and* `selectOptionValues.get(el.id)` to be non-empty; `selectRegex` at `:98` requires `id="` to appear inside the opening `<select …>` tag. Measured: sale form has 46 `<select>` (38 with an id, 24 with `data-cotality-field`); rental has 62 (51 / 27). The radio/checkbox branch (`:375-385`) requires `el.name`, so id-only checkbox groups are skipped. **`rentalMinLease → LeaseTerm` (D5) is skipped by both branches** — it is an `<input type="number">`, so it has no option values and is not a radio/checkbox. The message "All picklist values match RLS lookup values (or field has no lookup)" reports on a partial subset.
- **V12 — `extractCollectFormDataRefs` `dataRefRegex` (`:263-269`) treats every non-LHS `data.X` as an element id.** For `data._unresolvedCotalityFacts.MinLeaseMonths`, `m[1]` captures `_unresolvedCotalityFacts`, which is then Check-1-tested against HTML ids. It passes today only because `allElementIds`/`allIds` lookups miss it and it lands in `missingFromHTML`… which is empty in the output, meaning the capture is being swallowed by rule 1 (`dataKeys.has`) since `data._unresolvedCotalityFacts = {}` appears as an LHS at `:5732`. The behaviour is accidental, not designed.

---

# 3. `scripts/validate-rls-geo.js` (`npm run geo:validate`)

**1. WHAT IT CHECKS.** 13 checks on the neighborhood polygon set: canonical list ↔ GeoJSON name coverage (via aliases), duplicates, closed rings, NYC bbox, centroids, minified-file consistency, file-size caps, null-alias classification.

**2. AUTHORITY TODAY — NO. It does not import the live Cotality contract at all.** No `require` of `lib/cotality/live-contract`, `lib/cotality/generated/contract`, or `data/cotality-contract/**` anywhere in the file. It reads five local data files (`:33-37`).

Notably `:91` prints `'   RLS field: ' + (canonical._meta.rlsNeighborField || 'SubdivisionName')` — **the field name is read and displayed but never used for anything.**

**Current result: 13 PASS, 0 FAIL, 0 WARN, STRICT mode, exit 0.**

**3. HARDCODED LISTS**
| line | literal | class |
|---|---|---|
| `:40-45` | `NYC_BBOX {minLng:-74.30, maxLng:-73.65, minLat:40.47, maxLat:40.95}` | neither (geometry config) — correct |
| `:278` | `VALID_TYPES = ['subarea','micro-area','unbounded']` | Mallan taxonomy (RULE-ish) — correct to stay local |
| `:91` | fallback string `'SubdivisionName'` | **FIELD claim** — happens to be a live Property field ✓, but it is a hardcoded default for an unused value |
| `:33-37` | five file paths | config |

No status words, no enum members, no field lists.

**4. DRIFT ALREADY PRESENT**
- **D12 — the neighborhood vocabulary is 6 months stale and nothing detects it.** `data/rls/neighborhoods.v1.json._meta` = `{"source":"Trestle OData groupby(SubdivisionName)","trestleVerified":true,"generatedAt":"2026-03-03T14:09:58.544Z","count":674}`. The validator's strict mode is gated on that self-declared `trestleVerified:true` (`:89`) — **the file asserts its own trustworthiness, and the validator believes it.** There is no freshness check, no comparison against any current pull, and no `generatedAt` age limit.
- **D13 — no Cotality cross-check is possible from the committed contract, and this must be stated precisely.** `SubdivisionName` is `{"type":"Edm.String","enum":null,"multi":false,"lookup":null,"filterable":true,"populated":591607}` (`contract.compact.json`). `liveEnumMembers('SubdivisionName')` returns `null`; `data/cotality-contract/lookups.live.json` carries 241 Property lookup fields and **`SubdivisionName` is not among them**. So the committed contract holds no closed vocabulary for it — authority for "is this a real RLS neighborhood" is a **live `groupby(SubdivisionName)` query**, which is exactly what `_meta.source` says produced the 2026-03-03 file. I have not run such a query and make no claim about current live values.
- **No false drift found in the geo data itself** — checks 4–13 are real structural assertions and genuinely pass.

**5. CAN IT BE WIRED TO COTALITY? — Partly.**
- **Not from the committed contract** (D13). What *can* be added today, read-only: (a) a freshness gate — fail when `_meta.generatedAt` is older than N days, which would fire immediately at ~190 days; (b) assert `_meta.rlsNeighborField` is a live Cotality field via `isLiveCotalityField()` instead of printing it; (c) refuse `trestleVerified:true` unless a dated regeneration artifact accompanies it.
- **A real vocabulary check requires a live pull** — `npm run cotality:query -- query --resource=Property --filter="SubdivisionName ne null"` with `$apply=groupby((SubdivisionName))` — and then a committed dated artifact the validator can diff against. That is Class-B work under CLAUDE.md §J.4 and needs a live proof capture; it is not something the validator can do offline.
- Nothing breaks from (a)–(c) except that (a) is designed to turn the current green red until the list is regenerated.

**6. VACUOUS CHECKS**
- **V13 — Check 3's PASS message materially overstates coverage.** `[PASS] 3. All 674 canonical names covered (81 polygons + 593 aliases)`. Measured breakdown: **81 direct polygons, 578 covered only by an alias pointing at one of those same 81 polygons, 15 covered by an explicit `null` alias meaning *no polygon exists*.** `:127 if (val === null) return false; // explicitly distinct, no polygon — OK` — a name with no geometry counts as "covered". 88% of the canonical list has no geometry of its own, and 2% has none at all.
- **V14 — Checks 6, 7, 8 iterate `geojson.features` (81) only.** They say nothing about the 593 aliased names. Check 7's bbox test `break`s on the first out-of-bounds coordinate per feature (`:194`), so `outOfBounds` counts features, not coordinates, while `:201` prints it as if it were a coordinate count.
- **V15 — Check 6 conflates two failures.** A feature with a `MultiPolygon` geometry has `coordinates[0]` = a polygon, not a ring, so `coords[0].length < 4` may be false and `ring[0]` an array-of-coords rather than a coord pair — the `first[0] !== last[0]` test then compares arrays by reference and always reports "open". No MultiPolygon exists today; the check is fragile rather than currently wrong.
- **V16 — not in PR CI.** `geo:validate` appears only in `.github/workflows/crm-validate.yml:207`, not in `.github/workflows/pr-check.yml`.

---

# 4. `tests/runtime/rls-form-bindings-canonical.test.ts` + `rls-validator-canonical-reporter.test.ts` (`npm run test:rls`)

**1. WHAT THEY CHECK.** `rls-form-bindings-canonical.test.ts` exercises the reporter's exported `resolveElement` against ~20 hand-written HTML snippets. `rls-validator-canonical-reporter.test.ts` asserts — almost entirely by regex over the validator's own source — that the validator imports the canonical contracts and carries no CSV-derived tables, plus one spawn of the validator.

**2. AUTHORITY TODAY — INDIRECTLY.** `rls-form-bindings-canonical.test.ts:25` `require('@/lib/cotality/live-contract')` for `LIVE_PROPERTY_FIELDS`; `:26` the Mallan contract. `rls-validator-canonical-reporter.test.ts` imports **no** contract — it only asserts that *strings naming* the contract modules appear in the validator source (`:22-25`).

**Current result: 34 tests, 2 suites, all pass.** Run in CI by the blanket `npx jest --ci --forceExit` step (`.github/workflows/pr-check.yml:134`), even though `test:rls` is not invoked by name — worth correcting in `CLAUDE.md §J.6`, which states `test:rls` is not in PR CI.

**3. HARDCODED LISTS**
| file:line | literal | class |
|---|---|---|
| `bindings:42-50` | 7 `[html, field]` pairs: `saleBorough→CityRegion`, `saleMaintCC→AssociationFee`, `rentalBedrooms→BedroomsTotal`, `rentalDescription→PublicRemarks`, `saleOriginalPrice→OriginalListPrice`, `saleSoldPrice→ClosePrice`, `rentalAvailableDate→AvailabilityDate` | **FIELD claims** — all 7 targets LIVE ✓, and each is re-asserted `isCanonical()` at `:53`, which is the correct pattern |
| `bindings:59, 64` | `'BuildingHeating'` (asserted NOT canonical ✓), `saleBldgTaxLot→'BuildingTaxLot'` (Mallan key ✓) | FIELD claims, contract-checked |
| `bindings:75` | 7 UI ids | UI config |
| `bindings:79` | `['completelyFakeField','xyzNotARealField123']` | UI config |
| `bindings:84` | `data-cotality-field="StandardStatus"` | FIELD claim, LIVE ✓ |
| `bindings:90-91` | `'InternetEntireListingDisplayYN'` (LIVE ✓), `'FlipTaxType'` (Mallan key ✓) | FIELD claims |
| `bindings:94` | `LIVE_PROPERTY_FIELDS.size > 700` | threshold — see D14 |
| `bindings:101, 105, 120-121` | `≥200` aliases, `≥400` ui-ids, `≥150`/`≥200` `data-cotality-field=` occurrences | thresholds |
| `reporter:41` | 7 gate field names, asserted to appear as `field: 'X'` **in the validator's source text** | FIELD claim, but verified as *text*, not against the contract |
| `reporter:47` | `['SyndicateYN','IDXEntireListingDisplayYN','ParticipantOnlyYN']` | phantom list, **hardcoded here** rather than imported from `LEGACY_MALLAN_FORM_CONTROL_KEYS` (which has 8 members) |
| `reporter:58` | same 3-phantom regex, hardcoded | same |

No retired status words in either file.

**4. DRIFT ALREADY PRESENT**
- **D14 — thresholds instead of contract facts.** `bindings:94 expect(LIVE_PROPERTY_FIELDS.size).toBeGreaterThan(700)` passes at 757 and would still pass if the contract lost 56 fields. `:101/:105/:120/:121` are the same shape. None of these is an authority check.
- **D15 — the phantom list is duplicated and truncated.** `reporter:47` and `reporter:58` hardcode 3 of the 8 members of `LEGACY_MALLAN_FORM_CONTROL_KEYS` (`lib/compliance/legacy-form-keys.ts:10-19`: `IDXEntireListingDisplayYN`, `IDXAutomatedValuationDisplayYN`, `IDXParticipationYN`, `ParticipantOnlyYN`, `VOWEntireListingDisplayYN`, `VOWAutomatedValuationDisplayYN`, `VOWConsumerCommentYN`, `SyndicateYN`). The 5 VOW/IDX-participation phantoms are **not** covered by the test at `reporter:69-86`, even though it is titled "no runtime surface leans on the phantom distribution names". The file imports nothing from `legacy-form-keys.ts`.
- **D16 — the gate-field assertion at `reporter:41-43` is `expect(code).toContain("field: 'X'")`** — a substring test on the validator's source. It proves the literal is typed; it proves nothing about the contract. `validate-rls-compliance.js:405` already does the real check. Two mechanisms, one of which is theatre.

**5. CAN IT BE WIRED TO COTALITY? — Yes, cheaply.**
- Replace `bindings:94` and the four count thresholds with equality against the pull (`expect(LIVE_PROPERTY_FIELDS.size).toBe(757)` alongside `expect(COTALITY_CONTRACT_PULLED_AT).toBe('2026-09-08')`), so a contract regeneration is a deliberate, reviewed test edit.
- `reporter:47`/`:58`: import `LEGACY_MALLAN_FORM_CONTROL_KEYS` and iterate it. Nothing breaks; it broadens coverage to all 8.
- `reporter:41`: assert `liveEnumMembers`/`isLiveCotalityField` on the 7 gate fields directly instead of grepping for `field: 'X'`.
- **The high-value addition is the jsdom collect-execution suite from §0.5** — that is the natural home for it, and it is the only change that removes the `:482` grep.

**6. VACUOUS / SOURCE-TEXT CHECKS — this is the largest concentration in the set.**
- **V17 — `rls-validator-canonical-reporter.test.ts` is ~90% assertions about the validator's source text.** `:17-18` reads the script as a string; then `:22-28`, `:31-34`, `:37-39`, `:48-49`, `:113-120` are all `expect(code).toMatch(…)` / `not.toMatch(…)`. **These pass if the code is deleted and replaced by a comment containing the same words** — `:18`'s comment stripper only removes lines *starting* with `//`, `*`, `/*`, so a trailing comment survives into `code`. They pass if the imports are made and never used. They are refactor tripwires, not behaviour tests.
- **V18 — `:113` and `:120` assert the same `passAll` predicate twice** via two overlapping regexes; `:114`, `:117`, `:118` assert the *absence* of code that was already removed. Six assertions, one fact.
- **V19 — only `:99-111` executes anything.** It spawns the validator and greps stdout for `TOTAL: 0 ERRORS`, `UNKNOWN: 0`, `RESULT: PASS`, `Section  7: … PASS`, `REBNY contract \d+/\d+ collectable`. **`\d+/\d+` accepts `0/0`.** It is a smoke test that the reporter runs green — it inherits every blind spot in §1 and adds none of its own coverage.
- **V20 — `bindings:31-38`** asserts a deleted file stays deleted and that two scripts don't match a CSV regex. Historical hygiene, not behaviour.
- **V21 — `bindings:113-115`** asserts `data-rls-viewer="true"` appears in the viewer HTML — the same legacy-spelling substring test as V6.
- **What `bindings:41-96` *does* genuinely test:** `resolveElement` is exercised as a real function on real HTML. That is the one behavioural suite in the pair, and it is good. It covers ~20 of the ~1,900 controls.

---

# 5. `data/mallan-form-control-aliases.json` + `data/mallan-form-ui-only-ids.json` (UI configuration)

**1. WHAT THEY ARE.** `aliases` (232 entries) maps a form-control id (or prefix-stripped remainder) to the field it collects. `ui-only-ids` (619 entries) lists control ids that are UI, not facts. Both are consumed at `validate-rls-compliance.js:56-65` and `:146/:148/:149/:171/:174/:175`.

**2. AUTHORITY TODAY — validated against it, correctly, at load.** `:60` refuses a phantom target, `:61` accepts only `isCanonical(target)`, `:62` demotes everything else to a note. **216 of 232 aliases accepted; 16 rejected.** This is the right architecture: the config is Mallan's, and every target is checked against Cotality + the Mallan key list.

**3. CLASSIFICATION.** Every alias *target* is a **FIELD claim** and must come from Cotality (or be a declared Mallan key). Every alias *key* and every ui-only id is **UI configuration**.

**4. DRIFT ALREADY PRESENT**
- **D7 (repeated, highest-value here) — `aliases.json:223 "PiedATerre": "BuildingFeatures"` is a false ENUM claim.** The target field is live and the alias is *accepted* at `:61`, but `PiedATerre` is not one of `BuildingFeatures`' 123 live members. The load-time check validates the target field's *existence* and never the *value* the control would contribute. Dead today (double-shadowed, see §1 D7), latent if either shadow is removed.
- **D6 (repeated) — `ui-only-ids.json` declassifies 3 live Cotality Property fields:** `LeaseTerm`, `OwnerName`, `OwnerPhone`. Only `LeaseTerm` has consequences today (two non-member option values, §1 D6). `OwnerName`/`OwnerPhone` being unbound is very likely a deliberate PII decision — but "do not send owner PII to the provider" is a **rule**, and expressing it as a UI-id entry hides it from the rule files where it belongs.
- **D17 — `PiedATerre` is the only id present in both files**, and the reporter has no diagnostic for the collision. `INTERNAL_ONLY_IDS` silently wins at `:146` and `:171`.
- **D18 — 16 rejected alias targets name fields that exist in NO Cotality resource** (checked against all 17 resources in `contract.compact.json`), and are not Mallan keys: `DepositAmount` (×2: `Deposit`, `SecurityDeposit`), `NetMonthlyRent` (×2: `NetRent`, `MonthlyRent`), `PossessionDate`, `BuildingTotalNetSquareFootage` (×2), `NumberOfProfessionalUnitsTotal`, `NumberOfRetailUnits`, `AreaOverFAR`, `AreaUnderFAR`, `RentingAllowedYN` (×3), `ManagingAgencyListingYN`, `ManagementCompanyName`. The rejection is correct and reported (WARN), but the entries are still committed, still read every run, and produce 16 permanent warnings. `NetMonthlyRent` here is the same orphan hardcoded at `validate-rls-compliance.js:90` (D1).
- **No phantom targets** — 0 of 232 alias targets is in `LEGACY_MALLAN_FORM_CONTROL_KEYS`. **No duplicate ui-only ids.** Both clean.

**5. CAN IT BE WIRED TO COTALITY? — Yes.**
- Add a value-level check: when an accepted alias target is `isLiveEnumField(target)`, assert the alias key (and the bound control's option values) are live members of it. Catches D7 immediately.
- Make three conditions **errors**, not warnings: (a) a `ui-only-ids` entry that is a live Cotality field name (D6 — would fail on `LeaseTerm`/`OwnerName`/`OwnerPhone` until each is either bound or moved to `MALLAN_INTERNAL_KEYS` with a documented reason); (b) an id present in both files (D17); (c) an alias target in no authority (D18 — would fail on 16 entries until they are deleted or promoted to `MALLAN_INTERNAL_KEYS`).
- Nothing at runtime breaks; the CI signal turns red until the 20 entries are dispositioned. That is the intended effect.

**6. VACUOUS** — the configs themselves execute nothing; the vacuity is in §1 V9: a control declared Mallan is permanently exempt from every Cotality check, and these two files are the mechanism.

---

# CROSS-CUTTING SUMMARY

**The one defect that matters most:** `validate-rls-compliance.js:482` (and `:337`) decide REBNY collectability by grepping 557KB–796KB of file text for `data.<Field> =`. It has already changed production code — `RENTAL-FORM-REDESIGN.html:5834/5840/5846/5854/5860` are five duplicate flat assignments added, per their own comments, so the grep would find them, re-introducing provider-shaped top-level keys for five facts the contract proves are **not** Cotality fields (`mallan-form-contract.ts:76-77`). Twenty REBNY rule-field satisfactions across the two forms rest on this grep alone. The fix is behavioural: execute `collect*FormData()` in jsdom and inspect the returned payload **including `_unresolvedCotalityFacts`**, resolving its `{concept, value}` entries by `concept` — after which the five duplicate lines can be deleted.

**Hardcoded values that disagree with the live contract today:**
1. `validate-rls-compliance.js:90` — `NetMonthlyRent` in `RENTAL_ONLY`: exists in no Cotality resource and no Mallan key list.
2. `mallan-form-control-aliases.json:223` — `PiedATerre → BuildingFeatures`: not one of the 123 live members.
3. `mallan-form-ui-only-ids.json` — `LeaseTerm`/`OwnerName`/`OwnerPhone` declassify live Property fields; `rentalLeaseTerm` consequently offers `ShortTerm` and `Summer`, neither a live `LeaseTerm` member (live: `ShortTermLease`, `Seasonal`).
4. `RENTAL-FORM-REDESIGN.html:1310` — a `type="number"` input bound to `LeaseTerm`, a closed 26-member enum that `generated/contract.ts:4775` records as `populated: 0, rlsField: false`. No validator checks a free-text control against a bound enum.
5. `validate-form-rls.js:334` — a two-resource whitelist against a 17-resource contract, producing a false `OpenHouseType` warning while the HTML already declares `data-cotality-resource="OpenHouse"`.
6. `validate-rls-compliance.js:355` — the field-name-claim scanner still greps `data-(rls|reso|mallan)-field`, of which there are **zero** current instances; it never matches `data-cotality-field`, of which there are 748 across the four forms.
7. `validate-rls-compliance.js:138` — `MALLAN_GROUPS` leaks across files; measured: `saleGuarantors`, `saleAttendanceType` mis-classified in `SALE-FORM-WITH-TOOLS.html`.
8. `neighborhoods.v1.json._meta.generatedAt` = 2026-03-03 with self-asserted `trestleVerified:true`, ~190 days stale, no freshness gate.

**Zero drift found on retired status words.** `'ACTIVE'`, `COMING_SOON`, `OFF_MARKET`, `'UNKNOWN'`, two-L `Cancelled`, `OffMarket`, `TERMINAL_STATUSES` — **no hits** in any of the five validators or the two config files. The only StandardStatus literals present are `'ComingSoon'` and `'Closed'` (`validate-rls-compliance.js:392`, `:425`), both live members, and `:392` re-asserts them against the contract at runtime.

**Additional scanners that assert on source text rather than behaviour** (beyond the two already known): §1 V2 (Section 8, entirely `raw.includes`), V3 (Section 4 browser gate, substring density 12–45), V6 (Section 10), V17/V18/V20/V21 (~90% of `rls-validator-canonical-reporter.test.ts`, six assertions for one fact at `:113-120`), V10 (`validate-form-rls.js:154` fails open on any signature change), V13 (geo Check 3's PASS message covers 81 real polygons behind a "674 covered" headline).

**Files:** `C:/Users/MayaAllan/Desktop/mallan-nyc/scripts/validate-rls-compliance.js`, `.../scripts/validate-form-rls.js`, `.../scripts/validate-rls-geo.js`, `.../tests/runtime/rls-form-bindings-canonical.test.ts`, `.../tests/runtime/rls-validator-canonical-reporter.test.ts`, `.../data/mallan-form-control-aliases.json`, `.../data/mallan-form-ui-only-ids.json`, `.../public/crm/RENTAL-FORM-REDESIGN.html`, `.../lib/listings/mallan-form-contract.ts`, `.../lib/compliance/rebny-ucba-rules.ts`, `.../lib/cotality/live-contract.ts`, `.../lib/cotality/generated/contract.ts`, `.../data/cotality-contract/contract.compact.json`, `.../data/cotality-contract/lookups.live.json`, `.../data/rls/neighborhoods.v1.json`, `.../.github/workflows/pr-check.yml`. No file was modified.