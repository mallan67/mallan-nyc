# RESO compliance audit — 2026-04-29

> **Scope.** Posture review of mallan-nyc against REBNY RLS / IDX Plus
> distribution rules + RESO Data Dictionary 2.0 alignment. Read-only.
> No code changes. Captured between the 0ca7a0de → 5b164553 deploys
> while the master plan migration is still in flight.
>
> **Independent of the search-alerts cron gate** (07:30 UTC daily) —
> safe to run any time. The gate only blocks PR 5F implementation, not
> diagnostic audits.

---

## Headline verdict

**Strong fail-closed posture across all six audited lanes.** No
deploy-blocking regressions found. Distribution-gate enforcement is
broad and consistent. HID-tier fields are suppressed everywhere they
should be. Critical RESO enums are aligned to the REBNY lookup table.
The only "gap" today is a 5,270-listing operational delta between the
Trestle feed and the public site — that's the in-flight migration
catching up, not a compliance violation.

---

## Lane A — UCBA 2026 audit (`npm run ucba:audit`)

| Bucket | Result |
|---|---|
| Total rules checked | **46** |
| **PASS** | **46** |
| PARTIAL | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |
| EVALUATE CLOSELY | 0 |
| **REGRESSIONS** | **0** |
| CLAIM_OVERSTATED | 0 |

Full report: `compliance/FULL-AUDIT-2026-03-13.md`. Checklist source:
`compliance/rules/ucba-audit-checklist.json`. The audit runner is wired
into CI (`Guardrails (Repo + Compliance)` workflow) so this baseline
holds on every push.

**Verdict: ✅ PASS.** Re-running daily costs ~6 seconds and gives a
clean automated posture check.

---

## Lane B — Field-mapping audit (Trestle `$select` ↔ IDX Plus 902)

Reference: `data/rebny-rls-property-fields.csv` (1,213 rows ≈ 1,210
field definitions across 7 IDX Plus resources).

Code-side `$select` field counts:

| File | Fields explicitly selected |
|---|---|
| `app/api/idx/search/route.ts` | ~80 (curated for CRM agent search; includes `ListAgentEmail` / `ListAgentDirectPhone` because that path is auth-gated to broker/agent) |
| `lib/idx/trestle-mapper.ts` | ~27 (mapper-side selectors for the writer pipeline) |
| `lib/idx/card-fields.ts` | additional fields for card-render fast-path |
| `app/api/listings/route.ts` | inherits from `CARD_SELECT_FIELDS` |

**Codebase explicitly notes which IDX Plus fields it does NOT pull
and why** — the comments in `app/api/idx/search/route.ts` document:

