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
6.

### CORRECTION 2026-08-28 — a live boundary already reconciles part of this

The first version of this document said *"nothing reconciles them."* **That was
false**, and a false claim in a trace document is precisely what sends the next
reader in a circle. Corrected here rather than quietly edited away.

`lib/search/canonical/saved-search-normalizer.ts` is a **live persistence
boundary**, not a dormant type file. It is invoked at six call sites across both
Saved Search routes — `POST`, `PATCH`, `GET` list and `GET` one — so it runs on
every read and every write:

| Route | Call sites |
|---|---|
| `app/api/crm/saved-searches/route.ts` | `normalizeSavedSearchCriteria` ×2, `savedSearchDisposition` ×1 |
| `app/api/crm/saved-searches/[id]/route.ts` | `normalizeSavedSearchCriteria` ×4, `savedSearchDisposition` ×1 |

What it already owns, and owns correctly:

- it canonicalises the `checkbox_filters` portion through the **checkbox
  registry**, and deliberately **owns no vocabulary of its own** — an earlier cut
  kept a private `BOOLEAN_CANONICAL` map beside `crm-idx-filter`'s `booleanFields`
  and that duplication was removed on purpose;
- it **fails closed on unrecognised criteria** rather than dropping them, because
  dropping one silently converts a RESTRICTIVE saved search into a BROADER one —
  the broker saves "doorman only" and reloads "everything". That is the same
  silent-widening failure as the dropped `status` param, arriving through
  storage;
- it normalises legacy rows **in memory on read**, with no migration or backfill.

So the accurate statement is: **the Saved Search contract is fragmented, and the
`checkbox_filters` portion of it already has a correct canonical boundary that
runs everywhere it needs to.** The other criteria have no equivalent.

**This is a constraint on B1, and a favourable one.** The normalizer is not an
obstacle to route around — it is the pattern the rest should extend: one boundary
module, invoked at every persistence point, owning no vocabulary of its own,
resolving through a registry, failing closed on the unrecognised. B1 must
**compose with it and widen its remit**, never add a second normalizer beside it
and never replace it.

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

## 2b. CORRECTION 2026-08-28 — the conclusion I drew from this was also wrong

The first version of this document concluded that `CanonicalFilterKey` "is the
right target" and should be completed to cover all 36 executable criteria.

**Rejected, on Maya's correction.** Filling an unwired list with 36 names
produces a cleaner **ninth** vocabulary rather than removing any of the eight.
Its own header says it is not wired; `FIELD_REGISTRY` already calls itself the
Search mapping authority and, since B2, is actually joinable. Expanding the
unwired one and declaring it primary would be motion, not progress.

The principle that replaces that conclusion:

> **One concept may have many boundary aliases, but only one canonical business
> identity.**

Two designs are admissible, and one must be *proven* before any vocabulary is
expanded:

- **Preferred.** The workflow criteria contracts (`SaleCriteria`,
  `RentalCriteria`, `BuildingCriteria`, `ComparableCriteria`) define the canonical
  business keys. `CanonicalFilterKey` becomes derived/type-level support around
  those keys, and `PARAM_ALIASES` becomes a legacy boundary adapter rather than
  business authority.
- **Alternative.** `CanonicalFilterKey` stays primary — and then the criteria
  contracts, Saved Search and the registry all derive their names **from** it
  rather than independently restating them.

What is not admissible is both existing as independently maintained lists.

## 3. What this constrains about B1

The Step 1 gate says B1 must not create a second persistence contract. There are
already two, so the constraint is stronger than it looks:

1. **`SaleCriteria` / `RentalCriteria` must not become vocabulary #9.** Defining
   them in fresh key names — the obvious move — would add a ninth naming of the
   same 36 criteria and make the reconciliation strictly harder.

2. **`CanonicalFilterKey` is the only vocabulary designed to be persisted**
   (versioned, fail-loud on unknown keys, migration-aware) — but see 2b: that
   does NOT make it the authority to expand. It currently covers 15 of 36
   executable criteria and carries
   members no executable criterion maps to (`transit`, `near`, `commercial`,
   `open_house`). It has to be completed and reconciled BEFORE the criteria
   objects are keyed by it, or the objects inherit its gaps.

3. **The registry already owns the bridge and barely uses it.** `FieldSpec`
   carries `filterKeys?: readonly CanonicalFilterKey[]`, populated on **7**
   entries. That field — not a new table — is where criterion → persistence key
   belongs, exactly as `searchParams` became the criterion → wire join in B2.

**Therefore the order is** (superseding the version first written here, which
began by expanding `CanonicalFilterKey` — see 2b):

1. **Freeze symptom patching.** The `status` correction at `0d9a78c2` was
   justified because it PROVED the defect class. Fixing rooms, then year, then
   managementCompany, then unit one at a time would be twenty more commits
   against one architectural defect.
2. **Complete the impact graph as ONE MATRIX** — one row per business concept,
   not per code key. That matrix is the replacement SPECIFICATION, not another
   audit.
3. **Choose one canonical business name per concept.** Not `status` here,
   `statuses` there, `standard_status` elsewhere. No legacy name is promoted.
4. **Build `SaleCriteria` / `RentalCriteria` from that vocabulary**, with the
   criteria contract and the persistence vocabulary in the SAME conceptual
   namespace.
5. **Make `FIELD_REGISTRY` the bridge** — it already owns `searchParams` and
   `filterKeys`. Converge there or delegate from there to existing specialised
   owners. No new translation table beside it.
6. **Preserve `saved-search-normalizer.ts`** and compose around it.
7. **Bind the UI to one state object.** Both views read and write the same
   object; switching changes presentation only.
8. **Generate transport from the object.** `URLSearchParams` becomes output only.
9. **Persist the same object**, versioned, inside existing JSON storage.
10. **Only then replace readers** — Saved Search restore, Map, workbench,
    Compare, Reports, CMA.

This changes the work from `find bug → patch → find next bug` into
`inventory all authorities → choose one → replace all writers → replace all
readers → test the graph once`.

---

## 4. Not decided here

- Whether `transit`, `near`, `commercial` and `open_house` should be removed from
  `CanonicalFilterKey` or wired. They name no executable criterion today; the
  serializer explicitly warns-and-strips transit/grid because the feed carries no
  Latitude/Longitude.
- Any provider semantics. This document compares Mallan tables to each other.
  Cotality field truth comes only from the live authenticated API.
- Any change to `SavedSearch.criteria` storage. No schema work is authorized.
