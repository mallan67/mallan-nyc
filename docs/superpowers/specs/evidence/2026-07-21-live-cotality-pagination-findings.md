# Live Cotality pagination probe — findings (2026-07-21)

**Probe:** `scripts/__live-cotality-pagination-probe.mts` (untracked, read-only, 3 GETs).
**Raw evidence:** `2026-07-21-live-cotality-pagination-probe.json` (this dir, sanitized).
**Question:** does large result-set server-driven pagination via `@odata.nextLink`
behave safely? (The 06:22Z samples had ≤22 media/listing → no nextLink, so
pagination was previously UNPROVEN.)

## Method
Queried Property-scoped Media broadly by a stable composite order — no per-listing
filter, so the result set exceeds the server page limit and paginates:
`GET /odata/Media?$filter=ResourceName eq 'Property'&$orderby=ModificationTimestamp asc,MediaKey asc&$select=…`.
Followed the `@odata.nextLink` chain for 3 bounded pages. (`$top` was NOT used to
force paging — in OData `$top` caps total, not page size; server-driven paging is
what the real sync relies on.)

## PROVEN (runtime, live 200s) — SCOPED to what 3 sampled pages actually show
- **`@odata.nextLink` is returned** on every one of the 3 pages; server page
  size = **10 rows**.
- **Every followed page returns HTTP 200** — the nextLink chain is followable.
- **0 duplicate `MediaKey` observed across the 3 sampled pages** (30 unique).
- **Runtime categories beyond Photo:** the sampled rows contained both `Photo`
  (`MediaType="Jpeg"`) and **`FloorPlan` (`MediaType="Pdf"`)** — FloorPlan is now
  runtime-confirmed, and `MediaType` is the FILE FORMAT, not the semantic type.
  Classification MUST key on `MediaCategory`, not `MediaType`.

## NOT PROVEN (do not claim) — explicit
- **Completeness / global no-skip is NOT proven.** Only 3 pages were walked; the
  probe did NOT reach the final page and did NOT reconcile the union against an
  independently-verified total. "No duplicates" holds only for the sampled pages,
  not the whole result set. Claim only: nextLink is returned and followable, and
  no duplicates were seen in the sample.

## CONTRADICTED on the MEDIA endpoint — runtime overrides expectation → FAIL CLOSED
- **Scope: the Media endpoint only.** A large block of Media shares ONE
  `ModificationTimestamp` (`2025-01-03T00:15:25.533-00:00`, a bulk import).
- Within that tie block the server does **NOT** return rows in `MediaKey` order:
  `page2.first MediaKey 2003594882318 < page1.last MediaKey 2003595927858`, and
  within-page `(ts,MediaKey)` monotonicity is violated.
- Therefore, ON MEDIA, a **keyset resume of the form
  `ModificationTimestamp eq <ts> AND MediaKey gt <lastKey>` WOULD SKIP ROWS** —
  the server does not honor the secondary `MediaKey asc` sort for tied timestamps.
- **The PROPERTY endpoint is UNVERIFIED.** This Media result is NOT applied to
  Property. Whether Property ties reorder requires a separate direct live
  Property API probe. The Property cursor's tie-block back-off is a defensive
  fail-closed default, NOT a claim that Property behaves like Media.

## Fail-closed handling (adopted)
1. **Completeness = follow `@odata.nextLink` to exhaustion.** Proven skip/dup-safe.
   Never treat page 1 (or any single page) as the complete set. If any nextLink
   fetch is non-200 or the chain is not fully drained → `fetchComplete=false` →
   the reconciler fails closed (no tombstones), cursor frozen.
2. **The (ts,key) keyset is a coarse BETWEEN-run start bound only.** It must never
   be used to resume in the MIDDLE of a tied-timestamp block. A tie block is
   drained fully via nextLink within one run.
3. **Cursor advancement:** advance only PAST a fully-drained `ModificationTimestamp`.
   Never advance to a `(ts,key)` inside a tie block that was not fully drained —
   else the next run's `key gt` skips the block's remaining rows. Because the
   fetch drains nextLink to completion within a run, a completed run lands on a
   fully-drained boundary; an incomplete run freezes the cursor (fail closed).

## Unresolved / not over-claimed
- Only 3 pages (30 rows) walked — the full dataset is not enumerated (bounded on
  purpose). The invariants proven hold across the walked boundaries; the general
  skip/dup-safety of nextLink is a documented OData server-paging guarantee
  corroborated here, not an exhaustive whole-feed proof.
- The full `MediaCategory` enum beyond `Photo`/`FloorPlan` remains metadata-declared
  only (Video/VirtualTour/etc. not yet runtime-observed) → classifier maps them if
  encountered; not asserted as populated.
