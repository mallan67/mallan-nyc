# Listing Media Tombstone Payload Retention — Approved 2026-08-02

## Decision

A `listing_media` row remains the durable media audit record and is not hard-deleted. Once a row has continuously remained `status='deleted'` for more than 30 days, obsolete delivery payload may be removed:

- `media_url_original`
- `media_url_cached`
- `r2_key`
- `width`
- `height`

The following evidence remains intact:

- row ID and `media_key`;
- listing relationship and source record keys;
- media type, category, classification, order, and preferred-photo flag;
- source modification timestamps and photo-change snapshot;
- retry counters and last-attempt timestamp;
- `status`, `created_at`, and `updated_at`.

## Why this is safe

A deleted row is not displayable. The retained identity and source timestamps preserve the audit trail. If Cotality later reactivates the same `MediaKey`, normal media synchronization can repopulate the active delivery fields.

Clearing `r2_key` and `media_url_cached` also allows the separate reviewed R2 orphan inventory to recognize the old object as unreferenced. This policy does not itself delete any R2 object.

## Execution controls

- exact predicate: `status='deleted'` and `updated_at < now()-30 days`;
- only rows still carrying at least one removable delivery field;
- oldest-first bounded batches;
- `FOR UPDATE SKIP LOCKED` for overlap safety;
- hard per-invocation ceiling;
- no hard deletion;
- no active or replaced row may be touched;
- failure reports progress and stops.
