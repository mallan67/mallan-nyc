import { NextResponse } from 'next/server';
import listingsData from '@/data/listings.json';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/listings
 * Returns all listings from the listings.json file
 */
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      listings: listingsData.listings,
      total: listingsData.listings.length,
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}
