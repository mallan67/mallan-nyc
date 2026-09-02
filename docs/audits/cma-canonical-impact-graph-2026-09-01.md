# CMA — canonical impact graph and evidence

**Date:** 2026-09-01
**Branch / head at audit:** `fix/neon-p0-event-driven-wake-2026-08-16` @ `3a54ee9c`
**Status:** AUDIT ONLY. No CMA engine change was made or promoted.
**Authority:** every Cotality fact below comes from an HTTP response received
from `api.cotality.com` during the session dated above. Nothing here is quoted
from repo constants, `$metadata`, or a prior audit.

---

## 1. Why this document exists

The existing `lib/cma/engine.ts` was proposed for a one-field correction and that
proposal was rejected. This records what the audit found, so the professional CMA
is built from evidence rather than from the legacy engine's assumptions.

**A correction to an earlier claim of mine.** I previously reported that the CMA's
data source could not supply `ClosePrice`. That was wrong. I checked only the
typed `Listing` Prisma model, found no `close_price` column, and concluded the
fact was unavailable — without checking `raw_data`, the archive tables, or the
existing readers. In a codebase that deliberately keeps provider facts in
`raw_data` to avoid schema growth, "not a typed column" and "not available" are
different claims.

---

## 2. What the live provider actually delivers

Probed 2026-09-01 against `api.cotality.com`.

### Closed SALES — 600 rows read (`StandardStatus eq 'Closed' and PropertyType ne 'ResidentialLease'`)

| field | populated |
|---|---|
| `ClosePrice` | **600 / 600** |
| `CloseDate` | **600 / 600** |

- `ClosePrice == ListPrice` on **533 / 600 (88.8%)**
- `ClosePrice != ListPrice` on **67 / 600 (11.2%)** — 53 sold **below** ask, 14 **above**
- when different: min 0.806, median 0.975, max 10.000 (the max is an outlier that
  should be treated as suspect data, not as a 10× sale)

### Closed LEASES — 400 rows read (`PropertyType eq 'ResidentialLease'`)

| field | populated |
|---|---|
| `ClosePrice` | **400 / 400** |
| `CloseDate` | **400 / 400** |
| `LeaseAmount` | **0 / 400** |
| `TotalActualRent` | **0 / 400** |

- `ClosePrice == ListPrice` on **376 / 400 (94.0%)**; when different, median ratio
  **1.005** — slightly above ask, consistent with rental bidding.

### What this establishes, and what it does not

**Established.** `ClosePrice` and `CloseDate` are delivered and fully populated on
closed sales AND closed leases. `ClosePrice` is a genuinely distinct fact from
`ListPrice`, diverging with a distribution that looks like real transactions.

**Established.** `LeaseAmount` and `TotalActualRent` are declared in `$metadata`
and **never delivered** — 0% on 400 closed leases. They may not be used for
achieved rent. This is the same shape the bath contract found for
`BathroomsPartial`: declared, never populated.

**NOT established — an open question a professional CMA must not assume away.**
88.8% of closed sales (94% of leases) report `ClosePrice` exactly equal to
`ListPrice`. That is consistent with closing at ask, and equally consistent with
some records defaulting the field to the list price. These two explanations cannot
be separated from the data above, and they have different consequences for a
valuation. **UNVERIFIED** until probed directly.

---

## 3. Where the fact is retained Mallan-side

Traced statically at the head above. No database probe was run.

```
COTALITY Property.ClosePrice / CloseDate
  -> lib/idx/card-fields.ts:32,34        ClosePrice + CloseDate are in the card select
  -> lib/idx/mapping.ts:51,177,308       ClosePrice -> closePrice
  -> Listing.raw_data.ClosePrice         (Json column, schema.prisma:51)
       read by lib/idx/db-to-public-dto.ts:533
       read by scripts/comps/by-property.ts:167-174  <- already uses it for Closed
  -> ListingsArchive.close_price / close_date
       written by lib/retention/archive-terminals.ts:155-156, FROM raw.ClosePrice
       indexed on close_date, (neighborhood, close_date), (borough, close_date)
```

