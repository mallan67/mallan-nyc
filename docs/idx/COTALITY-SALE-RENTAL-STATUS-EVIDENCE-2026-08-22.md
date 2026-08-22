# Cotality Sale / Rental universe and status semantics — live evidence, 2026-08-22

> **STATUS: DATED EVIDENCE. NOT AN AUTHORITY.**
>
> What the live Cotality API returned during one session. Not a competing
> authority to `MALLAN-PLATFORM-MASTER-PLAN.md`, and not citable for a current
> provider fact — provider truth is the live API.
>
> **Every population count here is an observation with a date on it.**
> `Residential = 215,388` was true on 2026-08-22. Nothing in `FIELD_REGISTRY`, a
> mapper, a filter or a test may hard-code a number from this file. Promotable
> material is *structure*: field existence, declared type, enum vocabulary,
> operator behaviour, capability suppression, and semantics Mallan has decided.

| | |
|---|---|
| **Provider** | Cotality API |
| **Endpoint** | `https://api.cotality.com/trestle/odata` |
| **Resource** | `Property` |
| **Session** | 2026-08-22 |
| **Method** | identical to the Media census — see `COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md` §1 |

Three states are never collapsed: `SUPPORTED` / `PROVIDER_REJECTED` /
`UNVERIFIED`. A member returning `0` is `VERIFIED_ZERO_POPULATION_CURRENT_FEED`;
a member the service refuses as an enum constant is `PROVIDER_REJECTED`; a field
the service refuses to filter at all leaves its population `UNVERIFIED`,
**explicitly not zero**.

---

## 1. `PropertyType` — the universe

### 1.1 Declared vocabulary — 13 members, `Edm.Int64`

```
BusinessOpportunity=0   CommercialLease=1      CommercialSale=2
DisasterReliefRental=3  Farm=4                 HighRise=5
Land=6                  ManufacturedInPark=7   MultiFamily=8
Residential=9           ResidentialIncome=10   ResidentialLease=11
Specialty=12
```

**`'Commercial'` is not a member.**

```
$filter=PropertyType eq 'Commercial'  ->  HTTP 400
"The string 'Commercial' is not a valid enumeration type constant."
```

This matters because `lib/compliance/reso-mapper.ts:17` types `PropertyType` as
`'Residential' | 'ResidentialLease' | 'Commercial' | 'Land'`. `Commercial` is an
invented member. `Land` is real. Recorded in §5.

### 1.2 Population — **2026-08-22 observation, not architecture**

`Property` total: **591,233**.

| member | rows | state |
|---|---:|---|
| `Residential` | 215,388 | SUPPORTED |
| `ResidentialLease` | 375,845 | SUPPORTED |
| the other eleven members | 0 each | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| *(null)* | 0 | SUPPORTED |

**Closes exactly:** `215,388 + 375,845 = 591,233`. Nothing unaccounted for, so
the eleven zeros are genuine and not a paging artefact. `PropertyType` is always
populated on this feed.

### 1.3 The negation trap, measured

| filter | rows |
|---|---:|
| `PropertyType eq 'Residential'` | 215,388 |
| **`PropertyType ne 'ResidentialLease'`** | **215,388** |
| `PropertyType eq 'ResidentialLease'` | 375,845 |
| `PropertyType ne 'Residential'` | 375,845 |

**Defining sale as "not rental" returns the identical set today.** It is
indistinguishable from the correct definition by observation alone. It agrees
only because the other eleven members are unpopulated, and it silently absorbs
each of them — `Land`, `CommercialSale`, `MultiFamily`, `ResidentialIncome`,
`Farm`, `BusinessOpportunity` — into residential *sale* inventory the moment any
one is populated, with no code change and no warning.

This is the clearest instance so far of a rule that is **true today and wrong as
architecture**. `ne` itself behaves correctly here (§4.1); the defect is the
definition, not the operator.

---

## 2. `StandardStatus`

### 2.1 Declared vocabulary — 11 members

```
Active=0  ActiveUnderContract=1  Canceled=2  Closed=3   ComingSoon=4
Delete=5  Expired=6              Hold=7      Incomplete=8  Pending=9
Withdrawn=10
```

### 2.2 Population

| member | rows | state |
|---|---:|---|
| `Closed` | 577,286 | SUPPORTED |
| `Active` | 7,970 | SUPPORTED |
| `Pending` | 5,977 | SUPPORTED |
| `ActiveUnderContract` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Canceled` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `ComingSoon` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Delete` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Expired` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Hold` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Incomplete` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Withdrawn` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| *(null)* | 0 | SUPPORTED |

**Closes exactly:** `577,286 + 7,970 + 5,977 = 591,233`.

