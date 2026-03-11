import { NextResponse } from 'next/server';
import { getAllNeighborhoods } from '@/lib/neighborhoods/boroughs';

/**
 * GET /api/neighborhoods
 *
 * Returns all neighborhoods with summary info.
 * Source of truth: borough-split JSON files via lib/neighborhoods/boroughs.ts
 */
export async function GET() {
  try {
    const allNeighborhoods = getAllNeighborhoods();

    const neighborhoods = allNeighborhoods.map((n) => ({
      id: n.slug,
      name: n.name,
      tagline: n.tagline,
      thumbnail: n.ogImage,
      listingCount: n.marketStats?.inventory ?? 0,
      avgPrice: {
        sale: n.marketStats?.medianSalePrice ?? 0,
        rent: n.marketStats?.medianRent ?? 0,
      },
    }));

    return NextResponse.json({
      success: true,
      count: neighborhoods.length,
      neighborhoods,
    });
  } catch (error) {
    console.error('Error fetching neighborhoods:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch neighborhoods' },
      { status: 500 },
    );
  }
}
