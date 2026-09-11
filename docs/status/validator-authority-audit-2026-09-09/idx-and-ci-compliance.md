VALIDATOR AUDIT — 3 validators, read-only. Working tree was already dirty at baseline; the only thing my runs touched is disclosed at the end.

═══════════════════════════════════════════════════════════════
## A. `scripts/idx-validate.js` (`npm run idx:validate` — 40 sections)
═══════════════════════════════════════════════════════════════

**1. WHAT IT CHECKS.** 40 static-analysis sections over the repo: Trestle `$select` → mapper → Prisma → gates → DTO → frontend/CRM, plus cron, auth, security, Fair-Housing/UCBA presence, bloat and CRM DOM cross-references. Exit 1 on any CRITICAL.

**2. AUTHORITY TODAY — YES, partially.**
- `getLiveContract()` at `scripts/idx-validate.js:201-208` reads `data/cotality-property-fields.live.json` + `data/cotality-enums.live.json` (the dated pulls: fields 2026-09-05 / enums 2026-09-08, 757 Property fields, 241 enum fields).
- It is consumed by exactly **4 of 40 sections**: `:226` (§1), `:319` (§3), `:449` (§6), `:2012` (§39). The other 36 sections never touch the contract.
- It does **not** read `lib/cotality/live-contract.ts` or `lib/cotality/generated/contract.ts` (it is CommonJS; it reads the same JSON those modules read, which is equivalent for field/enum facts but **misses `data/cotality-contract/contract.compact.json`**, which is the only source carrying `filterable` / `probeHttp` / `populated`).

**3. HARDCODED LISTS.**

| file:line | contents (truncated) | class |
|---|---|---|
| `:212-213` `PHANTOM_PROVIDER_NAMES` | `IDXEntireListingDisplayYN, IDXAutomatedValuationDisplayYN, IDXParticipationYN, ParticipantOnlyYN, VOWEntireListingDisplayYN, VOWAutomatedValuationDisplayYN, VOWConsumerCommentYN, SyndicateYN` | **FIELD claim** — all 8 verified absent from the live contract. Correct today, but it is a hand-maintained negative field list; should be `!live.liveFields.has(name)`. |
| `:221-225` `expandFields` | `Media, MediaURL, MediaCategory, Order, PreferredPhotoYN, ShortDescription, DownPaymentAssistance{Amount,Count}, AdditionalFee, AdditionalFeeDescription, AdditionalFeeYN, FeeFrequency, CustomProperty, CustomFields` | **FIELD claim (mixed).** 8 of these are genuinely off-Property (`$expand` navigations) — correctly hardcoded because the pull only covers Property. But `DownPaymentAssistanceAmount` and `DownPaymentAssistanceCount` **are live Property fields** — see drift §4.2. |
| `:228` `systemFields` | `MlsStatus, StandardStatus, ListingKey, ListingId, ModificationTimestamp, SourceSystemKey` | **FIELD claim.** All 6 are live; the set exists only to grant `raw.X` a free pass. `MlsStatus` in particular is granted a pass despite being non-filterable and null-on-every-row. |
| `:287-295` `gates[]` | 3 Mallan-decision columns (`owner_opt_out`, `idx_display_yn`, `participant_only`) + 4 `Internet*` provider fields | **Correct split.** The 3 Mallan columns are decisions (rule/schema, correctly hardcoded); the 4 `Internet*` names are FIELD claims and all 4 are live. |
| `:449-460` (§6) `PropertyType` literals | `Residential, ResidentialLease, CommercialSale, CommercialLease, Land` | **ENUM claim — authority inversion.** See §6.3. |
| `:785-786` `publicWriteEndpoints` | 6 route paths | UI/route configuration. Fine. |
| `:856-866` `jurisdictions[]` | 9 `{name, regex}` Fair-Housing jurisdictions | **RULE** — correctly not from Cotality; but asserted as source text (see §6.5). |
| `:1004` `expectedIndexed` | `mls_id, status, property_type, list_price, bedrooms_total, neighborhood` | DB/schema config. Fine. |
| `:1143-1166` `knownMismatches` | 8 CRM↔API field-name pairs | Build/UI configuration. Fine. |
| `:1256-1257` `commonFields` | `View, AccessibilityFeatures, ExteriorFeatures, BuildingFeatures, LaundryFeatures, SecurityFeatures, DirectionFaces, Concessions` | **FIELD claim.** All 8 are live — but the block never executes (see §6.1). |
| `:1408-1417` `criticalFields[]` | 8 `{trestle, prisma, dto-regex, frontend-regex}` chain rows | **FIELD claim + vacuous** (see §6.4). |
| `:1437` `deadFields` | `CommonInterest, CeilingHeight, BuildingKeyNumeric` | **FIELD claim with drift** — `CeilingHeight` is NOT a live field (§4.3). |
| `:1705-1710` `searchCriticalFunctions` | 9 JS function names | UI configuration. Fine. |
| `:1797` `validTabs` | `sale, rent, building, cma` | UI configuration — **dead** (§6.1). |
| `:1826-1829` `resoStandardStatuses` | `Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn` | **ENUM claim.** Byte-for-byte equal to live `StandardStatus` today — but it is a second status authority, and it is **never evaluated** (§6.1). |
| `:1854-1857` `oldFormIds` | 14 DOM ids | UI configuration. Fine. |
| `:2020-2029` `localOnlyFields` | `OpenHouseOnly, GuarantorRequired, BoardApprovalRequired, PurchasingOptions, SubLettingAllowed, LeaseType, LeaseTerm, LeaseTermOptions, RLSParticipantOnly, AttendanceType, Building{Laundry,Pets,Pool,Security}*, BuildingRules, RentingAllowedYN` | **FIELD claim with drift** — `LeaseTerm`, `LeaseTermOptions` are live (§4.4). |
| `:2031` `searchSectionIds` | `generalSearchSection, comparablesSection, searchAdvancedMode, searchBasicMode` | UI configuration — but the window logic around it is the bug in §6.2. |
| `:2104-2111` `searchIds` | 24 DOM ids | UI configuration. Fine. |

