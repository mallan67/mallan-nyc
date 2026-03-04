import { NextResponse } from 'next/server';
import listingsData from '@/data/listings.json';
import { sanitizeForPublicDisplay } from '@/lib/compliance/idx-display-gate';
import { fetchSingleListing } from '@/lib/idx/fetch';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';
import { mapRESOToInternal, generateAttributionText } from '@/lib/idx/mapping';
import { toPublicDTO } from '@/lib/idx/public-dto';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/listings/:id
 *
 * COMPLIANCE PIPELINE (Option A — distribution gates on raw Trestle data):
 *   fetchSingleListing(listingKey) → raw record
 *   checkDistributionGates(raw) → reject if non-displayable
 *   mapRESOToInternal(raw) → IDXListing
 *   toPublicDTO(listing) → PublicListingDTO (strips private data, suppresses address)
 *
 * When IDX_ENABLED=true: fetches from Trestle by ListingKey.
 * When IDX_ENABLED=false (or Trestle fails): falls back to data/listings.json.
 *
 * Returns 404 if:
 * - Listing not found in either source
 * - Listing fails distribution gates (must NOT be shown publicly)
 */
export async function GET(request: Request, { params }: Props) {
  try {
    const { id } = await params;
    const useIDX = process.env.IDX_ENABLED === 'true';

    // ═══════════════════════════════════════════════════════════
    // IDX PATH: Fetch single listing from Trestle by ListingKey
    // ═══════════════════════════════════════════════════════════
    if (useIDX) {
      try {
        const raw = await fetchSingleListing(id);

        if (raw) {
          // Step 1: Distribution gates on RAW Trestle data
          const gateResult = checkDistributionGates(raw);
          if (!gateResult.displayable) {
            // Listing exists but fails compliance gates — return 404
            // Do NOT reveal the reason to the public (compliance: fail closed)
            return NextResponse.json(
              {
                success: false,
                error: 'Listing not found',
                _compliance: {
                  source: 'idx',
                  idxEnabled: true,
                },
              },
              { status: 404 }
            );
          }

          // Step 2: Map to IDXListing
          const listing = mapRESOToInternal(raw);
          if (!listing) {
            return NextResponse.json(
              { success: false, error: 'Listing not found' },
              { status: 404 }
            );
          }

          // Step 3: Convert to public DTO (strips private data, suppresses address)
          const publicListing = toPublicDTO(listing);

          return NextResponse.json(
            {
              success: true,
              listing: publicListing,
              _compliance: {
                source: 'idx',
                idxEnabled: true,
                attribution: generateAttributionText(),
                disclaimer:
                  'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
              },
            },
            {
              headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
              },
            }
          );
        }
        // raw is null — listing not found in Trestle, fall through to local
      } catch (idxError) {
        // IDX fetch failed — fall through to local data for resilience
        console.error(`[/api/listings/${id}] IDX fetch failed, falling back to local data:`, idxError);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // LOCAL PATH: Serve from data/listings.json (fallback)
    // ═══════════════════════════════════════════════════════════
    const listing = listingsData.listings.find((l) => l.id === id);

    if (!listing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Listing not found',
          _compliance: {
            source: 'exclusive',
            idxEnabled: useIDX,
          },
        },
        { status: 404 }
      );
    }

    // REBNY COMPLIANCE: Sanitize listing for public display — strip private data
    const sanitizedListing = sanitizeForPublicDisplay(
      listing as unknown as import('@/lib/types/listing').Listing
    );

    return NextResponse.json(
      {
        success: true,
        listing: sanitizedListing,
        _compliance: {
          source: 'exclusive',
          idxEnabled: useIDX,
          disclaimer: 'Information deemed reliable but not guaranteed.',
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching listing:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}