**Three of eleven members carry the entire feed, and 97.6% of it is `Closed`.**
This licence is overwhelmingly a historical archive with a small live set.

**`ComingSoon` is zero on the provider feed**, yet Mallan carries Coming Soon
handling (UCBA Art. I §16 — no showings). That is not a defect: Coming Soon can
originate from Mallan local input rather than the feed. It does mean the
provider-side path is currently unexercised.

---

## 3. `MlsStatus` — declared, selectable, and NOT filterable

### 3.1 Declared vocabulary — 25 members

```
Active  ActiveOptionContract  ActiveUnderContract  AttorneyReview  Canceled
CanceledRelisted  Closed  ComingSoon  CompSold  Contingent  Delete  Expired
Hold  Incomplete  Leased  OptionPeriod  Pending  PendingBackupsRequested
PendingFeasibility  PendingInspection  PendingShortSale  PrepNoShow  PrepShow
Terminated  Withdrawn
```

### 3.2 Filtering is suppressed at provider level

**All 25 members and the null probe return HTTP 400:**

```
Results from 'RLS' has been suppressed (provider Level) as field
MlsStatus' cannot be used for filtering or ordering
```

This is not "zero rows". It is not "the field is absent". It is the provider
declining to answer. **`MlsStatus` population is `UNVERIFIED`.**

### 3.3 It is selectable, and null on sampled rows

`$select=MlsStatus` succeeds and returned `null` on every sampled row alongside
a populated `StandardStatus`. Combined with §3.2 this field is effectively
unavailable on this licence: declared, projectable, observed null, uncountable.

**Sampled, not proven universal** — because the only instrument that could prove
it is the filter, and the filter is suppressed.

### 3.4 Why this had to be probed separately from `StandardStatus`

They are different vocabularies — 25 members against 11 — and not
interchangeable. `MlsStatus` carries `Leased`, `AttorneyReview`, `Contingent`,
`PendingShortSale`, `CompSold`, `PrepShow`; `StandardStatus` has no equivalents.
Inferring one from the other because both look like status fields would have
produced a confident wrong answer in both directions: a filterability claim
`MlsStatus` does not support, and a vocabulary `StandardStatus` does not contain.

---

## 4. Operator behaviour — probed per field, never inherited

### 4.1 `ne` on `PropertyType` and `StandardStatus`

| filter | rows | check |
|---|---:|---|
| `StandardStatus ne 'Closed'` | 13,947 | = `Active` 7,970 + `Pending` 5,977 ✓ |
| `PropertyType ne 'ResidentialLease'` | 215,388 | = `eq 'Residential'` ✓ |

**`ne` behaves correctly on both.** Neither enum has case-variant member pairs.

**This is deliberately stated per field.** On `MediaClassification` — which does
have case-variant pairs (`Document=0` / `DOCUMENT=4`) — `ne 'Document'` excludes
nothing and returns the whole population
(`COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md` §5.1). **An operator behaviour
verified on one Cotality enum may not be carried to another merely because both
are enums.** Probe the exact field/operator pair.

### 4.2 `$orderby`

Probed directly, because a sortability claim was made in the registry before it
was measured and had to be earned or withdrawn.

| query | result |
|---|---|
| `$orderby=PropertyType` | SUPPORTED, HTTP 200 |
| `$orderby=StandardStatus` | SUPPORTED, HTTP 200 |
| `$orderby=MlsStatus` | **PROVIDER_REJECTED, HTTP 400** |

`MlsStatus` is refused for ordering as well as filtering, so its registry
capability is `unsupported` (the provider cannot) rather than `no` (Mallan chose
not to offer it).

### 4.3 Compound filters

`StandardStatus eq 'Active' and PropertyType eq 'Residential'` → 6,965.
SUPPORTED; conjunction across the two enums works.

---

## 5. Sale × status matrix — **2026-08-22 observation**

| | `Active` | `Pending` | `Closed` | total |
|---|---:|---:|---:|---:|
| `Residential` (sale) | 6,965 | 5,622 | 202,801 | 215,388 |
| `ResidentialLease` (rental) | 1,005 | 355 | 374,485 | 375,845 |

Both rows close exactly against their `PropertyType` totals.

Live inventory is **6,965 active sales and 1,005 active rentals**. Everything
else is pending or historical.

---

## 6. How Mallan's code stood against this

### 6.0 SIX writers carried the negation, and the first pass fixed none of them

The first attempt at this correction (commit `cca79786`) built the canonical
contract, wired the MAPPER to it, and proved both with 60 green assertions. It
did not touch a single OData writer. The suite went green while the defect kept
shipping, and an existing test actively REQUIRED it:

    lib/search/__tests__/crm-idx-filter.test.ts:17
        expect(filter).toContain("PropertyType ne 'ResidentialLease'")

