/**
 * ONE MEDIA IDENTITY CONTRACT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE AND NOT TWO LINES IN THE ROUTE
 *
 * `/api/media/batch` asked the provider in one identity domain and then indexed
 * the answer in another:
 *
 *     filter:   ResourceRecordID eq 'RLS20112217'     <- the caller's domain
 *     grouping: m.ResourceRecordKey || m.ResourceRecordID
 *     lookup:   rawByKey.get('RLS20112217')
 *
 * Cotality populates BOTH fields on every Media row, so the `||` always chose
 * ResourceRecordKey and the map was keyed '1189393822'. The lookup asked for
 * 'RLS20112217'. It returned [] — deterministically, for every provider-only
 * listing, which is every live search result not persisted in the Mallan
 * database.
 *
 * The symptom was the worst kind: the card's primary photo appeared (it asks by
 * key) and the gallery was empty the instant the broker opened the listing.
 *
 * Two lines apart in the same function is exactly how far a filter field and a
 * grouping field need to be to drift. Putting the domain in ONE place, and
 * deriving both from it, is what makes the drift unrepresentable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROVIDER FACTS — probed live 2026-09-01 against api.cotality.com
 *
 * Three listings, PhotosCount 30 / 23 / 8, all four combinations:
 *
 *   Media.ResourceRecordKey eq <ListingKey>  ->  30 / 23 / 8   (== PhotosCount)
 *   Media.ResourceRecordID  eq <ListingId>   ->  30 / 23 / 8   (== PhotosCount)
 *   Media.ResourceRecordID  eq <ListingKey>  ->   0 /  0 /  0
 *   Media.ResourceRecordKey eq <ListingId>   ->   0 /  0 /  0
 *
 * Each relationship field answers its OWN domain exactly. A cross-domain query
 * returns an empty HTTP 200 — indistinguishable, on screen, from a listing that
 * genuinely has no photos. That is why the domains may never be mixed.
 *
 * This module states operator/population facts only. It makes no claim about
 * what the provider MEANS by either field beyond the reconciliation above.
 */

/**
 * Which provider identity the CALLER holds — and therefore the only domain in
 * which its answer may be filtered, grouped, and looked up.
 */
export enum MediaIdentityDomain {
  /** Cotality `Property.ListingKey` — matched by `Media.ResourceRecordKey`. */
  PROVIDER_KEY = 'provider_key',
  /** Cotality `Property.ListingId` — matched by `Media.ResourceRecordID`. */
  PROVIDER_ID = 'provider_id',
}

/** The single place a domain becomes a provider field name. */
export function identityFieldFor(domain: MediaIdentityDomain): string {
  return domain === MediaIdentityDomain.PROVIDER_KEY
    ? 'ResourceRecordKey'
    : 'ResourceRecordID';
}

/** OData string literals are single-quoted; a quote is escaped by doubling. */
function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * The `$filter` for a batch of identifiers, in ONE domain.
 *
 * Built from `identityFieldFor` so the field this filters on is, by
 * construction, the field `groupMediaByRequestedDomain` will index on.
 */
export function mediaFilterForDomain(
  identifiers: readonly string[],
  domain: MediaIdentityDomain,
): string {
  const field = identityFieldFor(domain);
  return identifiers
    .map((id) => `${field} eq '${escapeOData(id)}'`)
    .join(' or ');
}

/** The provider Media fields this contract reads. */
interface ProviderMediaRow {
  ResourceRecordKey?: unknown;
  ResourceRecordID?: unknown;
  MediaURL?: unknown;
  InternetEntireListingDisplayYN?: unknown;
  [key: string]: unknown;
}

/**
 * Group provider Media rows by the identity the caller asked in.
 *
 * A row that cannot answer in that domain is DROPPED, never re-filed under the
 * other identity. Falling back would put the row under a key the caller will
 * never look up — invisible, and indistinguishable from the listing simply
 * having fewer photos.
 */
export function groupMediaByRequestedDomain<T extends ProviderMediaRow>(
  rows: readonly T[],
  domain: MediaIdentityDomain,
): Map<string, T[]> {
  const field = identityFieldFor(domain);
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    // E-0: refuse provider-suppressed media before it can reach a gallery or
    // become a hero. EXPLICIT `false` only — absence is not a refusal, and
    // reading it as one is how the 2026-04-30 display-gate incident blanked
    // 7,594 rows the provider had never restricted.
    if (row.InternetEntireListingDisplayYN === false) continue;

    const raw = row[field];
    // Not `||`: that treats a legitimate falsy value as missing. The identity
    // must be a real, non-blank string in the REQUESTED domain or the row does
    // not belong to this answer.
    const identity = raw == null ? '' : String(raw).trim();
    if (!identity) continue;

    // An entry with nothing to display is not media.
    if (row.MediaURL == null || String(row.MediaURL).trim() === '') continue;

    const bucket = grouped.get(identity);
    if (bucket) bucket.push(row);
    else grouped.set(identity, [row]);
  }

  return grouped;
}
