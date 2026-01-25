import { NextResponse } from 'next/server';
import listingsData from '@/data/listings.json';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/listings/:id
 *
 * Returns a single listing by ID
 *
 * Future: This endpoint will be enhanced to pull from IDX/RLS feeds
 */
export async function GET(request: Request, { params }: Props) {
  try {
    const { id } = await params;

    const listing = listingsData.listings.find(l => l.id === id);

    if (!listing) {
      return NextResponse.json(
        { success: false, error: 'Listing not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      listing,
    });
  } catch (error) {
    console.error('Error fetching listing:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}