**4. DRIFT ALREADY PRESENT.**

**4.1 — §39 is scoped so narrowly it inspects 2 of 193 `data-field` values, and 8 non-existent provider field names sit inside the blind spot.** `:2033-2041` does `html.substring(startIdx, startIdx + 20000)` for each of four section ids. `generalSearchSection` starts at char 107 510 and the next section id is at 255 872 — a ~148 000-char section of which 20 000 is read. Measured: the four windows contain **2 distinct `data-field` values** (`StandardStatus`, `CityRegion`); the file contains **193**. §39 reports `PASS — 2 data-field values are live Cotality fields`.
The following are `data-field` values **inside the search sections** (not the listing forms) that are **absent from the live contract** and invisible to §39:

| value | offsets | in section | live? |
|---|---|---|---|
| `CRM` | 171548, 239085 | generalSearchSection | no |
| `BuildingSmokeFreeYN` | 159594, 226124 | generalSearchSection | no |
| `MaximumFinancingPercent` | 172642, 175077, 240179, 242614 | generalSearchSection | no |
| **`NewConstruction`** | 176950, 177148, 177548, 244487 | generalSearchSection | **no — live name is `NewConstructionYN`** |
| `SponsorUnit` | 438341 | searchAdvancedMode | no |
| `PriceChangeDirection` | 481406 | searchAdvancedMode | no (live: `PriceChangeTimestamp`) |
| `KitchenCondition` | 498002 | searchAdvancedMode | no |
| `BathroomCondition` | 498766 | searchAdvancedMode | no |

`NewConstruction` vs live `NewConstructionYN` is precisely the one-character invented-field-name class §39 exists to catch.

**4.2 — `expandFields` (`:221-222`) claims `DownPaymentAssistanceAmount` and `DownPaymentAssistanceCount` are `$expand`-only.** Both are live **Property** fields on the 2026-09-05 pull. Effect: a `raw.DownPaymentAssistanceAmount` access is passed as “via $expand” instead of being checked against `$select`. Related: §3 currently reports `DownPaymentAssistanceYN` among 5 unclassified gaps — the same family, classified three different ways.

**4.3 — `deadFields` (`:1437`) contains `CeilingHeight`, which is not a live Cotality Property field.** Dead entry (`mapper.includes('CeilingHeight')` is false, so it silently no-ops). `CommonInterest` and `BuildingKeyNumeric` are live.

**4.4 — `localOnlyFields` (`:2020`) contains two live fields: `LeaseTerm` and `LeaseTermOptions`.** Both are on the live contract, so declaring them "not on Trestle — intentionally client-side only" is factually wrong. Currently harmless only because `:2054` tests `trestleFields.has(field)` **before** `localOnlyFields.has(field)`; it is a latent stale claim and it undercounts the `localCount` figure the section prints.

**4.5 — No retired status word anywhere.** I grepped: no `ACTIVE`, `COMING_SOON`, `OFF_MARKET`, `UNKNOWN`, or two-L `Cancelled` in this validator. The one status list (`:1826`) is spelled with one L and matches live exactly.

