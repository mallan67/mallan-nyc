import { NextResponse } from 'next/server';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

// Mark as dynamic since we may want to add query params
export const dynamic = 'force-dynamic';

/**
 * GET /api/listings
 *
 * Query parameters:
 * - type: 'sale' | 'rent' - Filter by listing type
 * - neighborhood: string - Filter by neighborhood ID
 * - borough: string - Filter by borough
 * - minPrice: number - Minimum price
 * - maxPrice: number - Maximum price
 * - beds: number - Minimum number of bedrooms
 * - propertyType: string - Property type (Condo, Co-op, etc.)
 * - pets: boolean - Only show pet-friendly listings
 * - featured: boolean - Only show featured listings
 * - exclusive: boolean - Only show exclusive listings
 * - limit: number - Max results (default 50)
 *
 * Future: This endpoint will be enhanced to pull from IDX/RLS feeds
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Get query params
    const listingType = searchParams.get('type');
    const neighborhood = searchParams.get('neighborhood');
    const borough = searchParams.get('borough');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const minBeds = searchParams.get('beds');
    const propertyTypeFilter = searchParams.get('propertyType');
    const petsOnly = searchParams.get('pets') === 'true';
    const featuredOnly = searchParams.get('featured') === 'true';
    const exclusiveOnly = searchParams.get('exclusive') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Type the listings array using REBNY-compliant schema
    let listings = listingsData.listings as unknown as Listing[];

    // Apply filters
    listings = listings.filter(listing => {
      // Status filter - only active listings
      if (listing.status !== 'active') return false;

      // Type filter
      if (listingType) {
        const typeMap: Record<string, string> = { sale: 'sale', rent: 'rent', buy: 'sale' };
        if (listing.listingType !== typeMap[listingType]) return false;
      }

      // Borough filter
      if (borough && listing.address.borough !== borough) return false;

      // Neighborhood filter
      if (neighborhood && listing.address.neighborhood !== neighborhood) return false;

      // Price filter (using REBNY-compliant nested structure)
      if (minPrice && listing.price.listPrice < parseInt(minPrice, 10)) return false;
      if (maxPrice && listing.price.listPrice > parseInt(maxPrice, 10)) return false;

      // Beds filter (using REBNY-compliant nested structure)
      if (minBeds && listing.propertyInfo.bedroomsTotal < parseInt(minBeds, 10)) return false;

      // Property type filter
      if (propertyTypeFilter && listing.propertyInfo.propertyType !== propertyTypeFilter) return false;

      // Pets filter
      if (petsOnly && !listing.features.pets.allowed) return false;

      // Featured filter
      if (featuredOnly && !listing.flags.isFeatured) return false;

      // Exclusive filter
      if (exclusiveOnly && !listing.flags.isExclusive) return false;

      return true;
    });

    // Sort: featured first, then exclusives, then by date
    listings.sort((a, b) => {
      if (a.flags.isFeatured !== b.flags.isFeatured) return b.flags.isFeatured ? 1 : -1;
      if (a.flags.isExclusive !== b.flags.isExclusive) return b.flags.isExclusive ? 1 : -1;
      return new Date(b.listing.listingDate).getTime() - new Date(a.listing.listingDate).getTime();
    });

    // Apply limit
    listings = listings.slice(0, limit);

    return NextResponse.json({
      success: true,
      count: listings.length,
      listings,
      // Future: Add pagination info
      // pagination: { page: 1, pageSize: limit, total: totalCount }
    });
  } catch (error) {
    console.error('Error fetching listings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}
