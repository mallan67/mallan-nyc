# RESO toolkit — read-only diagnostic kit

A small, composable set of OData-against-Trestle / Postgres / public-site
probes. Every tool is read-only — none of these write to the project DB,
none mutate Trestle, none push code. Safe to run alongside the master-
plan migration.

## Setup

Tools auto-load `.env.local` and need only:
- `IDX_CLIENT_ID`
- `IDX_CLIENT_SECRET`

For DB-aware tools (`parity.js`, `analyze.js`):
- `DATABASE_URL` (already set in `.env.local`)

No new dependencies.

## Quick start

```bash
# One-shot status report (Trestle + DB + public site)
node scripts/reso/analyze.js

# Same, JSON output (pipeable)
node scripts/reso/analyze.js --json | jq

# Compare Trestle ↔ DB ↔ public for active sales
node scripts/reso/parity.js --status=Active --type=sale

# Probe Trestle directly
node scripts/reso/count.js --entity=Property --filter="StandardStatus eq 'Active'"
node scripts/reso/query.js --entity=Property --top=3 --select="ListingId,StandardStatus,ListPrice"
```

## Tools

| Script | Purpose | Reads from |
|---|---|---|
| `analyze.js` | One-shot "current state of my site" — Trestle counts + DB + public site, parity deltas, table view (or `--json`) | Trestle + DB + mallan.nyc |
| `parity.js` | Side-by-side count comparison for a status/type filter | Trestle + DB + mallan.nyc |
| `count.js` | Generic `$count` against any Trestle entity, with optional `$filter` | Trestle |
| `query.js` | Generic OData GET (`$filter`/`$select`/`$top`/`$orderby`/`$expand`) | Trestle |
| `lookups.js` | Distinct enum values populated for a field (catches lookup drift, multi-value fields auto-split) | Trestle |
| `coverage.js` | Per-field populated % across a sample (catches "advertised but not populated") | Trestle |
| `trace.js` | **Trace a single ListingId through every layer** — Trestle live, DB Listing, DB projection, distribution-gate evaluation, public site. Shows exactly where a listing lands or drops. | Trestle (1) + DB + public site |
| `lib/trestle-client.js` | Shared OAuth + OData helpers used by the rest of the kit | — |

## Examples

### 1. Site status snapshot

```bash
node scripts/reso/analyze.js
```

Single-screen view with Trestle live counts, distribution-gate breakdown,
DB / projection / sync state, public-site probe, and parity deltas. The
fastest way to see where the site stands at a moment in time.

### 2. Why isn't this listing showing up?

```bash
# Single-listing trace through Trestle → DB → projection → gates → public site:
npm run reso:trace -- --listing-id=RLS20059088

# JSON form (good for piping into a ticket / chat message):
npm run reso:trace -- --listing-id=RLS20059088 --json | jq
```

`trace.js` is the operational tool for "where did this listing go?"
It pulls the record from Trestle, looks it up in the DB Listing +
projection tables, evaluates each distribution gate, and probes the
public detail page. Output names the exact gate (or absence) that's
suppressing the listing.

For broader filter-level diagnostics:

```bash
node scripts/reso/parity.js --status=Active --type=sale --json
node scripts/reso/query.js --entity=Property --filter="ListingId eq '<id>'" --top=1
```

`parity.js` shows the gap between Trestle and the public site at a
filter level. `query.js` lets you read a single listing directly from
Trestle to compare what the upstream sees.

### 3. Lookup drift catch

```bash
node scripts/reso/lookups.js --entity=Property --field=PropertySubType --sample=2000
node scripts/reso/lookups.js --entity=Property --field=CommonInterest --filter="StandardStatus eq 'Active'"
```

Compare against `data/rebny-rls-property-lookup.csv` to flag enum values
that REBNY documents but our feed doesn't populate (or vice versa).

### 4. Field-population coverage

```bash
node scripts/reso/coverage.js --entity=Property \
  --fields="ListingId,StandardStatus,ListPrice,BedroomsTotal,BathroomsTotalInteger,LivingArea,Latitude,Longitude,YearBuilt,CommonInterest,Furnished" \
  --sample=2000 --filter="StandardStatus eq 'Active'"
```

Per-field `populated_pct`. Useful before promoting a Trestle field into
a projection column or saved-search criterion.

## Hard limits

- Read-only. Nothing in this kit writes to Postgres or to Trestle.
- Does not modify schema, migrations, env, Vercel config, CRM routes,
  or anything in the `lib/idx/` / `lib/search/` writer paths.
- Does not push to git.
- Aborts cleanly on transient Trestle 5xx responses; safe to re-run.

## Recommended next steps

When the master-plan migration finishes (~May 5–6), this kit is the
seed for:

- `scripts/reso/search/` — saved-search clone/replay tools (turn each
  CRM saved search into a continuously-tested regression target).
- `scripts/reso/snapshot/` — capture "expected count + sample IDs" for
  arbitrary searches and replay daily; alert on drift.
- A future `analyze.js --history` mode that diffs against the previous
  run stored in R2.

## Related

- Existing read-only scripts that pre-date this kit:
  - `scripts/status-snapshot.js` — older single-purpose version of
    `analyze.js`. Same intent, different output shape.
  - `scripts/investigate-listing-gap.js` — narrower probe used to
    triage the 10,428 vs 5,169 gap during the migration.
- Cached Trestle metadata: `artifacts/metadata.xml`.
- Field registry: `data/RLS-FIELD-REGISTRY.md`.
- Authoritative field list: `data/rebny-rls-property-fields.csv`.
- Lookup values: `data/rebny-rls-property-lookup.csv`.