**Consequences.**

- The fact is present at every layer. **No schema growth is required**, which
  matches the field registry's own note that the existing raw/provider structures
  already carry provider identity facts.
- `ListingsArchive` is a **promotion of `raw_data` into typed columns for terminal
  rows**, not a second source. It carries `listing_id` for cross-reference and
  `listing_key` for the provider key, so archived observations reconcile to the
  same identity rather than forming a parallel universe.
- `lib/cma/engine.ts` reads none of it.

---

## 4. What the legacy engine actually does

`lib/cma/engine.ts`, unchanged at this head:

- queries `prisma.listing` directly, combining `status: 'Active'` and
  `status: 'Closed'` into one pool;
- values **every** comp from `list_price`, including Closed ones;
- awards Closed comps `similarity += 10` with the comment "Closed sales are
  better comps" — trusting them more *for being real transactions*, then pricing
  them as listings;
- blends the resulting adjusted prices into a single valuation;
- applies hard-coded, timeless `ADJUSTMENT_RATES` percentages.

Against the Master Plan this is wrong in kind, not in detail:

| Master Plan requires | legacy engine |
|---|---|
| final SALE comp set = VERIFIED CLOSED transactions | Active + Closed blended |
| never substitute asking price for ClosePrice | asking price used for every comp |
| Active/Pending/In-Contract/Expired = separately labelled context | merged into the valuation |
| agent selects final comps | engine selects and blends |
| adjustments reviewable/auditable | timeless hard-coded percentages |
| canonical Search/CMA universe and identity | queries `prisma.listing` directly |

A field-level patch cannot reconcile these. **The engine must not be promoted as
the professional CMA engine**, and a Closed candidate lacking a verified
`ClosePrice` must not enter the valuation set merely because its status is
Closed — it may be retained only as separately labelled context.

---

## 5. The canonical impact graph to build against

```
Subject Property
  -> authoritative Search / Comparable market universe   (one universe, one identity)
  -> VERIFIED CLOSED transaction facts                   (ClosePrice + CloseDate)
       - sales:   ClosePrice
       - rentals: ClosePrice is the achieved figure; LeaseAmount and
                  TotalActualRent are never delivered and may not be used
       - a Closed row WITHOUT a verified ClosePrice is context, never valuation
  -> Agent-selected final comps                          (the agent decides, not the engine)
  -> Context evidence, separately labelled               (Active / Pending / In Contract / Expired)
  -> Adjustments and analysis                            (reviewable and auditable, not timeless constants)
  -> Strategy
  -> Saved / versioned CMA
  -> Reopen
  -> Client-safe preview
  -> Share / Email                                       (governed recipient access, real delivery, delivery state)
  -> Attribution and privacy proof
```

Constraints carried from the ruling: no parallel CMA engine; no invented
ClosePrice; no asking price posing as a sold price; no timeless hard-coded
adjustment engine; no schema or migration without authorization.

---

## 6. Open questions to resolve before implementation

1. **The 88.8% equality.** Is `ClosePrice` genuinely equal to `ListPrice` on those
   rows, or defaulted? A CMA weighting closed transactions cannot leave this
   unanswered. Probe directly.
2. **Closed-comp population in Mallan storage.** The provider delivers
   `ClosePrice` on 100% of closed rows; what fraction of Closed rows *retained in
   Mallan storage* carry it in `raw_data`, and over what window? Not measured here
   — it needs a read this audit did not perform.
3. **Archive participation.** How `ListingsArchive` rows join the live universe
   for a comp search without producing duplicate identities for one property.
4. **Adjustment model.** What replaces the hard-coded rates, and what makes an
   adjustment auditable — stored basis, agent override, or both.
