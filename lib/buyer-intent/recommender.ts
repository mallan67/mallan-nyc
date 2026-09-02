/**
 * Buyer Intent Recommender — personalized listing recommendations
 */

import prisma from '@/lib/prisma';
import { RECOMMENDATION_LIMIT } from './config';
import type { RecommendationItem } from './types';
import { canDisplayListingAddress, publicListingVisibilityWhere } from '@/lib/search/listing-access-decision';

/**
 * Get personalized listing recommendations for a lead based on their intent profile.
 */
export async function getRecommendations(
  leadId: bigint,
  limit = RECOMMENDATION_LIMIT
): Promise<RecommendationItem[]> {
  const profile = await prisma.buyerIntentProfile.findUnique({
    where: { lead_id: leadId },
  });

  if (!profile) return [];

  // Build query filters from profile
  const where: Record<string, unknown> = {
    status: 'Active',
    // Gates AND return-copy suppression. Spreading SEARCH_DISPLAY_GATE alone
    // recommended the same home twice — once as Mallan's canonical SL-/RL- row
    // and once as the copy that came back through Cotality.
    ...publicListingVisibilityWhere(),
  };

  // Price range
  if (profile.price_min || profile.price_max) {
    const priceFilter: Record<string, unknown> = {};
    if (profile.price_min) priceFilter.gte = profile.price_min;
    if (profile.price_max) priceFilter.lte = profile.price_max;
    where.list_price = priceFilter;
  }

  // Neighborhoods
  if (profile.preferred_neighborhoods.length > 0) {
    where.neighborhood = { in: profile.preferred_neighborhoods };
  }

  // Property types
  if (profile.preferred_types.length > 0) {
    where.property_type = { in: profile.preferred_types };
  }

  // Bedrooms
  if (profile.preferred_beds.length > 0) {
    where.bedrooms_total = { in: profile.preferred_beds };
  }

  // Boroughs (fallback if no neighborhood preference)
  if (profile.preferred_neighborhoods.length === 0 && profile.preferred_boroughs.length > 0) {
    where.borough = { in: profile.preferred_boroughs };
  }

  const listings = await prisma.listing.findMany({
    where,
    select: {
      listing_id: true,
      address: true,
      neighborhood: true,
      property_type: true,
      list_price: true,
      bedrooms_total: true,
      internet_address_display_yn: true,
      internet_entire_listing_display_yn: true,
    },
    take: limit * 2, // Fetch extra for scoring
    orderBy: { modification_timestamp: 'desc' },
  });

  // Score each listing by profile match
  const scored: RecommendationItem[] = listings.map(l => {
    const reasons: string[] = [];
    let score = 50; // Base score

    // Neighborhood match
    if (l.neighborhood && profile.preferred_neighborhoods.includes(l.neighborhood)) {
      score += 20;
      reasons.push(`Preferred neighborhood: ${l.neighborhood}`);
    }

    // Property type match
    if (l.property_type && profile.preferred_types.includes(l.property_type)) {
      score += 15;
      reasons.push(`Preferred type: ${l.property_type}`);
    }

    // Bedroom match
    if (l.bedrooms_total !== null && profile.preferred_beds.includes(l.bedrooms_total)) {
      score += 10;
      reasons.push(`${l.bedrooms_total} bed match`);
    }

    // Price sweet spot (center of range)
    if (profile.price_min && profile.price_max && l.list_price) {
      const mid = (Number(profile.price_min) + Number(profile.price_max)) / 2;
      const dist = Math.abs(Number(l.list_price) - mid) / mid;
      if (dist < 0.1) { score += 10; reasons.push('Price sweet spot'); }
      else if (dist < 0.2) { score += 5; reasons.push('Within price range'); }
    }

    const addr = l.address as Record<string, string> | null;
    const displayAddr = canDisplayListingAddress(l) && addr
      ? `${addr.StreetNumber || ''} ${addr.StreetName || ''}`.trim() || null
      : null;

    return {
      listing_id: l.listing_id,
      address: displayAddr,
      score: Math.min(100, score),
      match_reasons: reasons,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
