import { Prisma } from '@prisma/client';

/**
 * Legacy public-DTO fields that have not yet completed a one-column-at-a-time
 * typed-owner migration. Public list readers need only this fragment; selecting
 * the complete `listings.raw_data` JSON sends every retained provider field over
 * the Neon connection on each cache miss.
 *
 * This is a read-boundary contraction, not a new authority. The values still
 * come from the canonical persisted Cotality/CRM row, and the existing DTO owns
 * their coercion and display semantics.
 */
export const PUBLIC_LISTING_RAW_COMPAT_KEYS = [
  'ActivationDate',
  'OriginalListPrice',
  'PreviousListPrice',
  'ClosePrice',
  'PublicRemarks',
  'OnMarketDate',
  'CloseDate',
  'LeaseAmount',
  'LeaseAmountFrequency',
  'AvailabilityDate',
  'DaysOnMarket',
  'CumulativeDaysOnMarket',
] as const;

export type PublicListingRawCompat = Partial<
  Record<(typeof PUBLIC_LISTING_RAW_COMPAT_KEYS)[number], unknown>
>;

interface RawQueryClient {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
}

interface RawCompatRow {
  listing_id: string;
  raw_data: PublicListingRawCompat | null;
}

/**
 * Fetch all compatibility fragments in ONE bounded query for an already-paged
 * listing set. `jsonb_strip_nulls` keeps the transferred object sparse.
 */
export async function loadPublicListingRawCompat(
  client: RawQueryClient,
  listingIds: readonly string[],
): Promise<Map<string, PublicListingRawCompat>> {
  if (listingIds.length === 0) return new Map();

  const rows = await client.$queryRaw(Prisma.sql`
    SELECT
      listing_id,
      jsonb_strip_nulls(jsonb_build_object(
        'ActivationDate', raw_data -> 'ActivationDate',
        'OriginalListPrice', raw_data -> 'OriginalListPrice',
        'PreviousListPrice', raw_data -> 'PreviousListPrice',
        'ClosePrice', raw_data -> 'ClosePrice',
        'PublicRemarks', raw_data -> 'PublicRemarks',
        'OnMarketDate', raw_data -> 'OnMarketDate',
        'CloseDate', raw_data -> 'CloseDate',
        'LeaseAmount', raw_data -> 'LeaseAmount',
        'LeaseAmountFrequency', raw_data -> 'LeaseAmountFrequency',
        'AvailabilityDate', raw_data -> 'AvailabilityDate',
        'DaysOnMarket', raw_data -> 'DaysOnMarket',
        'CumulativeDaysOnMarket', raw_data -> 'CumulativeDaysOnMarket'
      )) AS raw_data
    FROM listings
    WHERE listing_id IN (${Prisma.join(listingIds)})
  `) as RawCompatRow[];

  return new Map(
    rows.map((row) => [row.listing_id, row.raw_data ?? {}]),
  );
}

/** Attach the contracted fragment under the field expected by the canonical DTO. */
export async function attachPublicListingRawCompat<T extends { listing_id: string }>(
  client: RawQueryClient,
  listings: readonly T[],
): Promise<Array<T & { raw_data: PublicListingRawCompat }>> {
  const byId = await loadPublicListingRawCompat(
    client,
    listings.map((listing) => listing.listing_id),
  );

  return listings.map((listing) => ({
    ...listing,
    raw_data: byId.get(listing.listing_id) ?? {},
  }));
}