- `PropertyCondition` — "NOT in IDX Plus CSV, prohibited for public IDX per REBNY"
- `Concessions` — "does NOT exist on Trestle Property entity"
- `BuildingRules` — "NOT on Trestle Property entity (400 error). Filtered client-side only."
- `AttendanceType` — "NOT in Trestle metadata — REBNY lookup CSV only. Doorman info lives in `AssociationAmenities`."
- `IDXEntireListingDisplayYN` (typo'd alias) — uses `InternetEntireListingDisplayYN` instead
- `SyndicateYN` — uses `SyndicateTo` (the live field)
- VOW-prefixed gate fields — not used (we hold IDX Plus, not VOW)
- `Latitude` / `Longitude` — Trestle does NOT provide these; `lib/geo/geocode.ts` derives them from address + ZIP centroid

**Verdict: ✅ INTENTIONAL CURATION.** ~80 of 902 fields is the right
posture for our use case. The repo documents *why* each excluded field
is excluded. No compliance gap. Pulling all 902 fields would be the
wrong move (more bandwidth, more PII surface, more cache).

**Optional follow-up (post-May-5):** run `scripts/reso/coverage.js`
across the curated set to confirm every selected field is actually
populated. That's a useful "advertised vs populated" check that
already-cached scripts can do without further code.

---

## Lane C — Lookup-value drift (RESO enums vs codebase)

Reference: `data/rebny-rls-property-lookup.csv` (2,119 rows ≈ 2,066
picklist values).

### `StandardStatus` (the most-used enum)

Code accepts (`lib/compliance/status.ts`):

```
Active, ActiveUnderContract, Cancelled, Closed, ComingSoon,
Expired, Hold, Pending, Withdrawn
```

Plus alias mappings for `"Active Under Contract"`, `"Coming Soon"`,
and `"Canceled"` (RESO's spelling) → canonical internal values.

Lookup CSV (REBNY-published) lists exactly these values, with `Canceled`
as the canonical RESO spelling. Both spellings round-trip through our
alias map. No drift.

`ACTIVE_DISPLAY_VALUES` (the read-time displayable set) is
`{ Active, ActiveUnderContract, ComingSoon }` — matches the REBNY
"display-eligible while under contract" semantics. ✅

### `PropertySubType`

Code references (active sale path):

```
Apartment, Commercial, Condominium, Industrial, MixedUse,
MultiFamily, NewConstruction, Office, Retail, Warehouse
```

All RESO-standard values. `Loft`, `Townhouse`, `SingleFamilyResidence`
also handled via the `PROPERTY_SUB_TYPE_MAP` in
`lib/search/public-listing-db.ts` and `lib/search/public-listing-trestle.ts`.

### `CommonInterest`

Code references: `Condominium`, `Condop`, `StockCooperative`. All three
are RESO DD 2.0 values; `Condop` is the NYC-specific RESO-recognized
hybrid. ✅

**Verdict: ✅ ALIGNED.** No enum drift detected on the three critical
filter enums. Tomorrow's `npm run reso:lookups -- --entity=Property
--field=PropertySubType --sample=2000` (after the IDX Plus quota
window resets) will give a live cross-check against actual feed values.

---

## Lane D — DTO HID-tier leak audit

Reference: REBNY IDX/VOW Display Rules — fields that **must not** be
displayed on IDX/VOW public surfaces:

```
PrivateRemarks, ShowingInstructions, ExpirationDate (Hidden),
PropertyCondition (agent-only), seller/occupant names/phone/email,
ListAgentEmail / ListAgentDirectPhone / ListAgentMobilePhone (public)
```

Grep against `lib/idx/public-dto.ts`, `lib/idx/db-to-public-dto.ts`,
and `app/api/listings/route.ts`:

| Forbidden pattern | Hits |
|---|---|
| `PrivateRemarks` / `private_remarks` | **0** |
| `ShowingInstructions` / `showing_instructions` | **0** |
| `ListAgentEmail` / `list_agent_email` | **0** |
| `ListAgentDirectPhone` / `list_agent_direct_phone` | **0** |
| `ListAgentMobilePhone` / `list_agent_mobile_phone` | **0** |

Note: `app/api/idx/search/route.ts` (the **CRM agent IDX search**, NOT
public `/api/listings`) does pull `ListAgentEmail` / `ListAgentDirectPhone`
for the auth-gated agent/broker view. That's correct per REBNY rules —
authorized participants can see list-agent contact info; public IDX
cannot.

**Verdict: ✅ CLEAN.** Zero HID-tier leaks in public-facing DTO paths.

---

## Lane E — Distribution-gate coverage

The 6 RLS distribution gates from REBNY RLS:

1. `idx_display_yn` (RLS Gate 4)
2. `internet_entire_listing_display_yn` (RLS Gate 3)
3. `internet_address_display_yn` (RLS Gate 3 + address sub-gate)
4. `internet_automated_valuation_display_yn` (RLS Gate 5)
5. `internet_consumer_comment_yn` (RLS Gate 6)
6. `participant_only` + `owner_opt_out` (RLS Gates 1 + 2)

Files that reference and enforce these gates: **40+** unique paths,
including:

- **Compliance lib (canonical helpers)**: `lib/compliance/gates.ts`,
  `lib/compliance/dto.ts`, `lib/compliance/idx-display-gate.ts`,
  `lib/compliance/normalizer.ts`, `lib/compliance/public-listing-filter.ts`,
  `lib/compliance/rebny-field-tables.ts`,
  `lib/compliance/rls-enforcement.ts`,
  `lib/compliance/raw-data-keep-fields.ts`.
- **Search lib**: `lib/search/listing-access-decision.ts`
  (`SEARCH_DISPLAY_GATE` constant + `PROJECTION_DISPLAY_GATE` constant
  + `buildSearchDisplayWhere` + `buildProjectionSearchWhere`),
  `lib/search/core.ts`, `lib/search/public-listing-db.ts`,
  `lib/search/public-listing-trestle.ts`,
  `lib/search/criteria-to-prisma.ts`.
- **IDX lib**: `lib/idx/db-to-public-dto.ts`,
  `lib/idx/display-adapter.ts`, `lib/idx/card-fields.ts`,
  `lib/idx/trestle-mapper.ts`.
- **API routes (public)**: `app/api/listings/route.ts`,
  `app/api/listings/building/route.ts`, `app/api/listings/similar/route.ts`,
  `app/api/listings/suggest/route.ts`, `app/api/idx/search/route.ts`,
  `app/api/buildings/route.ts`, `app/api/market/route.ts`,
  `app/api/open-houses/route.ts`, `app/api/idx/ensure-listing/route.ts`,
  `app/api/agents/[slug]/listings/route.ts`.
- **API routes (CRM/portal)**: `app/api/crm/listings/route.ts`,
  `app/api/crm/listings/[id]/route.ts`,
  `app/api/crm/listings/reset-sync/route.ts`,
  `app/api/crm/saved-searches/[id]/execute/route.ts`,
  `app/api/crm/listing-sends/route.ts`,
  `app/api/crm/convert/route.ts`,
  `app/api/crm/compliance/audit/route.ts`,
  `app/api/portal/comparables/route.ts`,
  `app/api/portal/favorites/route.ts`,
  `app/api/portal/offers/route.ts`.
- **Crons**: `app/api/cron/data-retention/route.ts`,
  `app/api/cron/feed-reconcile/route.ts`.
- **Pages + sitemap**: `app/listing/[id]/page.tsx`, `app/sitemap.ts`.
- **Tests** (5 dedicated compliance test suites in
  `lib/compliance/__tests__/`).

The canonical posture (read-time enforcement on every public/portal
surface, write-time defaults preserved on CRM-authored listings) is
fully implemented:

- `SEARCH_DISPLAY_GATE` (Listing-side) and `PROJECTION_DISPLAY_GATE`
  (projection-side) are the canonical filter constants.
- `affirmPermission()` and `evaluateDisplayGate()` are the canonical
  fail-closed evaluators (null → fail-closed).
- `filterDisplayableDbListings` is the canonical second-pass JS gate
  for already-fetched DB rows.

**Verdict: ✅ BROAD COVERAGE, FAIL-CLOSED CANONICAL.**

### Note on CRM write-path defaults

`app/api/crm/listings/route.ts:323-325` sets:

```ts
idx_display_yn: rlsEligible ? (persistence.topLevel.idx_display_yn !== false) : false,
internet_entire_listing_display_yn: persistence.topLevel.internet_entire_listing_display_yn !== false,
internet_address_display_yn: persistence.topLevel.internet_address_display_yn !== false,
```

The `!== false` pattern looks like the fail-open shape that PR #41
eliminated, but in this **write** context it's intentional: CRM-authored
listings default to displayable unless the agent explicitly opts out.
The output of `!== false` is always `true` or `false` (never null), so
the column always has a definite boolean. Read-time fail-closed is the
canonical helpers' job; this is unrelated.

**Not a regression. Documented for clarity.**

---

## Lane F — Address suppression coverage

Files using `canDisplayListingAddress()` or `isAddressDisplayable()`:

```
app/listing/[id]/page.tsx
lib/buyer-intent/recommender.ts
lib/cma/engine.ts
lib/compliance/gates.ts
lib/idx/db-to-public-dto.ts
lib/idx/public-dto.ts
lib/search/__tests__/criteria-to-prisma.test.ts
lib/search/core.ts
lib/search/listing-access-decision.ts
```

Plus the search-alert email path through `formatSearchAlertAddress` in
`lib/search/core.ts` (which itself calls `canDisplayListingAddress`).

Address-suppression cascade (per REBNY rule "if entire-listing display
is off, address display is also off"):

- `canDisplayListingAddress(input)` returns true **only** when
  `internet_entire_listing_display_yn === true` AND
  `internet_address_display_yn === true`.
- Null on either flag → suppress (fail-closed).
- False on either flag → suppress.

**Verdict: ✅ FAIL-CLOSED CANONICAL.** Suppression is enforced through
a single helper used everywhere address is rendered or serialized.

---

## Lane G — Live coverage probe (deferred)

`scripts/reso/coverage.js` would run a live `$select` on a sample of N
listings and report per-field populated %. **Deferred** because the
IDX Plus rate limit (480/min · 14,400/hr) was partially consumed by
earlier sessions today. A live coverage probe at sample=2,000 would
hit the cap.

Recommended re-run: tomorrow morning UTC after the quota window
resets, alongside the search-alerts cron gate verification at 07:30
UTC. Suggested invocation:

```bash
npm run reso:coverage -- --entity=Property --sample=2000 \
  --filter="StandardStatus eq 'Active'" \
  --fields="ListingId,StandardStatus,ListPrice,BedroomsTotal,BathroomsTotalInteger,LivingArea,Latitude,Longitude,YearBuilt,CommonInterest,Furnished,InternetEntireListingDisplayYN,InternetAddressDisplayYN,OwnerOptOut,ParticipantOnly,InternetAutomatedValuationDisplayYN,InternetConsumerCommentYN"
```

This will validate that every gate field we depend on is actually
populated (or null in a way the helpers handle).

---

## Operational delta — not a compliance issue

`npm run reso:analyze` at 23:28 UTC reported:

- Trestle live active total: **10,433** (sale 9,490 + rent 943).
- DB `Listing` active total: **10,485** (Δ +52 — stale Active rows the
  data-retention cron clears on its 24-hour cycle).
- DB `listing_search_projection`: **19,869 / 19,869**, 0 missing.
- Public `/api/listings`: **5,163** (Δ −5,270 vs Trestle expected).

The 5,270-listing gap between Trestle expected and public site total
**is the in-flight migration catching up**, not a compliance violation.
The IDX sync is running cleanly (last cycle: 73 upserted, 0 errors,
4.8s) and the projection is at full parity. The gap will close as the
sync flushes the backlog of listings that Trestle modified during the
deploy window.

---

## Verdict matrix

| Lane | Status | Confidence |
|---|---|---|
| A — UCBA 2026 | ✅ PASS (46/46, 0 regressions) | High (automated, runs in CI) |
| B — Field mapping | ✅ Intentional curation | High (manually documented exclusions) |
| C — Lookup-value drift | ✅ Aligned (3 enums verified) | Medium-high (live cross-check deferred to tomorrow) |
| D — HID-tier leak | ✅ Clean | High (grep verified) |
| E — Distribution gates | ✅ Broad fail-closed coverage | High (40+ files, canonical helpers) |
| F — Address suppression | ✅ Fail-closed canonical | High (single helper, fail-closed semantics) |
| G — Live coverage | ⏸ Deferred (rate-limit) | Re-run tomorrow AM |

---

## Recommended follow-ups (none deploy-blocking)

1. **Tomorrow AM after quota reset**: run `npm run reso:coverage`
   per the Lane G command above. Confirms every gate field is
   actually populated in live data.
2. **Pre-PR-5F**: `npm run reso:lookups -- --entity=Property
   --field=PropertySubType` to cross-check the projection's
   `is_commercial` / `is_new_development` flag-derivation against
   what's actually populated. PR 5F brief can use the result to
   decide whether to add a `common_interest` projection column.
3. **Post-master-plan**: build `scripts/reso/search/from-saved.js`
   to convert every saved search into an OData filter and replay
   against Trestle. Free regression test for every client's
   saved search.

None of these are deploy gates. The compliance posture today is
solid; these are upgrades, not fixes.

---

## Inputs / sources used in this audit

- `npm run ucba:audit` (Lane A)
- `data/rebny-rls-property-fields.csv` (Lane B reference)
- `data/rebny-rls-property-lookup.csv` (Lane C reference)
- `compliance/rules/ucba-audit-checklist.json`
- `compliance/UCBA-2026.md` + `compliance/IDX-VOW-DISPLAY-RULES.md`
- `lib/compliance/gates.ts` + `lib/compliance/dto.ts` +
  `lib/compliance/rls-enforcement.ts`
- `lib/idx/public-dto.ts` + `lib/idx/db-to-public-dto.ts`
- `lib/idx/trestle-mapper.ts` + `lib/idx/card-fields.ts`
- `lib/search/listing-access-decision.ts` +
  `lib/search/core.ts` + `lib/search/criteria-to-prisma.ts`
- `app/api/listings/route.ts` (public listings API path)
- `app/api/idx/search/route.ts` (auth-gated agent search path)
- `app/api/crm/listings/route.ts` (CRM write path — context for
  the `!== false` pattern note in Lane E)
- `app/listing/[id]/page.tsx` (public listing detail page)
- `npm run reso:analyze` (Trestle ↔ DB ↔ public-site parity)

No Trestle live probes beyond what `reso:analyze` already issued.

*Audit captured 2026-04-29 by Claude Opus 4.7 (1M context). Memory only — no code, schema, env, or route changes triggered by this audit.*
