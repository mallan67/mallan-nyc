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

| concept | reaches server | provider clause | registry owner | capability | live | persist | workflows |
|---|---|---|---|---|---|---|---|
| `list_price` | yes | yes | `list_price` | yes | — | **yes** | sale, rent, cma |
| `bedrooms` | yes | yes | `bedrooms` | yes | — | **yes** | sale, rent, cma |
| `bathrooms` | yes | yes | `bathrooms` | yes | — | **yes** | sale, rent, cma |
| `rooms_total` | yes | yes | `rooms_total` | needs_probe | — | no | sale, rent |
| `living_area` | yes | yes | `living_area` | yes | — | **yes** | sale, rent, cma |
| `market_status` | yes | yes | `standard_status` | yes | **yes** | **yes** | sale, rent, cma |
| `property_sub_type` | yes | yes | `property_sub_type` | yes | — | no | sale, rent, cma |
| `ownership` | yes | yes | `ownership` | yes | — | no | sale |
| `borough` | yes | yes | `borough` | yes | — | **yes** | sale, rent, building, cma |
| `neighborhood` | yes | yes | `neighborhood` | yes | — | **yes** | sale, rent, building, cma |
| `postal_code` | yes | yes | `postal_code` | yes | — | no | sale, rent, building |
| `street_address` | yes | yes | `address` | yes | — | no | sale, rent, building |
| `unit` | **NO** | — | `unit` | needs_probe | — | no | sale, rent |
| `building_name` | yes | yes | `building_name` | needs_probe | — | no | sale, rent, building |
| `listing_id` | yes | yes | `provider_listing_id` | needs_probe | — | no | sale, rent |
| `listing_activity_date` | yes | yes | `activity_date` | needs_probe | — | no | sale, rent |
| `listing_contract_date` | **NO** | — | `listing_contract_date` | needs_probe | — | no | sale |
| `close_date` | yes | yes | `close_date` | needs_probe | — | no | sale, cma |
| `year_built` | yes | yes | `year_built` | needs_probe | **yes** | no | sale, rent, building |
| `stories_total` | yes | yes | `stories_total` | needs_probe | — | no | building |
| `units_total` | yes | yes | `units_total` | needs_probe | — | no | building |
| `public_remarks_keyword` | **NO** | — | `public_remarks_keyword` | needs_probe | — | no | sale, rent |
| `management_company` | NO | **REFUSED** | `management_company` | unsupported | — | no | building |
| `feature_criteria` | yes | yes | `amenities` | needs_probe | — | no | sale, rent |
| `sponsor_unit` | NO | **REFUSED** | **none** | — | — | no | sale |
| `map_grid_filter` | NO | **REFUSED** | `map_grid_filter` | unsupported | — | no | sale, rent |
| `max_financing` | NO | no | none | — | — | no | sale |

Three concepts are **deliberately refused** and verified against the throw shape
in source. `sponsor_unit` is refused in `app/api/idx/search/route.ts`, **not** in
`crm-idx-filter.ts` — a refusal scan of one file reports it unverified, the same
one-file blind spot that let the `status` defect survive.

`sponsor_unit` is the one concept with **no registry owner**. B1 must give it one.

---

## 2. The Section 4 scoreboard

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
```

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

Nothing here needs Maya's adjudication. Genuinely ambiguous **business
behaviour** — for example whether Building Search results should be building
identities rather than listing rows (§4.3) — is a separate question and is not
decided by this document.

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