A complete sweep found six production sites, not one:

| site | disposition |
|---|---|
| `lib/search/crm-idx-filter.ts:47` | corrected |
| `lib/idx/fetch.ts:488, 517, 549, 569` | corrected — four traversals |
| `lib/search/public-listing-trestle.ts:163` | **NOT touched — protected `public-listing-*` boundary** |
| `lib/market-report/generator.ts`, `app/api/listings/similar`, `app/api/market` | already positive `eq` |

Two existing tests asserted the defect and were corrected with the reason
recorded inline: `crm-idx-filter.test.ts` and
`lib/idx/__tests__/incremental-filter.test.ts`.

**The public consumer writer still emits the negation.** `public-listing-*` is
inside the declared zero-delta boundary, so it is reported rather than changed.
It carries the identical latent defect: the moment any other `PropertyType`
member is populated, the public site's sale search absorbs it.

### 6.1 The sale/rental split was a substring test — corrected

`lib/search/crm-idx-mapper.ts:108` read:

```ts
const isRental = propertyType.toLowerCase().includes('lease');
listingCategory: isRental ? 'rental' : undefined
```

Two defects against the thirteen-member vocabulary:

1. **Substring matching.** `DisasterReliefRental` is a rental, contains no
   "lease", and classified as a **sale**. `CommercialLease` is not residential
   rental inventory and classified as a **rental**. Same defect shape as the
   `PetsAllowed` "Yes" / "BuildingYes" substring bug already corrected elsewhere
   in this codebase.
2. **Sale defined by negation.** `: undefined` made sale the leftover — see §1.3.

Corrected to positive membership on both sides via
`lib/search/canonical/property-type-universe.ts`. Anything in neither set is
`unknown` and is **not** emitted as sale.

Note the browser already validated `listingCategory` against
`['sale','rental','Sale','Rental']`
(`public/crm/js/compliance/compliance-gates-and-output.js:2445`), but both gates
are written `if (l.listingCategory && …)` — so the `undefined` the mapper
actually emitted skipped validation entirely. Emitting an explicit value makes
that gate meaningful for the first time.

### 6.2 `MlsStatus || StandardStatus` conflates two vocabularies — latent

`lib/search/crm-idx-mapper.ts:198`:

```ts
const mlsStatus = String(raw.MlsStatus || raw.StandardStatus || '');
```

Harmless **today** only because `MlsStatus` is null on this feed, so it always
falls through. If Cotality ever populates it, the CRM begins receiving values
from a 25-member vocabulary where it expects an 11-member one — `Leased`,
`AttorneyReview`, `Contingent`, `PendingShortSale` — which downstream status
normalisation has never seen.

Not changed in this pass. Recorded as a named follow-up rather than fixed
speculatively, because deciding what `Leased` *means* to a Mallan workflow is a
product decision, not a mapping one.

### 6.3 No Mallan query filters on `MlsStatus`

Verified by search across `lib/` and `app/`. The provider suppression breaks
nothing today. `app/api/idx/search/route.ts:39` `$select`s the field, which is
permitted and returns null.

### 6.4 `reso-mapper.ts` types an invented `PropertyType`

`lib/compliance/reso-mapper.ts:17` declares
`'Residential' | 'ResidentialLease' | 'Commercial' | 'Land'`. `Commercial` is not
a member of the live enum (§1.1). Recorded, not changed — this is the RESO
*export* shape, and whether it should mirror the Cotality vocabulary exactly is a
separate question from what the Search universe means.

---

## 7. Open questions

1. **Should `MultiFamily`, `ResidentialIncome` or `Land` belong to the Mallan
   sale universe?** All three are plausibly "sales" in ordinary speech; none is
   populated; none is included. This is a product decision for Maya, and it is
   deliberately *not* inferred from a member existing in the vocabulary.
2. **What does `MlsStatus` carry on a licence where it is filterable?** Not
   answerable here.
3. **Do `Active`/`Pending`/`Closed` exhaust this licence permanently**, or is the
   zero-population of the other eight a current-feed artefact?
4. **What Mallan workflow meaning attaches to each `MlsStatus` member** if the
   field ever populates (§6.2)?
5. **Why does the feed carry 97.6% `Closed`** — is the live set genuinely ~14k
   rows, or is there a scoping rule not visible from here?

---

**Related:** `memory/COTALITY-IS-THE-ONLY-AUTHORITY.md` ·
`docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md` (the per-field operator
rule) · `lib/search/canonical/property-type-universe.ts` (the promoted contract) ·
`lib/compliance/rls-enforcement.ts:309` (REBNY accepts only `Residential` and
`ResidentialLease`).
