/**
 * What mallan.nyc offers search engines as listing pages: the ONE definition of the listing population in /sitemap.xml.
 *
 * Owner decision (Maya Allan, 2026-10-30, "get ... the listings ... included"): Mallan's own listings are offered to search engines,
 * alongside the third-party RLS listings that already were. Master 4.1 / 21.10 require each surface to be a separate recorded decision.
 *   - Third-party RLS rows: the four distribution gates + an active status + Mallan RLS return-copy suppression (Charter 1A). A Mallan
 *     website-only row never takes this branch, so its address flag can only be judged by the branch below.
 *   - Mallan website-only rows (SL-/RL-, rls_eligible=false): outside RLS, so no IDX flags, but fail-closed on an explicit opt-out
 *     (owner_opt_out, participant_only), on entire-listing or address display switched off, on a lapsed exclusive agreement
 *     (expiration_date in the past), and on any status but active or a missing price.
 *
 * Neighbourhood guides (59) are offered too, since their copy was cleaned of school, family and protected-class wording (2026-10-30).
 * NOT offered, on purpose (compliance review of 2026-10-30; see State): building pages, until their data layer's gates are verified.
 */
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { ACTIVE_DISPLAY_VALUES } from '@/lib/compliance/status';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { buildListingSlugFromDbRow } from '@/lib/listing-slug';
import { dedupeRawDbRows } from '@/lib/listings/dedupe-crm-vs-idx';
import { excludeMallanRlsReturnCopies, mallanWebsiteOnlyWhere } from '@/lib/listings/mallan-source-identity';
import { ALL_BOROUGH_SLUGS, loadNeighborhoods } from '@/lib/neighborhoods/boroughs';

/**
 * Paths of the neighbourhood guides (/{borough}/{neighbourhood}), the same canonical each guide page declares in its metadata.
 * Offered since the copy was cleaned of school, family and protected-class wording (owner instruction 2026-10-30); the word-level guard
 * in tests/runtime/guardrails-prohibited-terms-single-source.test.ts fails if that wording returns.
 */
export function neighbourhoodGuidePaths(): string[] {
  return ALL_BOROUGH_SLUGS.flatMap((borough) => loadNeighborhoods(borough).map((n) => `/${borough}/${n.slug}`));
}

export function sitemapListingWhere(now: Date = new Date()): Prisma.ListingWhereInput {
  return {
    // Only active listings (a closed listing is removed within 24 hours). Canonical values from lib/compliance/status.ts.
    status: { in: [...ACTIVE_DISPLAY_VALUES] },
    OR: [
      {
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: false,
        participant_only: false,
        AND: [
          // Mallan's own listing returns through Cotality as an RLS* row. The local SL-/RL- row is the canonical public listing, so the
          // returned copy must not be offered as a second URL for the same listing (duplicate content; Charter 1A, Master 4.4).
          excludeMallanRlsReturnCopies(),
          // That exclusion re-admits every SL-/RL- row by prefix. A website-only row must be judged by its own branch below, never by
          // the IDX flags alone: this branch has no address condition, and the slug builder shows a website-only row's address.
          { NOT: mallanWebsiteOnlyWhere() },
        ],
      },
      {
        ...mallanWebsiteOnlyWhere(),
        internet_entire_listing_display_yn: true,
        internet_address_display_yn: true,
        owner_opt_out: false,
        participant_only: false,
        list_price: { gt: 0 },
        // The prefix proves Mallan wrote the listing, not that it still holds the exclusive: a lapsed agreement is not offered.
        AND: [{ OR: [{ expiration_date: null }, { expiration_date: { gt: now } }] }],
      },
    ],
  };
}

const SITEMAP_LISTING_SELECT = {
  listing_id: true,
  address: true,
  borough: true,
  rls_eligible: true,
  // Read by isAddressDisplayable() inside buildListingSlugFromDbRow for the URL.
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  modification_timestamp: true,
} as const;

export type SitemapListingRow = Prisma.ListingGetPayload<{ select: typeof SITEMAP_LISTING_SELECT }>;

/** Every listing row offered in the sitemap, after the public-surface dedupe of a Mallan CRM exclusive against its IDX twin. */
export async function loadSitemapListingRows(): Promise<SitemapListingRow[]> {
  const rows = await prisma.listing.findMany({ where: sitemapListingWhere(), select: SITEMAP_LISTING_SELECT });
  return dedupeRawDbRows(rows);
}

/** The listing's canonical path, from the same builder the listing page's DTO uses, so the sitemap lists what the page declares. */
export function sitemapListingPath(row: SitemapListingRow): string {
  return buildCanonicalListingPath({ slug: buildListingSlugFromDbRow(row), id: row.listing_id });
}
