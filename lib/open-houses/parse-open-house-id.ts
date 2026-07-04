/**
 * Parse the public OpenHouseDTO id posted by the RSVP client (Codex #472 r3).
 *
 * /api/open-houses emits ids as `local-{showingId}` (Mallan CRM open houses —
 * a Showing row) or `trestle-{OpenHouseKey||ListingKey}` (feed entries).
 * The RSVP route uses this to link the Inquiry to a listing:
 *   - local  → exact: Showing.listing_id → listings.listing_id (text).
 *   - trestle → unresolvable-by-design here (the key is not a listing id and
 *     resolving would require a live feed query on a public POST path);
 *     documented limitation — inquiry keeps listing_id NULL as before.
 * Pure; never throws.
 */
export type ParsedOpenHouseId =
  | { kind: 'local'; showingId: bigint }
  | { kind: 'trestle' };

export function parseOpenHouseId(id: unknown): ParsedOpenHouseId | null {
  if (typeof id !== 'string' || id.length === 0) return null;
  if (id.startsWith('trestle-')) return { kind: 'trestle' };
  if (id.startsWith('local-')) {
    const raw = id.slice('local-'.length);
    if (!/^\d+$/.test(raw)) return null;
    try {
      return { kind: 'local', showingId: BigInt(raw) };
    } catch {
      return null;
    }
  }
  return null;
}
