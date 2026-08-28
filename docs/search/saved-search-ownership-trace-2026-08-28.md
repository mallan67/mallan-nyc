# Saved Search persistence ownership — the trace Section 4's gate requires

**Date:** 2026-08-28
**Branch:** `fix/neon-p0-event-driven-wake-2026-08-16` (PR #618)
**Section:** 4 — Search Step 1 (B1 canonical criteria contracts)
**Gate item:** *"Saved Search persistence/restore ownership has been traced so B1
does not create a second persistence contract."*

**Status: TRACED. Nothing changed by this document.** It exists because
`SaleCriteria` / `RentalCriteria` cannot be designed safely until it is known
what already claims to own a saved criterion — and two contracts already do.

Reproduce: `node scripts/search/criterion-vocabulary-census.mjs`
(read-only source parsing — no network, no database, no Cotality).

---

## 1. Eight vocabularies describe one criterion

| # | Vocabulary | Lives in | Wired? |
|---|---|---|---|
| 1 | DOM element ids, per mode AND per tab | `collectSearchCriteria()` | yes |
| 2 | `criteria.*` camelCase | the collector's output | yes |
| 3 | request params (`minPrice`, `maxBeds`…) | `buildIdxSearchParams` → `api-client.js` | yes |
| 4 | server reads (`params.get(...)` + numeric table) | `lib/search/crm-idx-filter.ts` | yes |
| 5 | `canonicalKey` / `searchParams` | `field-registry.ts` | joined in B2 (`37d32cf2`) |
| 6 | `CanonicalFilterKey` + `PARAM_ALIASES` | `lib/search/canonical/filter-keys.ts` | **NO — its own header says "NOT WIRED"** |
| 7 | saved-record snake_case (`min_price`, `close_date_from`…) | `_criteriaToApiFormat()` → `SavedSearch.criteria` | yes |
| 8 | `SavedSearchCriteria { criteria_version, filters, sort }` | `lib/search/canonical/saved-search.ts` | type + validators only |

**Vocabularies 7 and 8 are two persistence contracts for one saved search.** The
browser writes 7. The validators in `saved-search.ts` expect 8, which is keyed by
6. Nothing reconciles them.

---

## 2. The measured disagreement

```
collected criteria:                              37
executable (emitted AND read by the server):     36
  NOT nameable by CanonicalFilterKey:            21
  NOT written to the browser's saved record:      0
```

The browser persists everything it can execute. **The versioned contract can
name only 15 of the 36.** `savedSearchVersionState()` returns `'invalid'` for any
`filters` key outside `CanonicalFilterKey`, so a saved search containing any of
these 21 cannot survive a versioned save at all:

```
buildingName      checkboxFilters   contractDateFrom  contractDateTo
dateActivityType  dateFrom          dateTo            floorsMax
floorsMin         managementCompany rlsId             roomsMax
roomsMin          soldDateFrom      soldDateTo        statuses
unit              unitsMax          unitsMin          yearMax
yearMin
```

### `statuses` is in the list for a different reason, and it matters

`CanonicalFilterKey` *does* contain `'statuses'`. It still fails, because the
wire param is **`status`** (singular) and `PARAM_ALIASES` maps only `statuses`.
The alias table was written against a param name that is not the one in use.

That is the same defect class as the missing `params.status` assignment fixed in
`0d9a78c2`: a mapping table maintained beside the code it describes, agreeing
with an earlier version of it. Two tables, one meaning, no join — the exact
problem B2 corrected for the registry and that `filter-keys.ts` still has.

---

## 3. What this constrains about B1

The Step 1 gate says B1 must not create a second persistence contract. There are
already two, so the constraint is stronger than it looks:

1. **`SaleCriteria` / `RentalCriteria` must not become vocabulary #9.** Defining
   them in fresh key names — the obvious move — would add a ninth naming of the
   same 36 criteria and make the reconciliation strictly harder.

2. **`CanonicalFilterKey` is the only vocabulary designed to be persisted**
   (versioned, fail-loud on unknown keys, migration-aware). It is the right
   target — but it currently covers 15 of 36 executable criteria and carries
   members no executable criterion maps to (`transit`, `near`, `commercial`,
   `open_house`). It has to be completed and reconciled BEFORE the criteria
   objects are keyed by it, or the objects inherit its gaps.

3. **The registry already owns the bridge and barely uses it.** `FieldSpec`
   carries `filterKeys?: readonly CanonicalFilterKey[]`, populated on **7**
   entries. That field — not a new table — is where criterion → persistence key
   belongs, exactly as `searchParams` became the criterion → wire join in B2.

**Therefore the order is:** complete `CanonicalFilterKey` against the 36
executable criteria and fill the registry's `filterKeys` bridge → define
`SaleCriteria` / `RentalCriteria` keyed by it → bind the DOM to the object →
derive transport → reconcile the two saved-record shapes into one.

Defining the criteria objects first would have keyed them to a vocabulary that
cannot express 21 of the criteria they must carry.

---

## 4. Not decided here

- Whether `transit`, `near`, `commercial` and `open_house` should be removed from
  `CanonicalFilterKey` or wired. They name no executable criterion today; the
  serializer explicitly warns-and-strips transit/grid because the feed carries no
  Latitude/Longitude.
- Any provider semantics. This document compares Mallan tables to each other.
  Cotality field truth comes only from the live authenticated API.
- Any change to `SavedSearch.criteria` storage. No schema work is authorized.
