# The criterion matrix — B1's replacement specification

**Date:** 2026-08-28 · **Branch:** `fix/neon-p0-event-driven-wake-2026-08-16` (PR #618)
**Section:** 4 — Search Step 1 (B1 canonical criteria contracts)

**This is the replacement specification, not another audit.** Regenerate with
`node scripts/search/criterion-matrix.mjs` — read-only source parsing; no
network, no database, no Cotality.

---

## 0. The model, corrected

```
business concept
  → TRANSPORT REACHABILITY   collected → serialized → forwarded → read
  → PROVIDER CLAUSE          does the server actually ask Cotality, or refuse?
  → REGISTRY OWNER           exactly one, never zero, never two
  → CAPABILITY               what the registry declares
  → LIVE VERIFICATION        is there a probe record?
  → PERSISTENCE BRIDGE       can it be saved and restored canonically?
```

The first cut of this document collapsed the first two stages into one
`executes` boolean. **That published four false claims**, and correcting the
model — not hunting for bugs — is what surfaced them:

| concept | I claimed | actually |
|---|---|---|
| `unit` | executes | **never reaches the server** — serialized, not forwarded |
| `listing_contract_date` | executes | **never reaches the server** — same |
| `public_remarks_keyword` | executes | **never reaches the server** — same |
| `management_company` | executes | **refused** — the server throws and asks the provider nothing |

All three unreached criteria are already declared `TRANSPORT_BROKEN` in
`tests/runtime/search-criterion-transport-invariant.test.ts`. My matrix's
`executes` check simply omitted the forwarding stage, so it contradicted a test
that was already right. **Reaching the server, producing a clause, and the
provider accepting it are three different facts and are never collapsed again.**

Counting code keys was the other half of the same error: 36 code keys are **27
business concepts**. `priceMin`/`priceMax` are one concept with two bounds;
`dateFrom`/`dateTo`/`dateActivityType` are one concept with three parts.
Counting keys is how one architectural defect looks like twenty-one bugs.

---

## 1. The matrix

| concept | transport | server disposition | registry owner | capability | live | persist | workflows |
|---|---|---|---|---|---|---|---|
| `list_price` | yes | proven | `list_price` | yes | — | **yes** | sale, rent, cma |
| `bedrooms` | yes | proven | `bedrooms` | yes | — | **yes** | sale, rent, cma |
| `bathrooms` | yes | **CONFLICT** | `bathrooms` | yes | — | **yes** | sale, rent, cma |
| `rooms_total` | yes | proven | `rooms_total` | needs_probe | — | **yes** | sale, rent |
| `living_area` | yes | proven | `living_area` | yes | — | **yes** | sale, rent, cma |
| `market_status` | yes | proven | `market_status` | yes | **yes** | **yes** | sale, rent, cma |
| `property_sub_type` | yes | proven | `property_sub_type` | yes | — | **yes** | sale, rent, cma |
| `ownership` | yes | proven | `ownership` | yes | — | **yes** | sale |
| `borough` | yes | proven | `borough` | yes | — | **yes** | sale, rent, building, cma |
| `neighborhood` | yes | proven | `neighborhood` | yes | — | **yes** | sale, rent, building, cma |
| `postal_code` | yes | proven | `postal_code` | yes | — | **yes** | sale, rent, building |
| `street_address` | yes | proven | `street_address` | yes | — | **yes** | sale, rent, building |
| `unit` | **NO** | **transport_broken** | `unit` | needs_probe | — | **yes** | sale, rent |
| `building_name` | yes | proven | `building_name` | needs_probe | — | **yes** | sale, rent, building |
| `listing_id` | yes | proven | `listing_id_canonical` | needs_probe | — | **yes** | sale, rent |
| `listing_activity_date` | yes | proven | `activity_date` | needs_probe | — | **yes** | sale, rent |
| `listing_contract_date` | **NO** | **transport_broken** | `listing_contract_date` | needs_probe | — | **yes** | sale |
| `close_date` | yes | proven | `close_date` | needs_probe | — | **yes** | sale, cma |
| `year_built` | yes | proven | `year_built` | needs_probe | **yes** | **yes** | sale, rent, building |
| `stories_total` | yes | proven | `stories_total` | needs_probe | — | **yes** | building |
| `units_total` | yes | proven | `units_total` | needs_probe | — | **yes** | building |
| `public_remarks_keyword` | **NO** | **transport_broken** | `public_remarks_keyword` | needs_probe | — | **yes** | sale, rent |
| `management_company` | **NO** | **explicit_refusal** | `management_company` | unsupported | — | **yes** | building |
| `feature_criteria` | yes | proven | `feature_criteria` | needs_probe | — | **yes** | sale, rent |
| `sponsor_unit` | **NO** | **explicit_refusal** | `sponsor_unit` | unsupported | — | **yes** | sale |
| `map_grid_filter` | **NO** | **explicit_refusal** | `map_grid_filter` | unsupported | — | **yes** | sale, rent |
| `max_financing` | **NO** | **no_runtime_path** | `max_financing_percent` | unsupported | — | **yes** | sale |

Three concepts are **deliberately refused** and verified against the throw shape
in source. `sponsor_unit` is refused in `app/api/idx/search/route.ts`, **not** in
`crm-idx-filter.ts` — a refusal scan of one file reports it unverified, the same
one-file blind spot that let the `status` defect survive.

### Both ownerless concepts now have an owner

`sponsor_unit` and `max_financing` had none. Being broken is not a reason to fall
outside the authority graph — Section 4 requires every visible criterion to be
explicitly accounted for — and the standing rule is not to discard difficult
Search criteria. Both are **preserved, classified `unsupported`, and awaiting
authorized live Cotality verification**:

- `sponsor_unit` → registry `sponsor_unit`. `cotalityField` is deliberately
  `null`: the value lives inside `CustomProperty.CustomFields` and the exact
  extraction contract is unproven, so no top-level field name is recorded.
- `max_financing` → registry `max_financing_percent`. **Its control is live and
  enabled** on three ids and absent from the disable list; the collector writes
  `criteria.financingMin`; and nothing reads it anywhere —
  `buildCrmIdxODataFilter` contains no occurrence of `financ` at all. So the
  broker types a narrowing value, receives HTTP 200, and gets a **wider result
  set wearing the costume of a narrower one**. That is the same silent-widening
  class as the dropped `status` param, which is why it is `unsupported` (must
  fail loud) rather than `needs_probe`. Financing has **two** dead paths — the
  `MaximumFinancingPercent` checkbox family with magic `gt:0`/`eq:0` values is
  neutralised before collection — so B1 must not fix one and call the concept
  done.

---

## 2. The Section 4 scoreboard

### The bathrooms conflict — a proven clause that is still wrong

`bathrooms` is the reason `provider_clause_proven` and *correct* had to be kept
apart. The executor builds `BathroomsTotalInteger ge/le {n}`. The project's own
live-verified `lib/search/canonical/bath-contract.ts` lists that exact field
under **`rejected`**, on an exhaustive 8,103-row read:

- it is an **Int32**, so it cannot represent 1.5 at all;
- it disagrees with its own components on ~1% of rows — the best of four
  hypotheses matched 98.8%, with named counterexamples (`RLS20105072`: full=2,
  half=1, TotalInteger=0).

Three consequences, all in source:

1. **Half-baths are unexpressible** on the CRM Search path, though the contract
   records `BathroomsHalf` non-zero on 2,023 Active rows.
2. The canonical renderers `minBathsOData` / `maxBathsOData` have **no production
   caller**, while the Prisma engine *does* use the contract — so **the two
   engines answer the same bath question differently**.
3. `crm-idx-filter.test.ts:230-236` **locks in** `BathroomsTotalInteger ge 1.5`,
   its own comment conceding *"Not strictly OData-numeric on Edm.Int32"*. The
   mismatch is asserted, not caught.

Recorded, **not fixed here.** It is a registry→executor authority conflict, which
is Section 5's subject. Patching it now is precisely the loop this specification
exists to end.

```
PASS  concepts accounted for                          27 / 27
PASS  duplicate registry owners                        0 / 0
PASS  unaccounted collector keys                       0 / 0
PASS  phantom collector keys in concept table          0 / 0
PASS  unaccounted wire params                          0 / 0
PASS  unaccounted registry entries                     0 / 0
PASS  concepts claimed by two rows                     0 / 0
OPEN  executable concepts with a persistence bridge    7 / 20
PASS  declared refusals verified in source             3 / 3
OPEN  independent translation tables (CFK not derived) 1 / 0
PASS  provider_clause claims with a proven owner+clause 20 / 20
OPEN  proven clauses with NO mapping conflict          19 / 20
OPEN  VERIFIED EXECUTABLE (clause+capability+live)      1 / 20
```

**`VERIFIED EXECUTABLE` is 1 of 20.** Only `market_status` has a proven clause,
`capability: yes`, live Cotality evidence and no mapping conflict. That single
number is what stops "20 executable criteria" being read as "20 working
criteria" — and it is why no concept may move from `needs_probe` to `yes` in B1.

**Coverage is bidirectional**, which is what made the two missing concepts
visible. A census that only asks *"is every collector key claimed"* passes while
the concept table names keys that no longer exist, or while a wire param or
registry entry belongs to no concept. All four directions are checked, and the
reverse directions are what caught `sponsor_unit` and `map_grid_filter`.

**Two items are OPEN, and they are precisely B1's remaining work.**

---

## 3. The design question, settled by evidence

Every executing concept has **exactly one** `FIELD_REGISTRY` owner — none has
zero, none has two. B2 made that true. So the preferred design is not a
preference; it is already two-thirds built:

| layer | role | status |
|---|---|---|
| `canonicalKey` | the single canonical business identity | complete |
| `searchParams` | wire adapter | done in B2 |
| `mappingOwner` | delegates provider mapping to 5 specialised modules | done in B2 |
| **`filterKeys`** | **persistence adapter** | **7 of 20 — the gap** |

`CanonicalFilterKey` is **generated from** the registry, not maintained beside
it. `PARAM_ALIASES` becomes a legacy read adapter.

### The circularity that must be broken first

`field-registry.ts` currently does:

```ts
import type { CanonicalFilterKey } from './filter-keys';
…
filterKeys?: readonly CanonicalFilterKey[];
```

Generating `filter-keys.ts` **from** the registry while the registry imports its
type **from** `filter-keys.ts` is circular. **The type direction must be inverted
before any bridge metadata is populated:** the registry declares the keys, and
`filter-keys.ts` derives its union from them. Populating `filterKeys` first would
cement the circle.

This is scoreboard line *"independent translation tables (CFK not derived) 1/0"*,
and it is the first implementation task.

---

## 4. Canonical naming — resolved from architecture, not preference

Per `CURRENT.md` §1. **17 concepts adopt the registry's `canonicalKey`
unchanged.** The rest resolve from established architecture:

| concept | decision | basis |
|---|---|---|
| `market_status` | **adopt** (registry says `standard_status`) | Established Mallan business name, used throughout lane A. `StandardStatus` is the Cotality FIELD; the business concept is market status. |
| `listing_id` | **adopt**; registry owner is wrong | Must represent the Mallan canonical listing identity. The registry currently points this criterion at `provider_listing_id` — Cotality's ListingId as provider **evidence**. `listing_id_canonical` is the Mallan reference and is dual-domain (`SL-`/`RL-` or a provider id). **B1 repoints the owner.** |
| `public_remarks_keyword` | **keep** | Already precise; names its single provider field. |
| `street_address` | **rename from `address`** | Consumer evidence: the criterion executes as a STRUCTURED predicate over `StreetNumber`, `StreetDirPrefix`, `StreetName`, `BuildingName`, while the registry entry's `dbColumn` is the address JSON and its `uiLabel` is "Address". One entry is serving both a display **fact** and a search **criterion**, with different authorities and different provider fields. B1 separates them. |
| `feature_criteria` | **rename from `amenities`** | Consumer evidence: the checkbox family spans **18** Cotality fields including `ListingAgreement`, `LandLeaseYN`, `BusinessType`, `NewConstructionYN`, `OwnerPays` and `DirectionFaces` — none of which is an amenity. `amenities` under-describes what it owns by a wide margin. |

**`rlsId` and `resoStatuses` are compatibility debt only** (§1). `rlsId` becomes
`listing_id` at the canonical layer; both are retired from the collector and
serializer when those are replaced. Neither is promoted to a canonical name.

Nothing here needs Maya's adjudication.

### §4.3 Building Search — I referred back a decision that was already made

I wrote that whether Building Search returns building identities rather than
listing rows was an open question for Maya. **It is not.** `CURRENT.md` §4.3
says it plainly:

> Create one `BuildingCriteria` contract with BUILDING result identity, not
> listing rows plus building filters.

The product contract is settled. What is genuinely open is a *technical identity*
problem, and the registry already records the evidence for it under
`building_identity`:

- `BuildingKey` / `BuildingKeyNumeric` are populated on **0 of 8,056** rows;
- the live Building entity declares exactly **one** field;
- `GET /Building` returns **403** — `$metadata` over-declaring what the licence
  grants;
- the entry is therefore `mallan_derived`, `filterable: needs_probe`,
  `semanticEquivalenceProven: false`, and must derive from the **canonical
  structured address**, never from a coordinate.

Recorded as two separate states, because collapsing them is what turned a solved
product question into an apparently open one:

| | state |
|---|---|
| **§4.3 product contract** | **CLOSED / ESTABLISHED** — Building Search returns canonical Building identities |
| **§4.3 identity implementation** | **OPEN** — the canonical building resolver must be proven before runtime implementation |

---

## 5. What B1 does, in order

1. **Invert the type direction** between the registry and `filter-keys.ts`.
   Nothing else can be done safely first.
2. **Fill the `filterKeys` bridge** on the 13 executable concepts that lack it,
   and give `sponsor_unit` a registry entry.
3. **Generate `CanonicalFilterKey` from the registry**; demote `PARAM_ALIASES`
   to a legacy read adapter.
4. **Define `SaleCriteria` / `RentalCriteria` / `BuildingCriteria` /
   `ComparableCriteria`** over the canonical names, using the `workflows` column.
   Rental is its own contract: `ownership` and `listing_contract_date` are
   sale-side; `stories_total`, `units_total`, `management_company` are
   building-side.
5. **Compose with `saved-search-normalizer.ts`** — it already owns
   `feature_criteria` at the persistence boundary, runs at all four call sites,
   owns no vocabulary of its own and fails closed on the unrecognised. B1 widens
   its remit; it never adds a second normalizer beside it.
6. **Bind both UI depths to one object.** Basic and Advanced become views.
7. **Generate transport from the object.** `URLSearchParams` becomes output only.

Repairing `unit`, `listing_contract_date` and `public_remarks_keyword`
individually is explicitly **not** on this list. They are one defect — the
serializer emits params the wire forwarder does not carry — and they are fixed
when transport is generated from the canonical object in step 7.

---

## 6. What this matrix does NOT establish

**18 of the 20 executable concepts have no recorded live Cotality evidence.**
Only `market_status` and `year_built` carry a probe record.

Repo code proves what Mallan **asks for**. It does not prove Cotality accepts,
populates or semantically means it (§1). B1 must not convert any concept from
`needs_probe` to `yes`. Nothing in this document asserts a Cotality fact.
