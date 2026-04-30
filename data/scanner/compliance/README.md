# Off-market scanner compliance data

This directory holds the source-of-truth files for the off-market seller-intent scanner's compliance gate. **Every prospect surfaced by any scanner output passes through `lib/scanner/compliance/suppression.ts:isSuppressed()` before display.** That function reads the two files here.

## Files

### `nyc-dos-cease-desist-zones.json`

GeoJSON FeatureCollection of currently-active NY Department of State Cease and Desist Real Estate Solicitation Zones. Established under **19 NYCRR § 175.17(b)**.

In any active zone, real estate brokers MAY NOT solicit owners (door-to-door, phone, mail, email, any form) without express written invitation from the owner. Solicitation in a C&D zone can result in license suspension, fines, and civil exposure.

**Refresh policy:** annually, or whenever NY DOS publishes a renewal notice. Source: https://dos.ny.gov/real-estate-cease-and-desist-zones

**Current state of file:** placeholder structure with empty `features[]`. Run `npm run scanner:refresh-cd-zones -- --check` to verify what's loaded. Manhattan rarely (perhaps never historically) has had an active zone; recent renewals concentrate on parts of Brooklyn, Queens, and the Bronx. The corridor (Manhattan south of 97E/110W) is unlikely to overlap with any active zone, but the gate is built unconditionally so any future Manhattan zone is honored automatically.

### `mallan-suppression-list.json`

Per-Mallan-broker suppression list. Required by 19 NYCRR § 175.17(b): once a property owner has indicated "do not solicit" to Mallan (verbal, written, or via opt-out link), they MUST be excluded from outreach for at least one year from the date of indication.

**Schema:** see the `schema` block inside the file.

**Match modes:** BBL, owner_name (case-insensitive, whitespace-tolerant), phone (digits-only, leading "1" stripped), email (case-insensitive), address (case-insensitive, whitespace-tolerant).

**Lifecycle:** add an entry on every "no" response. Set `expires_at` ≥ 1 year from `added_at`. Expired entries stay in the file (audit trail) but are automatically excluded from match.

## How a prospect is gated

`isSuppressed({ bbl, owner_name, phone, email, address, lat, lng })` runs both checks and returns:

```ts
{
  suppressed: true | false,
  reasons: string[],                       // human-readable
  matched_entries: { source, detail }[]    // for audit logging
}
```

If `suppressed` is `true`, the scanner UI must not surface the prospect. If `false`, surface with all metadata.

## What's NOT in v0

- **NYS DNC + FTC DNC checks.** Phone outreach is deferred per the v1 outreach plan (letter + email only). When phone outreach is enabled, wire DNC sync into this directory and add to the gate.
- **Database persistence.** v0 reads JSON files at module init. When multi-broker scaling is needed, swap reads to a Prisma-backed `OwnerSuppression` table; the gate API stays identical.
- **Auto-refresh of NY DOS zones.** NY DOS doesn't publish a clean machine-readable feed. The refresh script is a human-in-the-loop helper. Run on the day of any NY DOS renewal notice.

## Audit trail

Every `isSuppressed()` call should be logged when used in a write path (e.g., when the scanner enqueues a prospect for outreach). The hooks for that logging belong in the consumer (the seller-prospect endpoint), not in this module.
