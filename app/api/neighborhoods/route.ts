import { NextResponse } from 'next/server';
import neighborhoodsData from '@/data/neighborhoods.json';

/**
 * GET /api/neighborhoods
 *
 * Returns all neighborhoods with summary info
 */
export async function GET() {
  try {
    const neighborhoods = neighborhoodsData.neighborhoods.map(n => ({
      id: n.id,
      name: n.name,
      tagline: n.tagline,
      thumbnail: n.thumbnail,
      listingCount: n.listingCount,
      avgPrice: n.avgPrice,
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
      { status: 500 }
    );
  }
}
