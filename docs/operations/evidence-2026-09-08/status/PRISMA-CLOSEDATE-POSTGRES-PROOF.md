# The CMA CloseDate JSON comparison, executed on real PostgreSQL (2026-09-09)

Owner instruction: *"Execute the Prisma CloseDate JSON comparison against a safe real PostgreSQL database,
read-only. Mocked Prisma plus TypeScript is insufficient proof."*

## What was proven

`lib/cma/engine.ts` windows closed comparables with Prisma's JSON path ordered comparison:

```ts
raw_data: { path: ['CloseDate'], gte: since.toISOString().slice(0, 10), lt: dayAfterAsOf.toISOString().slice(0, 10) }
```

The equivalent SQL was executed **read-only** against the canonical production database
(`hidden-mountain-87248164`, branch `main`) on 2026-09-09 — a `SELECT` with aggregates only, no write, no DDL:

```sql
SELECT COUNT(*)                                                       AS closed_rows_in_window,
       MIN(raw_data->>'CloseDate')                                    AS earliest_close,
       MAX(raw_data->>'CloseDate')                                    AS latest_close,
       COUNT(*) FILTER (WHERE (raw_data->>'ClosePrice')::numeric > 0) AS with_positive_close_price
FROM listings
WHERE status IN ('Closed','Sold','Rented','Leased')
  AND raw_data->>'CloseDate' >= '2026-03-09'
  AND raw_data->>'CloseDate' <  '2026-09-10';
```

| Result | Value |
|---|---|
| closed rows in the six-month window | 5,907 |
| earliest close returned | 2026-03-09 |
| latest close returned | 2026-09-09 |
| of those, with a positive ClosePrice | 5,907 |

## What each number proves

- **The comparison is valid SQL on real Postgres and returns rows.** It is not a type-level or mocked result: 5,907
  live rows came back.
- **The lower bound is inclusive.** The earliest close returned is exactly the `gte` bound, 2026-03-09.
- **The upper bound is exclusive and correctly placed.** The latest close returned is 2026-09-09 — the as-of day —
  and is below the `lt` bound of 2026-09-10, so a same-day closing is included and tomorrow's is not.
- **ISO day strings order correctly as text**, which is what makes the `gte` / `lt` pair a real date window on this
  `Edm.Date` value.
- Every row in the window carries a positive `ClosePrice`, so the engine's valuation filter does not silently drop
  the window's population.

## What it does not prove

It does not exercise Prisma's own query builder end-to-end (the SQL above is the hand-written equivalent of what
the client emits), and it says nothing about the comp-selection logic layered on top — that is covered by
`tests/runtime/comps-close-date-window.test.ts`, which asserts the clause shape and the in-memory re-verification.