**5. CAN IT BE WIRED TO COTALITY? — Partly, and the remaining gap is small.**
- Already wired: §1, §3, §4 (transitively), §5 (Prisma), §39.
- **Straightforward:** replace `PHANTOM_PROVIDER_NAMES` (`:212`) with `!live.liveFields.has(n)`; drop the 2 live names from `expandFields` (`:221`); drop `CeilingHeight` (`:1437`); drop `LeaseTerm`/`LeaseTermOptions` (`:2020`); replace `resoStandardStatuses` (`:1826`) with `live.liveEnums.StandardStatus`; make §6's PropertyType assertion run in the correct direction (§6.3). Nothing breaks — each is currently agreeing with the contract except the four drift items above, which would surface as new WARNINGs.
- **Needs a new source:** anything about **filterability**. `data/cotality-contract/contract.compact.json` is plain JSON, `require()`-able from this CommonJS script, and carries per-field `{filterable, probeHttp, populated, rlsField}` (e.g. `MlsStatus → filterable:false, probeHttp:400`; `StandardStatus → filterable:true, probeHttp:200, populated:591607`). 221 of 757 Property fields are `filterable:false`. Wiring that in would let §39 distinguish "field exists" from "field is usable as an OData filter".
- **Cannot be wired:** §16-§19 (UCBA/FH/DOS/attribution obligations), §10-§15, §20-§26, §29, §31-§38, §40 — those are rules, build invariants or UI config and correctly stay out of Cotality.
- **Blocker to fixing §39 properly:** `searchSectionIds` + fixed 20 000-char windows must be replaced by real section-boundary extraction. Widening the window alone will pull in the listing-submission forms' 155 camelCase Mallan binding keys and produce a large false-positive WARNING; the fix needs a boundary walk, not a bigger number.

