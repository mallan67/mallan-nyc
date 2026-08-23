# Cotality toolkit — read-only diagnostic kit

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
node scripts/cotality/analyze.js

# Same, JSON output (pipeable)
node scripts/cotality/analyze.js --json | jq

# Compare Trestle ↔ DB ↔ public for active sales
node scripts/cotality/parity.js --status=Active --type=sale

# Probe Trestle directly
node scripts/cotality/count.js --entity=Property --filter="StandardStatus eq 'Active'"
node scripts/cotality/query.js --entity=Property --top=3 --select="ListingId,StandardStatus,ListPrice"
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
| `snapshot.js` | Capture an `analyze` JSON snapshot to `artifacts/cotality-snapshots/YYYY-MM-DDTHHmmssZ.json` + `latest.json` for cross-time diffs. | Trestle + DB + public site |
| `gate-breakdown.js` | For a baseline filter, show how many listings each successive gate eliminates (drop-off per gate). Has `--dry-run` to emit queries without burning quota. | Trestle |
| `drift.js` | **Trestle ↔ REBNY field-set drift tracker.** Diffs Trestle's live `$metadata` (cached at `artifacts/metadata.xml`) against the REBNY IDX Plus CSV (`data/rebny-rls-property-fields.csv`). Persists dated snapshots in `artifacts/cotality-drift/` and surfaces deltas vs the prior run — so when Trestle (currently certified on Cotality DD 2.0; not yet on DD 2.1) catches up, or REBNY adjusts the IDX Plus subset, you see it. | metadata.xml + REBNY CSV (no Trestle calls) |
| `route-catalog.js` | Static analysis of every `app/api/*/route.ts` — HTTP methods, auth posture (broker/agent/portal/cron/admin/public), distribution-gate signals, compliance signals (audit-event, fair-housing scan, attribution, consent capture). Output: `artifacts/api-route-catalog.md` + `.json`. | local source only |
| `schema-audit.js` | Column-by-column compare of `prisma/schema.prisma` Listing model vs REBNY CSV vs Trestle metadata. Names every column as `Cotality+Trestle aligned`, `mallan-internal (no Cotality mapping)`, or `drift`. Output: `artifacts/schema-audit.md` + `.json`. | local source only |
| `lib/trestle-client.js` | Shared OAuth + OData helpers used by the rest of the kit | — |

## Examples

### 1. Site status snapshot

```bash
node scripts/cotality/analyze.js
```

Single-screen view with Trestle live counts, distribution-gate breakdown,
DB / projection / sync state, public-site probe, and parity deltas. The
fastest way to see where the site stands at a moment in time.

### 2. Why isn't this listing showing up?

```bash
# Single-listing trace through Trestle → DB → projection → gates → public site:
npm run cotality:trace -- --listing-id=RLS20059088

# JSON form (good for piping into a ticket / chat message):
npm run cotality:trace -- --listing-id=RLS20059088 --json | jq
```

`trace.js` is the operational tool for "where did this listing go?"
It pulls the record from Trestle, looks it up in the DB Listing +
projection tables, evaluates each distribution gate, and probes the
public detail page. Output names the exact gate (or absence) that's
suppressing the listing.

For broader filter-level diagnostics:

```bash
node scripts/cotality/parity.js --status=Active --type=sale --json
node scripts/cotality/query.js --entity=Property --filter="ListingId eq '<id>'" --top=1
```

`parity.js` shows the gap between Trestle and the public site at a
filter level. `query.js` lets you read a single listing directly from
Trestle to compare what the upstream sees.

### 3. Lookup drift catch

```bash
node scripts/cotality/lookups.js --entity=Property --field=PropertySubType --sample=2000
node scripts/cotality/lookups.js --entity=Property --field=CommonInterest --filter="StandardStatus eq 'Active'"
```

Compare against `data/rebny-rls-property-lookup.csv` to flag enum values
that REBNY documents but our feed doesn't populate (or vice versa).

### 4. Field-population coverage

