import prisma from '@/lib/prisma';

export interface PastDealDTO {
  id: string | null;
  listingKey: string | null;
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

export async function getPastDeals(slug: string): Promise<{ sales: PastDealDTO[]; rentals: PastDealDTO[] }> {
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

    if (!agent) return { sales: [], rentals: [] };

    const deals = await prisma.pastDeal.findMany({
      where: { agent_id: agent.id },
      orderBy: [{ close_date: 'desc' }, { created_at: 'desc' }],
    });

    const mapped: PastDealDTO[] = deals.map((d) => ({
      id: d.id.toString(),
      listingKey: d.trestle_listing_key || null,
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

    const sales = mapped.filter((d) => d.dealType === 'sale');
    const rentals = mapped.filter((d) => d.dealType === 'rent');

    return { sales, rentals };
  } catch (error) {
    console.error('[past-deals-loader]', error instanceof Error ? error.message : error);
    return { sales: [], rentals: [] };
  }
}
