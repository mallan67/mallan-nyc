# The criterion matrix — B1's replacement specification

**Date:** 2026-08-28 · **Branch:** `fix/neon-p0-event-driven-wake-2026-08-16` (PR #618)
**Section:** 4 — Search Step 1 (B1 canonical criteria contracts)

**This is the replacement specification, not another audit.** Generate it with
`node scripts/search/criterion-matrix.mjs` — read-only source parsing, no
network, no database, no Cotality.

---

## 0. Why the count changed from 36 to 25

The earlier census listed **one row per code key**, which is why it read as 36
separate problems and invited 36 separate patches. `priceMin` and `priceMax` are
not two criteria; they are one concept with two bounds. `dateFrom`, `dateTo` and
`dateActivityType` are one concept with three parts.

**Counting code keys is how one architectural defect looks like twenty-one bugs.**

One row per business concept gives **25 concepts**, 24 of which execute end to
end. Every collector key is claimed by exactly one concept — the matrix reports
`(none)` unaccounted, so it is complete by construction rather than by assertion.

---

## 1. The matrix

| canonical concept | executes | FIELD_REGISTRY owner | capability | live evidence | filterKeys bridge | in CFK | workflows |
|---|---|---|---|---|---|---|---|
| `price` | yes | `list_price` | yes | — | yes | no | sale, rent, cma |
| `bedrooms` | yes | `bedrooms` | yes | — | yes | no | sale, rent, cma |
| `bathrooms` | yes | `bathrooms` | yes | — | yes | no | sale, rent, cma |
| `rooms` | yes | `rooms_total` | needs_probe | — | no | no | sale, rent |
| `living_area` | yes | `living_area` | yes | — | yes | no | sale, rent, cma |
| `market_status` | yes | `standard_status` | yes | **yes** | yes | no | sale, rent, cma |
| `property_sub_type` | yes | `property_sub_type` | yes | — | no | no | sale, rent, cma |
| `ownership` | yes | `ownership` | yes | — | no | yes | sale |
| `borough` | yes | `borough` | yes | — | yes | yes | sale, rent, building, cma |
| `neighborhood` | yes | `neighborhood` | yes | — | yes | yes | sale, rent, building, cma |
| `postal_code` | yes | `postal_code` | yes | — | no | no | sale, rent, building |
| `street_address` | yes | `address` | yes | — | no | no | sale, rent, building |
| `unit` | yes | `unit` | needs_probe | — | no | no | sale, rent |
| `building_name` | yes | `building_name` | needs_probe | — | no | no | sale, rent, building |
| `listing_id` | yes | `provider_listing_id` | needs_probe | — | no | no | sale, rent |
| `listing_activity_date` | yes | `activity_date` | needs_probe | — | no | no | sale, rent |
| `contract_date` | yes | `listing_contract_date` | needs_probe | — | no | no | sale |
| `close_date` | yes | `close_date` | needs_probe | — | no | no | sale, cma |
| `year_built` | yes | `year_built` | needs_probe | **yes** | no | yes | sale, rent, building |
| `stories` | yes | `stories_total` | needs_probe | — | no | no | building |
| `units_in_building` | yes | `units_total` | needs_probe | — | no | no | building |
| `listing_remarks_keyword` | yes | `public_remarks_keyword` | needs_probe | — | no | no | sale, rent |
| `management_company` | yes | `management_company` | **unsupported** | — | no | no | building |
| `feature_criteria` | yes | `amenities` | needs_probe | — | no | no | sale, rent |
| `max_financing` | **no** | — | — | — | no | no | sale |

```
business concepts:                        25
  executing end to end today:             24
  with a FIELD_REGISTRY owner:            24
  with a registry filterKeys bridge:       7
  whose canonical name exists in CFK:      4
  with live Cotality evidence recorded:    2
  owned by the checkbox normalizer:        1
```

---

## 2. The design question is now settled by evidence, not preference

The open question was whether the canonical business identity should live in the
workflow criteria contracts (preferred) or in `CanonicalFilterKey`.

**Every one of the 24 executing concepts already has exactly one
`FIELD_REGISTRY` owner.** No concept has zero owners; none has two. B2 made that
true when it gave the registry a real join key.

So the preferred design is not merely nicer — it is *already two-thirds built*:

- the registry's `canonicalKey` is the single canonical business identity;
- `searchParams` is the wire adapter (done in B2);
- `filterKeys` is the persistence adapter (**7 of 24 populated** — this is the
  gap B1 fills);
- `mappingOwner` delegates provider mapping to the five specialised modules
  (done in B2);
- `CanonicalFilterKey` becomes **derived from** the registry rather than
  maintained beside it, and `PARAM_ALIASES` becomes a legacy boundary adapter.

`CanonicalFilterKey` covers 4 of 25 canonical names today. Expanding it by hand
to 25 would have produced the ninth vocabulary. **Generating it from the registry
removes one instead.**

---

## 3. The canonical naming proposal — for review before it becomes code

One concept, one name. Every other name becomes a boundary alias. Naming follows
`CURRENT.md` §1: Mallan business terminology or a verified Cotality fact name; no
RLS / RESO / RealPlus / Trestle terms; no legacy carrier promoted.

**Adopt the registry's `canonicalKey` unchanged** for 17 concepts where it is
already good business terminology (`list_price`, `bedrooms`, `bathrooms`,
`living_area`, `ownership`, `borough`, `neighborhood`, `postal_code`, `unit`,
`building_name`, `year_built`, `close_date`, `listing_contract_date`,
`property_sub_type`, `rooms_total`, `stories_total`, `units_total`).

**Five naming decisions need Maya's call**, because the current registry key is
either a provider field name doing duty as a business concept, or points at the
wrong owner:

| concept | registry key today | proposed | why |
|---|---|---|---|
| market status | `standard_status` | `market_status` | `StandardStatus` is the Cotality FIELD. The Mallan business concept is market status, and lane A already uses that term throughout. §1 permits a verified Cotality fact name, so this is a preference, not a violation — but two names for one concept across lanes is how drift starts. |
| listing id | `provider_listing_id` | `listing_id` | **Likely wrong owner.** `provider_listing_id` is the Cotality ListingId as *provider evidence*; `listing_id_canonical` is the Mallan canonical reference and is dual-domain (`SL-`/`RL-` or a provider id). Searching by listing id should resolve the canonical reference. Needs deciding, not assuming. |
| street address | `address` | `street_address` | The executor builds a STRUCTURED predicate over StreetNumber / StreetDirPrefix / StreetName / BuildingName. `address` reads like the whole address object. |
| keyword | `public_remarks_keyword` | keep | Accurate and already names its single provider field. |
| feature criteria | `amenities` | `feature_criteria` | The checkbox family covers more than amenities (cooling, garage, view, laundry, pets, furnished). `amenities` under-describes what it owns, and this is the one concept the live normalizer already governs. |

**`rlsId` is not promoted.** It is compatibility debt (§1) and becomes
`listing_id` at the canonical layer, retired from the collector when the
serializer is replaced. The same applies to `resoStatuses` inside the serializer.

---

## 4. What the matrix says B1 must actually do

1. **Fill the `filterKeys` bridge** on the 17 registry entries that lack it. That
   is the single change that makes persistence expressible — not a new vocabulary.
2. **Generate `CanonicalFilterKey` from the registry**, and demote
   `PARAM_ALIASES` to a legacy read adapter.
3. **Define `SaleCriteria` / `RentalCriteria` / `BuildingCriteria` /
   `ComparableCriteria`** over the canonical names, using the `workflows` column.
   Rental is its own contract, not Sale plus flags — the column already shows
   where they genuinely differ (`ownership`, `contract_date` are sale-side;
   `stories`, `units_in_building`, `management_company` are building-side).
4. **Compose with `saved-search-normalizer.ts`, never beside it.** It already
   owns `feature_criteria` at the persistence boundary, runs at all four call
   sites, owns no vocabulary of its own and fails closed on the unrecognised.
   B1 widens its remit to the other 24 concepts; it does not add a second
   normalizer.
5. **Bind both UI depths to one object.** Basic and Advanced become views;
   switching changes presentation only.
6. **Generate transport from the object.** `URLSearchParams` becomes output only.

---

## 5. What this matrix does NOT establish

**22 of the 24 executing concepts have no recorded live Cotality evidence.**

> price · bedrooms · bathrooms · rooms · living_area · property_sub_type ·
> ownership · borough · neighborhood · postal_code · street_address · unit ·
> building_name · listing_id · listing_activity_date · contract_date ·
> close_date · stories · units_in_building · listing_remarks_keyword ·
> management_company · feature_criteria

Only `market_status` and `year_built` carry a probe record in the registry.

Repo code proves what Mallan **asks for**. It does not prove Cotality accepts,
populates or semantically means it (§1). Those 22 are the provider-semantics
backlog, and B1 must not silently convert any of them from `needs_probe` to
`yes`. `management_company` is already correctly recorded as `unsupported` — the
executor refuses it, and that refusal is part of the contract.

Nothing in this document asserts a Cotality fact.
