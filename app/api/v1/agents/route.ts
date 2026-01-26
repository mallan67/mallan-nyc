import { NextRequest, NextResponse } from 'next/server';
import agentsData from '@/data/agents.json';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

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

interface ListingCount {
  activeSales: number;
  activeRentals: number;
  closedSales: number;
  closedRentals: number;
  total: number;
}

interface AgentWithListings extends Agent {
  listings: ListingCount;
  profileUrl: string;
}

function getAgentListingCounts(agentName: string): ListingCount {
  const listings = listingsData.listings as unknown as Listing[];

  const agentListings = listings.filter(
    (l) =>
      l.agent.listAgentName === agentName ||
      l.agent.coListAgentName === agentName
  );

  return {
    activeSales: agentListings.filter((l) => l.status === 'active' && l.listingType === 'sale').length,
    activeRentals: agentListings.filter((l) => l.status === 'active' && l.listingType === 'rent').length,
    closedSales: agentListings.filter((l) => l.status === 'sold').length,
    closedRentals: agentListings.filter((l) => l.status === 'rented').length,
    total: agentListings.length,
  };
}

function formatAgentResponse(agent: Agent, baseUrl: string): AgentWithListings {
  const slug = agent.name.toLowerCase().replace(/\s+/g, '-');

  return {
    ...agent,
    photo: agent.photo.startsWith('http') ? agent.photo : `${baseUrl}${agent.photo}`,
    listings: getAgentListingCounts(agent.name),
    profileUrl: `${baseUrl}/agents/${slug}`,
  };
}

/**
 * GET /api/v1/agents
 *
 * Public API endpoint for retrieving agent information.
 * Compliant with RESO standards for agent data exchange.
 *
 * Query Parameters:
 * - id: Filter by agent ID
 * - name: Filter by agent name (partial match)
 * - featured: Filter by featured status (true/false)
 * - specialty: Filter by specialty area
 * - language: Filter by language
 * - include_listings: Include listing counts (true/false, default: true)
 *
 * Response Headers:
 * - X-Total-Count: Total number of agents matching criteria
 * - X-API-Version: API version (v1)
 *
 * Example responses:
 * GET /api/v1/agents - Returns all agents
 * GET /api/v1/agents?featured=true - Returns only featured agents
 * GET /api/v1/agents?name=maya - Returns agents with "maya" in their name
 * GET /api/v1/agents?specialty=Brooklyn - Returns agents specializing in Brooklyn
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://mallan.nyc';

    // Get query parameters
    const idFilter = searchParams.get('id');
    const nameFilter = searchParams.get('name');
    const featuredFilter = searchParams.get('featured');
    const specialtyFilter = searchParams.get('specialty');
    const languageFilter = searchParams.get('language');
    const includeListings = searchParams.get('include_listings') !== 'false';

    let agents: Agent[] = agentsData.agents;

    // Apply filters
    if (idFilter) {
      agents = agents.filter((a) => a.id === idFilter);
    }

    if (nameFilter) {
      const searchTerm = nameFilter.toLowerCase();
      agents = agents.filter((a) => a.name.toLowerCase().includes(searchTerm));
    }

    if (featuredFilter !== null) {
      const isFeatured = featuredFilter === 'true';
      agents = agents.filter((a) => a.featured === isFeatured);
    }

    if (specialtyFilter) {
      const searchTerm = specialtyFilter.toLowerCase();
      agents = agents.filter((a) =>
        a.specialties.some((s) => s.toLowerCase().includes(searchTerm))
      );
    }

    if (languageFilter) {
      const searchTerm = languageFilter.toLowerCase();
      agents = agents.filter((a) =>
        a.languages.some((l) => l.toLowerCase().includes(searchTerm))
      );
    }

    // Format response
    const formattedAgents = includeListings
      ? agents.map((a) => formatAgentResponse(a, baseUrl))
      : agents.map((a) => ({
          ...a,
          photo: a.photo.startsWith('http') ? a.photo : `${baseUrl}${a.photo}`,
          profileUrl: `${baseUrl}/agents/${a.name.toLowerCase().replace(/\s+/g, '-')}`,
        }));

    const response = NextResponse.json({
      success: true,
      data: formattedAgents,
      meta: {
        total: formattedAgents.length,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });

    // Add CORS and API headers
    response.headers.set('X-Total-Count', String(formattedAgents.length));
    response.headers.set('X-API-Version', 'v1');
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return response;
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch agents',
        message: String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/v1/agents
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
