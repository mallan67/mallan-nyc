# Copilot instructions — `mallan67/mallan-nyc`

This is a **live REBNY IDX Plus brokerage platform**. Suggestions here carry
real compliance exposure.

**Read `docs/architecture/MALLAN-PLATFORM-PLAN.md` first** — it is the single
normative platform plan. Then `AGENTS.md` for invariants and holds. This file
routes; it states no architecture of its own (`DOC-2`).

## Do not suggest

- **Removing a fallback** — `Listing.media`, `raw_data.Media`, `ListingMedia`,
  or any live provider fallback. A migration is in flight and every one of them
  is load-bearing (`HYG-1`, `HYG-6`).
- **Deleting code because no caller was found.** Absence of a discovered caller
  is not proof of disuse.
- **Changing display-gate null handling.** Gates 3 and 4
  (`InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`) are **not**
  uniform with gates 5 and 6. Applying affirmation logic uniformly suppressed
  **7,594 rows** on 2026-04-30. See `POL-1.1`–`POL-1.5` and
  `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`.
- **Compensation in listing content** — no broker fee, closing cost or
  compensation may reach a description, remark, search result, portal, report,
  feed or campaign (`BIZ-9`). Provider metadata still carries such fields, so
  this is an active guard.
- **Contract drafting, review, clause libraries, rider builders, escrow ledgers
  or wire instructions.** New York prohibits brokers from drafting or reviewing
  contracts of sale (`TXN-1`, `TXN-11`).
- **Describing a REBNY, UCBA or MLS rule as "required by New York law"**
  (`BIZ-0`).
- **Schema migrations, env vars, Neon settings, cron config, or
  `.github/workflows/**` changes** — all require explicit Maya approval.

## Provider rules

All Cotality calls are server-side through the adapter under `lib/idx/`
(`ARC-1`, `C-2`). Never invent a provider field, enum, status, permission or
query behavior (`COT-5`, `COT-11`). Preserve **both** provider identifiers and
never treat one as the other — that conflation caused `OPS-024` (`COT-6`).

## Evidence

`implemented` ≠ `merged` ≠ `deployed` ≠ `production_proven`. A passing unit test
does not establish provider-contract correctness: 5,814 tests passed during
`OPS-024` because every fixture fabricated the key field.