```bash
node scripts/cotality/coverage.js --entity=Property \
  --fields="ListingId,StandardStatus,ListPrice,BedroomsTotal,BathroomsTotalInteger,LivingArea,Latitude,Longitude,YearBuilt,CommonInterest,Furnished" \
  --sample=2000 --filter="StandardStatus eq 'Active'"
```

Per-field `populated_pct`. Useful before promoting a Trestle field into
a projection column or saved-search criterion.

### 5. Cross-time snapshots (no Trestle quota burn for diffs)

```bash
# Run when you want a "this is the state right now" record:
npm run cotality:snapshot

# Compare to the last one:
diff <(jq . artifacts/cotality-snapshots/latest.json) <(jq . artifacts/cotality-snapshots/2026-04-29T*.json)
```

`snapshot.js` runs `analyze.js --json` and persists the result to
`artifacts/cotality-snapshots/YYYY-MM-DDTHHmmssZ.json` plus a fixed
`latest.json` so diffs are trivial.

### 6. Per-gate drop-off

```bash
# Plan probes without spending quota:
npm run cotality:gate-breakdown -- --dry-run

# Real run:
npm run cotality:gate-breakdown -- --status=Active --type=sale --json
```

Each row = one Trestle probe answering "how many of the baseline match
this gate-blocking condition?" Notes that `OwnerOptOut` and
`ParticipantOnly` are NOT queryable on IDX Plus — those listings are
pre-filtered upstream and don't appear in the baseline at all.

### 7. Cotality ↔ Trestle ↔ REBNY drift tracking

```bash
# Diff Trestle metadata vs REBNY IDX Plus CSV (uses cached metadata.xml — no Trestle call):
npm run cotality:drift

# Property-only:
npm run cotality:drift -- --resource=Property --json | jq '.resources.Property'
```

Trestle is currently certified on Cotality Web API Core 2.0.0 + DD 2.0 +
DD 1.7. Cotality has DD 2.1 published; Trestle has not certified there
yet. REBNY ships its own IDX Plus subset on its own cadence. `drift.js`
persists a dated snapshot every run, so when any side moves, the next
run surfaces the delta.

To refresh the Trestle-side cache (one-time, when you want to pick up
new $metadata): `npx tsx scripts/refresh-trestle-csv.ts`.

### 8. Compliance topology

```bash
# Static analysis of every API route — auth posture + gate enforcement + compliance signals:
npm run cotality:route-catalog

# Schema column ↔ Cotality PascalCase ↔ REBNY CSV ↔ Trestle metadata, three-way:
npm run cotality:schema-audit
```

`route-catalog.js` outputs a single Markdown table to
`artifacts/api-route-catalog.md` — useful as a shareable artifact and
as input for future audit tools. `schema-audit.js` does the same for
every column on the Prisma `Listing` model so you can see which DB
columns are Cotality-aligned vs deliberately mallan-internal vs drifting.

Both are read-only and zero-cost to run (no Trestle calls, no DB
queries) — fast enough to run as a pre-commit / pre-release check.

## Hard limits

- Read-only. Nothing in this kit writes to Postgres or to Trestle.
- Does not modify schema, migrations, env, Vercel config, CRM routes,
  or anything in the `lib/idx/` / `lib/search/` writer paths.
- Does not push to git.
- Aborts cleanly on transient Trestle 5xx responses; safe to re-run.

## Recommended next steps

When the master-plan migration finishes (~May 5–6), this kit is the
seed for:

- `scripts/cotality/search/` — saved-search clone/replay tools (turn each
  CRM saved search into a continuously-tested regression target).
- `scripts/cotality/snapshot/` — capture "expected count + sample IDs" for
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
- Field registry: `data/RLS-FIELD-REGISTRY.md` — **DEPRECATED / HISTORICAL SNAPSHOT (2026-03-20), NOT field authority. Verify live against Cotality.**
- Authoritative field list: `data/rebny-rls-property-fields.csv`.
- Lookup values: `data/rebny-rls-property-lookup.csv`.
