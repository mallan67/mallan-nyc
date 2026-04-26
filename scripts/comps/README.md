# Comp tools — `scripts/comps/`

Parameterized CMA (Comparative Market Analysis) tools that read from the local Neon DB.

Read-only. No public-facing output. Distribution gates respected (`idx_display_yn`, `internet_entire_listing_display_yn`, `owner_opt_out=false`, `participant_only=false`) so the comp set matches what's publicly displayable.

## `by-property.ts`

Three-phase CMA pull for any property:

1. **Same building** — listings at the same `street_number` + `street_name` (skip if no `--street-number`)
2. **Nearby comps** — same beds, sqft window, in the specified neighborhoods/postal codes
3. **Rental comps** (optional, `--include-rentals`) — for sale/rent ratio analysis

### Examples

#### 1bd condop @ 333 E 46th St — co-op only (subject is a condop, prefer co-op comps over condo)

```bash
npx tsx scripts/comps/by-property.ts \
  --street "East 46th Street" --street-number 333 \
  --beds 1 --sqft 800 --sqft-window 150 \
  --neighborhoods "Turtle Bay,Midtown East" --postal-codes 10017 \
  --exclude-sub-types Condominium,Condo \
  --include-rentals
```

#### 2bd condo in West Village

```bash
npx tsx scripts/comps/by-property.ts \
  --street "Bleecker Street" \
  --beds 2 --sqft 1100 --sqft-window 200 \
  --neighborhoods "West Village" --postal-codes 10014
```

#### Studio in FiDi (no specific subject sqft — pull all studios)

```bash
npx tsx scripts/comps/by-property.ts \
  --street "Wall Street" \
  --beds 0 \
  --neighborhoods "Financial District" --postal-codes 10005,10006,10038 \
  --max-active 30
```

#### Rental comps for a 1bd in Williamsburg

```bash
npx tsx scripts/comps/by-property.ts \
  --street "Bedford Avenue" \
  --beds 1 --sqft 700 --sqft-window 100 \
  --neighborhoods "Williamsburg" --postal-codes 11211,11249 \
  --listing-type rent
```

#### JSON output (for piping into another tool or saving)

```bash
npx tsx scripts/comps/by-property.ts \
  --street "Park Avenue" \
  --beds 2 --sqft 1300 \
  --neighborhoods "Upper East Side" \
  --json > comp-report.json
```

### Required arguments

| Flag | Type | Description |
|---|---|---|
| `--street` | string | Street name to match (e.g. `"East 46th Street"`) |
| `--beds` | int | Bedrooms total |

### Optional arguments

| Flag | Type | Default | Description |
|---|---|---|---|
| `--street-number` | string | — | Specific street number for same-building (Phase 1 skipped if omitted) |
| `--sqft` | int | — | Subject sqft (window center) |
| `--sqft-window` | int | `150` | ± sqft tolerance for Phase 2 |
| `--neighborhoods` | csv | — | Neighborhoods to search (comma-separated) |
| `--postal-codes` | csv | — | Postal codes to search (comma-separated) |
| `--listing-type` | string | `sale` | `sale` or `rent` |
| `--months-back` | int | `6` | Closed listings cutoff (months) |
| `--exclude-sub-types` | csv | — | Property sub-types to exclude (e.g. `Condominium,Condo` for co-op subject) |
| `--include-rentals` | flag | false | Pull Phase 3 rental comps |
| `--max-active` | int | `15` | Max active listings to show in Phase 2 |
| `--max-closed` | int | `20` | Max closed listings to show in Phase 2 |
| `--json` | flag | false | Emit JSON instead of formatted text |

### Output

Default text output:
- Phase 1: same-building list (if `--street-number` provided)
- Phase 2: active + closed comps with price, sqft, $/sf, sub-type, DOM, neighborhood
- Stats block: min / p25 / median / avg / p75 / max for closed prices and $/sf
- Phase 3 (if `--include-rentals`): rental comps with median + percentile rents

JSON output (when `--json`): structured object with `subject`, `phase1_same_building`, `phase2_nearby_comps`, `phase3_rental_comps`, and `stats`.

## Compliance

- **Read-only.** No writes to Trestle or RLS.
- **Distribution gates respected.** All queries filter on the same gates as the public IDX feed (`idx_display_yn`, `internet_entire_listing_display_yn`, `owner_opt_out=false`, `participant_only=false`).
- **No public-facing output.** Internal CMA tool only — output is formatted for the agent's terminal, not for client distribution.
- **No agent PII in output.** Address, status, price, sqft, sub-type only.

## Why these tools exist

Earlier this codebase had three iterative one-off scripts (`comp-333-e-46th.ts`, `-v2.ts`, `-v3.ts`) hardcoded to one specific property. Every new CMA need produced a new hardcoded script. This directory holds the parameterized successors so any agent can pull a CMA against any property without writing code.
