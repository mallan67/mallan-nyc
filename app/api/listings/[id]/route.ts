import { NextResponse } from 'next/server';
import listingsData from '@/data/listings.json';
import { logAccessDenied } from '@/lib/idx';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * Check if listing ID appears to be an IDX/MLS ID
 * IDX IDs typically follow specific patterns (e.g., MLS numbers)
 */
function isIDXListingId(id: string): boolean {
  // Local listings use our own ID format (e.g., 'sale-001', 'rent-001')
  // IDX listings would use MLS numbers (typically numeric or alphanumeric patterns)
  // For now, assume any ID not matching our format might be IDX
  return !id.match(/^(sale|rent)-\d{3}$/);
}

/**
 * GET /api/listings/:id
 *
 * COMPLIANCE NOTE:
 * This endpoint currently serves ONLY local/exclusive listings from data/listings.json.
 * It does NOT serve IDX/MLS data. When IDX integration is enabled, IDX listings
 * will be fetched server-side via lib/idx/client.ts.
 *
 * Returns a single listing by ID
 *
 * Future: This endpoint will be enhanced to pull from IDX/RLS feeds
 */
export async function GET(request: Request, { params }: Props) {
  try {
    const { id } = await params;

    // Gate potential IDX listing requests
    if (isIDXListingId(id)) {
      const idxEnabled = process.env.IDX_ENABLED === 'true';
      if (!idxEnabled) {
        logAccessDenied('IDX disabled - IDX listing ID rejected', '/api/listings/[id]', id);
        // Continue to check local listings - might be a valid local ID
      }
      // Future: Fetch from IDX when enabled for IDX IDs
    }

    const listing = listingsData.listings.find(l => l.id === id);

    if (!listing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Listing not found',
          _compliance: {
            note: 'Listing may be an IDX listing not yet available.',
            idxEnabled: process.env.IDX_ENABLED === 'true',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        listing,
        _compliance: {
          source: 'exclusive', // Currently serving exclusive/manual listings only
          idxEnabled: process.env.IDX_ENABLED === 'true',
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
