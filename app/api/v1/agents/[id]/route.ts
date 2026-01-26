import { NextRequest, NextResponse } from 'next/server';
import agentsData from '@/data/agents.json';
import listingsData from '@/data/listings.json';

export const dynamic = 'force-dynamic';

interface Agent {
  id: string;
  name: string;
  title: string;
  photo: string;
  phone: string;
  email: string;
  bio: string;
  specialties: string[];
  languages: string[];
  featured: boolean;
}

interface Listing {
  id: string;
  listingType: string;
  status: string;
  address: {
    streetNumber: string;
    streetName: string;
    unit: string;
    neighborhoodDisplay: string;
    borough: string;
  };
  price: {
    listPrice: number;
    closePrice?: number | null;
  };
  propertyInfo: {
    propertyType: string;
    bedroomsTotal: number;
    bathroomsFull: number;
    aboveGradeFinishedArea: number;
  };
  agent: {
    listAgentName: string;
    coListAgentName?: string | null;
  };
  media: {
    images: Array<{ url: string; isPrimary: boolean }>;
  };
  buyer?: {
    closeDate?: string | null;
  };
}

function getAgentListings(agentName: string) {
  const listings = listingsData.listings as unknown as Listing[];

  const agentListings = listings.filter(
    (l) =>
      l.agent.listAgentName === agentName ||
      l.agent.coListAgentName === agentName
  );

  return {
    activeSales: agentListings
      .filter((l) => l.status === 'active' && l.listingType === 'sale')
      .map((l) => formatListingSummary(l)),
    activeRentals: agentListings
      .filter((l) => l.status === 'active' && l.listingType === 'rent')
      .map((l) => formatListingSummary(l)),
    closedSales: agentListings
      .filter((l) => l.status === 'sold')
      .map((l) => formatListingSummary(l)),
    closedRentals: agentListings
      .filter((l) => l.status === 'rented')
      .map((l) => formatListingSummary(l)),
  };
}

function formatListingSummary(listing: Listing) {
  return {
    id: listing.id,
    address: `${listing.address.streetNumber} ${listing.address.streetName}`,
    unit: listing.address.unit,
    neighborhood: listing.address.neighborhoodDisplay,
    borough: listing.address.borough,
    price: listing.price.listPrice,
    closePrice: listing.price.closePrice,
    propertyType: listing.propertyInfo.propertyType,
    bedrooms: listing.propertyInfo.bedroomsTotal,
    bathrooms: listing.propertyInfo.bathroomsFull,
    sqft: listing.propertyInfo.aboveGradeFinishedArea,
    listingType: listing.listingType,
    status: listing.status,
    primaryImage: listing.media.images.find((img) => img.isPrimary)?.url || listing.media.images[0]?.url,
    closeDate: listing.buyer?.closeDate,
  };
}

/**
 * GET /api/v1/agents/[id]
 *
 * Retrieve a single agent by ID or slug (name-based).
 *
 * Examples:
 * - GET /api/v1/agents/maya-allan (by slug)
 * - GET /api/v1/agents/1 (by ID)
 *
 * Query Parameters:
 * - include_listings: Include full listing details (true/false, default: true)
 *
 * Response includes:
 * - Agent profile information
 * - Contact details
 * - Specialties and languages
 * - Active and closed listings (if include_listings=true)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mallan.nyc';
    const includeListings = searchParams.get('include_listings') !== 'false';

    const agents: Agent[] = agentsData.agents;

    // Find agent by ID or slug
    let agent = agents.find((a) => a.id === id);

    if (!agent) {
      // Try finding by slug (name-based)
      const searchName = id.replace(/-/g, ' ').toLowerCase();
      agent = agents.find((a) => a.name.toLowerCase() === searchName);
    }

    if (!agent) {
      return NextResponse.json(
        {
          success: false,
          error: 'Agent not found',
          message: `No agent found with ID or slug: ${id}`,
        },
        { status: 404 }
      );
    }

    const slug = agent.name.toLowerCase().replace(/\s+/g, '-');

    // Build response
    const responseData: Record<string, unknown> = {
      ...agent,
      photo: agent.photo.startsWith('http') ? agent.photo : `${baseUrl}${agent.photo}`,
      profileUrl: `${baseUrl}/agents/${slug}`,
    };

    if (includeListings) {
      responseData.listings = getAgentListings(agent.name);
    }

    const response = NextResponse.json({
      success: true,
      data: responseData,
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });

    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('X-API-Version', 'v1');

    return response;
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch agent',
        message: String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/v1/agents/[id]
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}
