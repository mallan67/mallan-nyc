/**
 * GET /api/results
 *
 * Returns aggregate track record stats + recent closed deals
 * for the brokerage-wide results/track record page.
 * Public endpoint — no auth required.
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const revalidate = 3600; // cache 1hr

export async function GET() {
  try {
    // Fetch all past deals with agent info
    const deals = await prisma.pastDeal.findMany({
      select: {
        id: true,
        street: true,
        unit: true,
        city: true,
        neighborhood: true,
        postal_code: true,
        deal_type: true,
        property_type: true,
        close_price: true,
        close_date: true,
        beds: true,
        baths_full: true,
        sqft: true,
        photo_url: true,
        source: true,
        agent: {
          select: {
            full_name: true,
            public_slug: true,
          },
        },
      },
      orderBy: { close_date: 'desc' },
    });

    const sales = deals.filter((d) => d.deal_type === 'sale');
    const rentals = deals.filter((d) => d.deal_type === 'rent');

    const salePrices = sales
      .map((d) => (d.close_price ? Number(d.close_price) : 0))
      .filter((p) => p > 0);

    const totalVolume = salePrices.reduce((sum, p) => sum + p, 0);
    const avgPrice = salePrices.length > 0 ? totalVolume / salePrices.length : 0;

    // Neighborhood breakdown
    const neighborhoodMap = new Map<string, number>();
    for (const d of deals) {
      if (d.neighborhood) {
        neighborhoodMap.set(d.neighborhood, (neighborhoodMap.get(d.neighborhood) || 0) + 1);
      }
    }
    const topNeighborhoods = [...neighborhoodMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Property type breakdown
    const typeMap = new Map<string, number>();
    for (const d of deals) {
      const t = d.property_type || 'Residential';
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    }
    const propertyTypes = [...typeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Serialize deals for display (most recent 50)
    const recentDeals = deals.slice(0, 50).map((d) => ({
      id: d.id.toString(),
      street: d.street,
      unit: d.unit,
      city: d.city,
      neighborhood: d.neighborhood,
      dealType: d.deal_type,
      propertyType: d.property_type,
      closePrice: d.close_price ? Number(d.close_price) : null,
      closeDate: d.close_date ? d.close_date.toISOString().split('T')[0] : null,
      beds: d.beds,
      bathsFull: d.baths_full,
      sqft: d.sqft,
      photoUrl: d.photo_url,
      agentName: d.agent?.full_name || null,
      agentSlug: d.agent?.public_slug || null,
    }));

    return NextResponse.json({
      stats: {
        totalTransactions: deals.length,
        totalSales: sales.length,
        totalRentals: rentals.length,
        totalVolume: Math.round(totalVolume),
        avgSalePrice: Math.round(avgPrice),
      },
      topNeighborhoods,
      propertyTypes,
      recentDeals,
    });
  } catch (e) {
    console.error('Results API error:', e);
    return NextResponse.json({ error: 'Failed to load results' }, { status: 500 });
  }
}
