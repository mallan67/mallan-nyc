# Media Coverage Remediation Packet — READ-ONLY audit + dry-run framework

> **Re-derived and hardened 2026-07-19** on post-#539 main (`0b920c97`), replacing
> the 2026-07-16 original (reference: old PR #525 @ `d7303a2f`, which stays
> untouched and unmerged). **Nothing in this packet writes anything, anywhere.**
> The production audit run itself is NOT authorized by this PR — per the
> program roadmap it executes only AFTER #530/#535/#533/#534 land and compute is
> re-measured. Any actual backfill or R2 deletion gets its own reviewed write PR
> and explicit authorization from Maya.

## What this is

A bounded, resumable, fail-closed evidence framework that classifies every
listing's media coverage into buckets and dry-run-plans Bucket-B backfills —
so future write campaigns can never delete or backfill the wrong media.
**It does not itself reduce compute or storage.**

## Buckets

| Bucket | Meaning |
|---|---|
| A | active relational usable photos exist |
| B_NEW | third-party, no relational rows ever, Cotality CONFIRMED photos → planned inserts |
| B_INACTIVE | third-party, inactive/deleted rows exist, Cotality CONFIRMED photos → restores/updates |
| C | legacy JSON has usable photos → the render fix already serves it |
| D | no media in DB and Cotality CONFIRMED zero |
| E | Mallan-owned authoritative state — never backfilled from Cotality |
| F | hidden / withdrawn / non-displayable |
| U | UNKNOWN — probe not run / errored / incomplete: never coerced to B or D |

## Canonical rules (locked)

- **Ownership** — the classifier and the audit delegate to the real
  `isMallanExclusiveListing` (`lib/listings/exclusive-agent-assignment.ts`),
  matching the PR #539 media read path exactly. `agent_id`, `owner_client_id`,
  assignment history, or a current agent association can never establish
  media ownership (the input shapes carry no such fields).
- **Display eligibility** — the production `isListingDisplayable` gate;
  hidden/opted-out/participant-only/terminal listings classify F, never B.
- **Media classification** — the production resolver counts usable photos;
  the Cotality probe uses a STRICT classifier: a row with an ABSENT
  category/type is `unknown`, never a photo (deliberately stricter than the
  lenient ingest default). Floorplans, videos, virtual tours and unknown
  records are never counted as photos.
- **Cotality keying** — Property record first → its ACTUAL `ListingKey` →
  `Media?$filter=ResourceRecordKey eq '<ListingKey>'`, provider `Order`
  preserved verbatim (never the array index), every valid `@odata.nextLink`
  followed; an incomplete traversal is UNKNOWN, never a confirmed zero.

## Bounds (all explicit, all reported)

Neon: keyset cursor (`listing_id` asc), `--page-size`, `--max-listings`,
run time budget, per-page checkpoint (`--checkpoint FILE`), `--resume`
(completed pages are never repeated). Cotality: `--max-probes`,
`--max-requests` (property lookups + media pages), bounded `--concurrency`,
per-request `--timeout-ms`, bounded `--retries`, per-listing page cap, and
full request/success/failure/retry/skip accounting. **Reaching any limit
reports INCOMPLETE (exit 2) — never a silent "full audit."** OAuth failure,
timeout, provider error, pagination failure, skipped probe, budget
exhaustion, or an interrupted run stays UNKNOWN. Credentials, tokens,
authorization headers and env values are never printed.

## Dry-run action taxonomy

`insert` (no matching row) · `restore` (inactive row matched by stable
`media_key` first, then normalized provider URL) · `update` (ACTIVE matched
row whose authorized mutable fields differ — provider order / normalized
source URL / media key — with the exact `changedFields` recorded) ·
`unchanged` (identical active match). Duplicate provider items and rows
already claimed by a proposal are suppressed — an inactive or changed row
representing the same provider media item never yields a duplicate insert.
R2 keys come from the canonical `buildMediaR2Key` with the provider Order.

## RLS20103891

RLS20103891 remains **UNKNOWN (bucket U)** unless and until THIS listing
receives its own successful, complete, recorded Cotality probe. Its status is
never inferred from the separate eight-listing production sample of
2026-07-19 (that sample reconciled OTHER listings).

## Read-only guarantee

Logic modules receive injected read-only reader interfaces
(`ListingPageReader`, `CotalityMediaReader`) that expose no
create/update/upsert/delete/raw/R2 method at the type level; runtime tests
additionally source-scan every framework file for mutation tokens and pin
that exactly three manual npm scripts — and no cron, route, workflow, or
admin surface — can invoke the tooling. There is no `--apply` anywhere.

## Where this sits in the roadmap

1. #539 merged + production-proven (done — the ownership rules this
   classification depends on).
2. **This packet** — the safety/evidence layer (read-only, not yet executed
   against production).
3. #530 / #535 / #533 / #534 — the actual compute + future-storage savings.
4. Re-measure compute, writes, scans, WAL, R2 growth.
5. Run the bounded production audit (`media:audit:cotality` with explicit
   budgets) → definitive inventory.
6. Separate, individually approved backfill and R2 deletion/lifecycle
   campaigns.