**6. VACUOUS / SOURCE-TEXT CHECKS.** (You said you'd already found two; there are more.)

1. **§28 item 4 — dead block** (`:1250-1264`). Guarded on `route.match(/odataSafe[^=]*=\s*new\s+Set\(\[([^\]]+)\]\)/)`. Neither `app/api/idx/search/route.ts` nor `app/api/listings/route.ts` contains `odataSafe` — verified false for both. The whole block, including `commonFields` (`:1256`), never runs and emits nothing.
2. **§37 item 3 — doubly dead** (`:1822-1850`). Guarded on `searchEngine.match(/statusMap\s*=\s*\{([^}]+)\}/)` — `public/crm/js/search/search-engine.js` has no `statusMap`, verified false. Even if it did, the checkbox regex is `data-field=["']MlsStatus["']\s+data-value=…` and `index-built.html` contains **0** `data-field="MlsStatus"` occurrences (it has 18 `data-field="StandardStatus"`). The hardcoded 11-member status set at `:1826` is never consulted. Zero pass, zero fail.
3. **§37 item 2 — silent zero** (`:1796-1810`). `data-show-on` appears **0 times** in `index-built.html`. `invalidShowOn.length === 0` and `showOnCount === 0`, and the `else if (showOnCount > 0)` guard means neither branch fires. `validTabs` (`:1797`) is dead.
4. **§37 item 5 — dead block** (`:1866-1888`). `SEARCH_SELECT_FIELDS` does not exist in `app/api/idx/search/route.ts` (verified false). Skipped silently.
5. **§6 status check — no longer asserts anything** (`:452-457`). It scans the mapper for `StandardStatus === '…'` / `StandardStatus eq '…'` literals. `lib/idx/trestle-mapper.ts` now uses `isCotalityStandardStatus(raw.StandardStatus)` (`:1024`) — zero literals — so `statusLiterals` is empty and the loop emits nothing. §6's 8 passes are: 1 count line, the 5 hardcoded PropertyType assertions, and 2 negative greps.
6. **§6.3 — authority inversion** (`:458-461`). `for (const val of ['Residential', …]) { if (picklists.PropertyType.has(val)) pass … else critical }` asserts that the **live contract contains a hardcoded list**. It never inspects the mapper. If Cotality retired a member, this reports the *contract* as the defect. It is a check on the data file, not on the code.
7. **§30 — source-substring, not a chain** (`:1408-1435`). `inMapper = mapper.includes('ListPrice') || mapper.includes('list_price')` is a whole-file substring test that a comment satisfies; `dto: /status/` and `frontend: /price/ | /beds/ | /baths/ | /sqft/ | /status/` are near-guaranteed hits in any listing DTO or page. All 8 rows pass unconditionally. The section title claims "Validates no field is lost or renamed incorrectly across the 5-step chain" — it validates that five substrings exist somewhere in three files. This is the exact FARE-Act failure shape from `CLAUDE.md` §F.
8. **§16 / §17 / §18 — source-text presence, not rendering.** `§16 :857` `/coming.?soon|comingSoon/i.test(listingPage)` — a comment satisfies it. `§17 :856-866` asserts nine regexes appear in `lib/compliance/rls-enforcement.ts` source; it never scans any text through the scanner. `§18 :883` `/IDXDisclaimer|idx.?disclaimer/i` — an import line or a comment satisfies it.
9. **Not run in CI.** `idx-validate.js` appears in **no** workflow. `.github/workflows/pr-check.yml` runs `rls:validate`, `ucba:audit`, `crm:test`, `validate:form-rls`, `ci-compliance-check.js`, `audit:display-compliance`, `build`. `idx:validate` is only in the local `npm run ci` script (`package.json:21`). None of the above gates a PR.

**Current output:** `1207 pass · 0 critical · 6 warning · 27 info` (§3 ×2, §21, §28, §38, §40).

═══════════════════════════════════════════════════════════════
## B. `scripts/ci-compliance-check.js` (`npm run compliance-check` — 95 BLOCKER+STRICT)
═══════════════════════════════════════════════════════════════

**1. WHAT IT CHECKS.** 28 numbered guards: no client-side Trestle, no `NEXT_PUBLIC_` secrets, canonical public projection + `checkDistributionGates` on public endpoints, no compensation fields, `escapeHtml` on email routes, agency/anti-discrimination/FARE disclosures, fail-open display-gate regression scan, CSP/HSTS, cron cadence + heartbeat contract, DOM tracker, retention, `MlsStatus` filter ban, mapper gate semantics, PII, Fair-Housing text scan, WCAG labels, schema/migration coupling.

**2. AUTHORITY TODAY — NO. It does not import the live Cotality contract at all.** Its only requires are `scripts/ci-compliance-check.js:14-16` (`path`, `fs`, `child_process`). Every Cotality mention in the file is a hardcoded string literal or a comment. Confirmed: no `require` of any `data/cotality-*` file, no reference to `lib/cotality/*`.

**3. HARDCODED LISTS.**

| file:line | contents | class |
|---|---|---|
| `:101` `TRESTLE_PATTERN` | `api.cotality.com \| api-trestle.corelogic.com \| api-prod.corelogic.com` | Endpoint config. Fine. |
| `:105` `IDX_IMPORT_UNSAFE` | allowlist `display-adapter`, `public-attribution` | Architecture rule. Fine. |
| `:128` `SECRET_PATTERN` | `NEXT_PUBLIC_.*(SECRET\|PASSWORD\|TOKEN\|CREDENTIAL\|API_KEY)` | Security rule. Fine. |
| `:143-146` `publicEndpoints` | 2 route paths | Route config. Fine. |
| **`:172` `COMP_PATTERN`** | **`/BuyerAgencyCompensation\|SubAgencyCompensation/`** | **FIELD claim — drifted. See §4.1.** |
| `:200-207` `trestleFallbackEndpoints` | 4 paths | Route config. Fine. |
| `:222-232` `LEAD_CAPTURE_FORMS` | 9 component paths | RULE surface list. Fine (rule side), see §6.6. |
| `:264-274` `PUBLIC_PORTAL_SCAN_ROOTS` | 9 directories | Scan scope. Fine. |
| `:280-303` `failOpenPatterns` | 4 `{name, regex}` over `internet_entire_listing_display_yn`, `idx_display_yn`, `internet_address_display_yn` | **Mixed.** The *semantics* (`=== false` is fail-open) are a RULE — correctly hardcoded. The *column/field names* are FIELD claims; all 4 `Internet*` names are live and the 2 snake_case ones are Mallan columns. Correct today. |
| `:308` `CANONICAL_GATE_PATTERN` | 8 helper names | Architecture rule. Fine. |
| **`:514-515`** | `MlsStatus eq` regexes | **FIELD/BEHAVIOUR claim — hardcoded AND broken. See §4.2.** |
| `:528-535` `deadFields` | `raw/normalized.ParticipantOnlyYN`, `.IDXParticipationYN`, `.IDXEntireListingDisplayYN` | **FIELD claim.** All 3 verified absent from the live contract — correct, but it is a **3-name subset** of idx-validate's 8-name `PHANTOM_PROVIDER_NAMES`. Two divergent hand-maintained phantom lists. |
| `:550-554` Gate-0 shape regexes | `enumValueTokens('Permission', raw.Permission)`, `every(t => t === 'IDX')`, retired-arm regex incl. `'Private'`, `'OwnerOptOut'` | **Mixed.** `Permission` is live and `IDX`/`Private` are live members (`Permission` publishes 18 members incl. `IDX`, `Private`, `VOW`, `SyndicateOptOut`). `OwnerOptOut` is correctly identified as **not** a live member. The interpretation is a RULE; the member spellings are ENUM claims that should resolve through `liveEnumMembers('Permission')`. |
| `:586-589` `idxPlusPrefilterViolations` + `:604`, `:610` | 4 `Internet*DisplayYN` names | **Mixed.** The pre-filter asymmetry is a RULE (the 2026-04-30 incident). All 4 names are live. Correct today. |
| `:615-622` `LEAD_FORMS_REQUIRING_NOTICE` | 6 paths | RULE surface list. Fine. |
| `:656` `NEIGHBORHOOD_DATA_GLOB` | 5 borough JSON paths | **RULE surface list with a gap — see §4.3.** |
| `:657-671` `FH_CRITICAL_TERMS` | 13 regexes: `good schools, strong schools, top-rated schools, prime school districts, perfect for families, family-friendly, no children, young professionals only, no section 8, no vouchers, no welfare, criminal record, ex-con` | **RULE — correctly not from Cotality, but wrongly hand-copied. See §4.3.** |
| `:710-723` `FORMS_TO_CHECK` | 12 paths | RULE surface list. Fine. |
| `:788-792` `FARE_SURFACES` | 3 paths | RULE surface list. Fine. |

**4. DRIFT ALREADY PRESENT.**

**4.1 — `COMP_PATTERN` (`:172`) names a phantom and misses every live compensation field.** Verified against the 2026-09-05 pull:
- `BuyerAgencyCompensation` — **NOT on the live contract.** It is a retired pre-NAR-settlement RESO name, carried in `lib/compliance/rebny-ucba-rules.ts:170-175 removedFields`, `lib/compliance/dto.ts:83-88 REMOVED_FIELDS` and `lib/listings/mallan-form-contract.ts:78`. Scanning `app/api/**` for it cannot catch a leak of feed data.
- `SubAgencyCompensation` — live. ✓
- **Live compensation fields the pattern does not mention:** `BuyerBrokerageCompensation`, `BuyerBrokerageCompensationType`, `SubAgencyCompensationType`, `TransactionBrokerCompensation`, `TransactionBrokerCompensationType`, `LeaseRenewalCompensation`, `CompensationComments`, `ConcessionsBuyerBrokerFee`.
  `BuyerBrokerageCompensation` is the live field that actually carries buyer-broker compensation post-settlement. A route adding it to a public response passes this check.
  Severity is moderated today only because `config/idx/property-field-coverage-policy.json:287-288, 326, 329, 392, 429-432` classifies all of them `not_in_idx_plus_scope` / `legacy_field`, so the mapper does not select them — the guard is the last line, and the last line is looking for the wrong names.
  Note the same 2-name/4-name gap exists in the *canonical rule files* (`rebny-ucba-rules.ts:170`, `dto.ts:83`), so this is not only a validator defect.

**4.2 — §17 "No MlsStatus in Trestle `$filter`" reports PASS while a live `MlsStatus eq` filter exists in the repo.** This is the highest-value finding in this file.
`app/api/market/route.ts:238`:
```js
$filter: `(MlsStatus eq 'Closed' or StandardStatus eq 'Closed') and ${propertyClass} and CloseDate ge ${periodStartISO}${boroughFilter}`,
```
Both §17 regexes (`:514-515`) fail on it, verified by executing them against the file:
- `/["'`][^"'`]*\$filter[^"'`]*MlsStatus eq/` → **false** (the `$filter` key is *outside* the template literal, so the required opening quote can never precede it).
- `/["'`][^"'`]*MlsStatus eq [^"'`]*["'`]\s*[,}]/` → **false** (the very next quote after `MlsStatus eq ` is the `'` opening `'Closed'`, and `\s*[,}]` cannot match the `C`).
- naive `/MlsStatus eq/` → **true**.
Per the validator's own comment and per `data/cotality-contract/contract.compact.json` (`MlsStatus: filterable:false, probeHttp:400`) and `lib/search/canonical/field-registry.ts:136` (`filterable: 'unsupported'`, "Provider-suppressed: NOT $filter-able (HTTP 400)"), that request 400s at the provider. `app/api/market/route.ts:248` then does `if (closedRes.ok)` with no else — so `trestleClosed` stays `[]` and the closed-sales fallback silently contributes nothing to the market medians. The catch at `:252` logs only network throws, not a 400.
Scope gap on top of that: §17 scans `findFiles(ROOT/'app/api', '.ts')` only. `$filter` strings are also built in `lib/buildings/building-address-filter.ts`, `lib/buildings/public-building-data.ts`, `lib/idx/fetch.ts`, `lib/idx/cursor/keyset-cursor.ts` — none scanned. I swept `app/` + `lib/` for all 221 `filterable:false` Property fields used with an OData operator: **exactly one hit, the market route above.**

**4.3 — Fair-Housing scan runs 13 of 116 canonical terms, over 5 of 6 data files.**
`FH_CRITICAL_TERMS` (`:657-671`) is a third, divergent copy. The canonical authorities are `data/compliance/prohibited-terms.json` (**10 categories, 116 terms**, loaded by `lib/compliance/rls-enforcement.ts:27,120` into `FAIR_HOUSING_HARD_BLOCKS`) and `lib/compliance/rebny-ucba-rules.ts:746-754 fairHousingProhibitedTerms` (34 terms). Divergence measured both ways: `good schools`, `strong schools`, `criminal record`, `ex-con` are in the CI copy but **not** in `prohibited-terms.json`; 103 canonical terms are **not** applied to the neighborhood files. `NEIGHBORHOOD_DATA_GLOB` (`:656`) also omits `data/neighborhoods.json` (22 KB, self-marked `_deprecated` — still on disk, still unscanned).

**4.4 — No retired status word.** No `ACTIVE`/`COMING_SOON`/`OFF_MARKET`/`UNKNOWN`/two-L `Cancelled` anywhere in this file. `StandardStatus` appears only in comments.

**5. CAN IT BE WIRED TO COTALITY? — Yes, and it is a two-line change to get the authority in.**
The three JSON sources are plain JSON and directly `require()`-able from this CommonJS script — no TS interop, no build step:
```js
const liveFields = new Set(require('../data/cotality-property-fields.live.json').fields);
const liveEnums  = require('../data/cotality-enums.live.json');
const compact    = require('../data/cotality-contract/contract.compact.json'); // .resources.Property → {filterable, probeHttp, populated}
```
Specific changes:
- **§6:** derive the compensation field set from the live contract (`[...liveFields].filter(n => /Compensation|BuyerBrokerFee/.test(n))` → 9 names today) instead of `COMP_PATTERN`; keep "must not appear in a public response" as the rule. **Would break:** nothing in `app/api/**` today (verified — no route references any of the 9). Would newly fail if a route re-adds one.
- **§17:** iterate the 221 `filterable:false` Property fields from `contract.compact.json` and scan `app/api/**` **plus** `lib/**` for `<Field> <odata-op>`. **Would break:** `app/api/market/route.ts:238` fails immediately — which is correct, that filter is broken in production today.
- **§18 `deadFields`:** replace with `!liveFields.has(name)` and share one phantom set with `idx-validate.js`. **Would break:** nothing; it would additionally cover the 5 phantom names idx-validate knows and this file does not.
- **Gate-0 `Permission` members (`:550-554`):** assert `'IDX'` and `'Private'` against `liveEnumMembers('Permission')` and assert `'OwnerOptOut'` is *not* a member. **Would break:** nothing today.
- **§21 Fair Housing:** `require('../data/compliance/prohibited-terms.json')` and scan all 116 terms across all 6 neighborhood JSONs. **Would break:** unknown until run — this is the change most likely to surface real content violations, and it should be staged (run once at MEDIUM before promoting to BLOCKER).
- **Correctly stays hardcoded:** every disclosure surface list (`:222`, `:615`, `:710`, `:788`), the fail-open regex *semantics* (`:280`), the IDX-Plus pre-filter asymmetry (`:586`), CSP/HSTS, cron cadence and heartbeat contract, CAN-SPAM, DOM tracker, retention, WCAG, schema/migration coupling. None of these exists in the feed and none may be derived from it.

**6. VACUOUS / SOURCE-TEXT CHECKS.**

1. **§17 passes over a real violation** — see §4.2. Not merely source-text: the regex is wrong for the *only* code shape this codebase uses (object literal key + template literal value).
2. **§9 / §19 / §24 (agency disclosure, §175.28 notice, FARE Act)** — `:233`, `:626`, `:794` are `fileContains(full, /AgencyDisclosure|DOS-1736|…/i)` over component source. An import line, a commented-out block, or a string in a disabled branch satisfies each. `CLAUDE.md` §F names this exact failure: the 2026-05-20 audit found the FARE grep green while the conditional did not render on production rentals. `:794`'s alternation includes `moveInCosts` and `tenantPaysDescription`, so a prop name alone is sufficient. None of these three is a rendering proof.
3. **§14 (DOM tracker)** — `:531` is `fs.existsSync('lib/compliance/dom-tracker.ts')`. An empty file passes.
4. **§13 (CAN-SPAM)** — `:546` matches `/unsubscribe/i` inside the `FOOTER` template literal. A commented-out unsubscribe line passes.
5. **§7 (`escapeHtml`)** — `:190` also passes when `!rel.startsWith('app')`, i.e. any non-`app/` path is auto-passed regardless of content. Every file it scans comes from `findFiles(ROOT/'app/api')`, so the escape hatch is currently unreachable — but it is written as an unconditional pass.
6. **§22 (agent PII)** — `:698-701` are four exact-shape regexes (`phone\s*:\s*a\.phone`, `select\s*:\s*\{[^}]*phone\s*:\s*true`). Renaming the destructured row from `a` to `agent`, or spreading the row, defeats all four silently.
7. **§20 (open-house misattribution)** — `:684` matches the literal `agentName: (prop.ListOfficeName as string) || 'Mallan Real Estate Inc.'`. Any whitespace, cast or variable-name change makes it pass.
8. **§10b `CANONICAL_GATE_PATTERN` (`:308-312`)** — a file that merely *mentions* any of the 8 helper names is excluded from the ad-hoc-gate check entirely, including in a comment.
9. **§25 (schema/migration coupling)** — `:816` compares `origin/main..HEAD`; on a clean `main` `diffFiles` is empty and it passes with `no diff vs base`. That is its behaviour on every local run.
10. **§28 (PR claim)** — `:876` returns immediately unless `--pr` is passed; never runs in CI.

**Current output:** `95 passed, 0 failed, 0 warn, 0 unverified`.

═══════════════════════════════════════════════════════════════
## C. `scripts/ci/check-crm-build.mjs` (`npm run crm:check-build`)
═══════════════════════════════════════════════════════════════

**1. WHAT IT CHECKS.** One build invariant: `public/crm/index-built.html` is byte-identical to what `node public/crm/build.js` produces from `public/crm/{index.html, css/, html/, js/}`. sha256 compare, restore-original, exit 0/1/2.

**2. AUTHORITY TODAY — NO Cotality import, and correctly so.** It contains no field names, no enum members and no status words. It is a pure generated-artifact drift guard (`CLAUDE.md` §J.6 Class E).

**3. HARDCODED LISTS — none.** The only constants are three paths (`:29-31`). All correctly hardcoded build invariants; none is a field, enum or rule claim.

**4. DRIFT — none possible.** Nothing in this file can disagree with the live contract.

**5. CAN IT BE WIRED TO COTALITY? — No, and it should not be.** It answers "is the bundle in sync with its sources", which is orthogonal to provider truth. Wiring Cotality into it would be a category error. (The Cotality-shaped question about `index-built.html` — do its 193 `data-field` values name live fields — belongs to `idx-validate.js` §39, which is where the §A.4.1 defect lives.)

**6. VACUOUS CHECKS / OTHER ISSUES.**
1. **Not vacuous, but not read-only.** `:44` runs `build.js`, which **overwrites the tracked file** `public/crm/index-built.html`, then `:59` restores it. Verified `build.js` is deterministic (no `Date`, `random`, `uuid`, `toISOString` — 108 lines, pure file concatenation), so the compare is sound. But the restore only happens on the normal path (`:59`) and in the `catch` (`:46`). If `readFileSync` at `:53` throws (build.js deleted or truncated the target), or the process is killed between `:44` and `:59` (SIGINT, OOM), the rebuilt bytes stay on disk. The docstring's "non-destructive" claim holds for clean exits only.
2. **Coverage boundary worth stating.** `build.js` inlines only files that `index.html` explicitly references (`:43` css `<link>`, `:62` `<!-- @include -->`, `:73` `<script src="js/…">`). A source file under `public/crm/js/**` that nothing in `index.html` references produces no drift and this guard passes. It proves `index-built.html === build(index.html + referenced sources)`, **not** "every CRM source is represented in the bundle".
3. **Correctly wired in CI.** `.github/workflows/guardrails.yml:25`, on `pull_request` and `push: main`. Note it runs *before* `npm ci` (`:28`) — fine, since `build.js` uses only `fs`/`path`.

═══════════════════════════════════════════════════════════════
## D. CROSS-CUTTING
═══════════════════════════════════════════════════════════════

**D.1 — Which hardcoded list is a FIELD/ENUM claim vs a genuine rule, per your split.**

*Must resolve through Cotality (currently hardcoded):*
`idx-validate.js:212` phantom names · `:221` expandFields (2 wrong) · `:228` systemFields · `:449` PropertyType members · `:1256` commonFields · `:1408` criticalFields Trestle names · `:1437` deadFields (1 wrong) · `:1826` StandardStatus members · `:2020` localOnlyFields (2 wrong).
`ci-compliance-check.js:172` COMP_PATTERN (1 phantom, 7 live names missing) · `:514-515` MlsStatus filterability · `:528` deadFields · `:550-554` Permission member spellings · `:586,604,610` Internet* names.

*Genuine rules / build invariants — correctly hardcoded:*
`idx-validate.js:287` Mallan decision columns · `:856` FH jurisdictions · `:1004` index expectations · `:1143` CRM↔API pairs · `:1705`/`:1797`/`:1854`/`:2104` DOM/UI config.
`ci-compliance-check.js:101,105,128` security/architecture · `:143,200` route lists · `:222,615,710,788` disclosure surfaces · `:264,280,308` fail-open semantics · `:656-671` FH obligation (right category, wrong copy — should read `data/compliance/prohibited-terms.json`) · cron cadence, heartbeat, CAN-SPAM, retention, WCAG, schema coupling.
`check-crm-build.mjs` — entirely build invariant.

**D.2 — Two divergent phantom-field lists.** `idx-validate.js:212` (8 names) and `ci-compliance-check.js:528` (3 names) both encode "never a Cotality field" and disagree. Both should derive from `!liveFields.has(n)`.

**D.3 — Ranked drift, highest value first.**
1. `ci-compliance-check.js:514-515` PASSES over a live `MlsStatus eq 'Closed'` OData filter at `app/api/market/route.ts:238` that 400s at the provider and silently zeroes the closed-sales fallback. *(regex proven non-matching by execution)*
2. `idx-validate.js:2033-2041` §39 inspects 2 of 193 `data-field` values; 8 non-existent provider names sit in the blind spot, including `NewConstruction` vs live `NewConstructionYN`.
3. `ci-compliance-check.js:172` compensation guard names a phantom (`BuyerAgencyCompensation`) and omits all 8 live compensation fields incl. `BuyerBrokerageCompensation`. Same gap present in the canonical `rebny-ucba-rules.ts:170` / `dto.ts:83`.
4. `ci-compliance-check.js:656-671` FH scan runs 13 of 116 canonical terms over 5 of 6 files.
5. `idx-validate.js:221` misclassifies live `DownPaymentAssistanceAmount` / `DownPaymentAssistanceCount` as `$expand`-only.
6. `idx-validate.js:2020` marks live `LeaseTerm` / `LeaseTermOptions` as "not on Trestle" (latent — precedence saves it today).
7. `idx-validate.js:1437` `CeilingHeight` is not a live field (dead entry).

**D.4 — Coverage gap independent of drift.** `idx-validate.js` gates **no** PR — it is in no workflow (`pr-check.yml` runs `rls:validate`, `ucba:audit`, `crm:test`, `validate:form-rls`, `ci-compliance-check.js`, `audit:display-compliance`, `build`; `guardrails.yml` runs `guardrails.mjs`, `check-crm-build.mjs`, `type-check`, `lint`). All 40 sections — including the only ones wired to the live contract — are advisory today.

**D.5 — What each green result proves, and does not** (per `CLAUDE.md` §J.8).
- `compliance-check` 95/95 proves 95 static source-text predicates hold. It does **not** prove any disclosure renders, does **not** prove any field is live on Cotality (it never reads the contract), and — demonstrated above — does **not** prove no `MlsStatus` filter exists.
- `idx:validate` 0-critical proves the mapper's 352 field names and its `$select`/gate/Prisma wiring are consistent with the 2026-09-05/09-08 pulls (§1-§5 are genuinely wired). It does **not** prove the CRM's `data-field` values are live (§39 saw 2 of 193), and does **not** prove any chain reaches the frontend (§30 is substring-only).
- `crm:check-build` PASS proves the bundle equals a rebuild from its referenced sources. It proves nothing about field names, enums or compliance.

**Disclosure — repo state.** Running `idx-validate.js --section N` writes a *partial* payload to the tracked file `public/crm/data/validator-results.json` (the write block at the end of the script runs on every invocation, filtered or not, and it is not gated by `--section`). My `--section 5` run left it holding 2 sections. I restored it by re-running the full validator, so it now holds the normal 41-section snapshot (`1207 pass · 0 critical · 6 warning`). That file was already modified relative to HEAD before I started, so I did not `git checkout` it. Nothing else was written to the repo; `check-crm-build.mjs` was **not** run (it mutates a tracked file by design). The only file I created is `<scratchpad>/scan_nf.cjs`.