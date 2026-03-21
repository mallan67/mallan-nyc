import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseAddressSlug, isMlsIdSlug, extractMlsIdFromSlug } from '@/lib/listing-slug';
import { fetchSingleListing, fetchListingByAddress } from '@/lib/idx/fetch';

/**
 * GET /api/listings/debug-slug?slug=xxx
 *
 * TEMPORARY diagnostic endpoint — traces the listing fetch pipeline
 * to find where it breaks for a given slug.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'slug param required' }, { status: 400 });
  }

  const debug: Record<string, unknown> = {
    slug,
    isMlsIdSlug: isMlsIdSlug(slug),
    extractedMlsId: extractMlsIdFromSlug(slug),
    parsedAddress: parseAddressSlug(slug),
    idxEnabled: process.env.IDX_ENABLED === 'true',
    steps: {},
  };

  // Step 1: DB lookup
  try {
    const parsed = parseAddressSlug(slug);

    if (parsed && parsed.streetNumber && parsed.postalCode) {
      // Strategy 1: exact match
      const dbListing = await prisma.listing.findFirst({
        where: {
          postal_code: parsed.postalCode,
          address: {
            path: ['StreetNumber'],
            equals: parsed.streetNumber,
          },
        },
        select: { listing_id: true, postal_code: true, address: true, status: true },
      });
      (debug.steps as Record<string, unknown>).db_exact = dbListing
        ? { found: true, listing_id: dbListing.listing_id, status: dbListing.status }
        : { found: false };

      // Strategy 2: broader search
      if (!dbListing) {
        const candidates = await prisma.listing.findMany({
          where: { postal_code: parsed.postalCode },
          take: 5,
          select: { listing_id: true, address: true, status: true },
        });
        (debug.steps as Record<string, unknown>).db_broader = {
          candidateCount: candidates.length,
          candidates: candidates.map(c => ({
            listing_id: c.listing_id,
            address: c.address,
            status: c.status,
          })),
        };
      }
    } else {
      (debug.steps as Record<string, unknown>).db_exact = { skipped: 'no parsed address' };
    }

    // Strategy 3: by listing_id
    const byId = await prisma.listing.findUnique({
      where: { listing_id: slug },
      select: { listing_id: true, status: true },
    }).catch(() => null);
    (debug.steps as Record<string, unknown>).db_by_id = byId
      ? { found: true, listing_id: byId.listing_id }
      : { found: false };

    // Total listings count
    const totalListings = await prisma.listing.count();
    (debug.steps as Record<string, unknown>).db_total_listings = totalListings;
  } catch (err) {
    (debug.steps as Record<string, unknown>).db_error = String(err);
  }

  // Step 2: Trestle direct
  if (process.env.IDX_ENABLED === 'true') {
    try {
      const parsed = parseAddressSlug(slug);
      if (parsed && parsed.streetNumber && parsed.postalCode) {
        const raw = await fetchListingByAddress(parsed);
        (debug.steps as Record<string, unknown>).trestle_by_address = raw
          ? { found: true, listingId: raw.ListingId, streetNumber: raw.StreetNumber, unitNumber: raw.UnitNumber }
          : { found: false, searchedWith: parsed };
      }
    } catch (err) {
      (debug.steps as Record<string, unknown>).trestle_error = String(err);
    }
  }

  return NextResponse.json(debug);
}
