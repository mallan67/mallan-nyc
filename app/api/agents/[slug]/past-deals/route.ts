import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export interface PastDealDTO {
  id: string | null;
  street: string;
  unit: string | null;
  city: string;
  postalCode: string;
  neighborhood: string;
  closePrice: number | null;
  listPrice: number | null;
  closeDate: string | null;
  beds: number | null;
  bathsFull: number | null;
  bathsHalf: number | null;
  sqft: number | null;
  propertyType: string;
  dealType: 'sale' | 'rent';
  photoUrl: string | null;
  listingCourtesy: string | null;
  source: 'trestle' | 'manual';
}

/**
 * GET /api/agents/[slug]/past-deals
 * Returns past closed deals for an agent from the database.
 * Public endpoint (no auth required) — data is already sanitized.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // Find agent by slug
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [
          { public_slug: slug },
          { full_name: { equals: slug.replace(/-/g, ' '), mode: 'insensitive' } },
        ],
        status: 'active',
      },
      select: { id: true },
    });

    if (!agent) {
      return NextResponse.json(
        { sales: [], rentals: [], totalSales: 0, totalRentals: 0 },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
      );
    }

    const deals = await prisma.pastDeal.findMany({
      where: { agent_id: agent.id },
      orderBy: [{ close_date: 'desc' }, { created_at: 'desc' }],
    });

    const allDeals: PastDealDTO[] = deals.map((d) => ({
      id: d.id.toString(),
      street: d.street,
      unit: d.unit,
      city: d.city || 'New York',
      postalCode: d.postal_code || '',
      neighborhood: d.neighborhood || '',
      closePrice: d.close_price ? Number(d.close_price) : null,
      listPrice: null,
      closeDate: d.close_date ? d.close_date.toISOString().split('T')[0] : null,
      beds: d.beds,
      bathsFull: d.baths_full,
      bathsHalf: d.baths_half,
      sqft: d.sqft,
      propertyType: d.property_type || 'Residential',
      dealType: d.deal_type as 'sale' | 'rent',
      photoUrl: d.photo_url,
      listingCourtesy: d.listing_courtesy,
      source: (d.source === 'trestle' ? 'trestle' : 'manual') as 'trestle' | 'manual',
    }));

    const sales = allDeals.filter((d) => d.dealType === 'sale');
    const rentals = allDeals.filter((d) => d.dealType === 'rent');

    return NextResponse.json(
      { sales, rentals, totalSales: sales.length, totalRentals: rentals.length },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    );
  } catch (error) {
    console.error('[past-deals]', error instanceof Error ? error.message : error);
    return NextResponse.json({ sales: [], rentals: [], totalSales: 0, totalRentals: 0 });
  }
}
