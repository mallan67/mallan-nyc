import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

/**
 * GET /api/market
 *
 * Returns aggregate market statistics from the listings database.
 * All data is derived from IDX-displayable listings only (distribution gates enforced).
 *
 * Query parameters:
 *   - borough: string (optional) — filter by borough
 *   - neighborhood: string (optional) — filter by neighborhood
 *   - type: 'sale' | 'rent' — listing type (default: 'sale')
 *   - period: '30d' | '90d' | '1y' — lookback period (default: '90d')
 *
 * COMPLIANCE:
 *   - Distribution gates enforced (idx_display_yn, owner_opt_out, etc.)
 *   - REBNY statistical data disclaimer included in response
 *   - No individual listing data exposed — aggregates only
 *   - Fair Housing compliant — no ranking or quality language
 */

// Rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// In-memory cache (market data changes slowly)
interface CacheEntry { data: unknown; expiresAt: number }
const marketCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): unknown | null {
  const entry = marketCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { marketCache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  if (marketCache.size >= 20) {
    const firstKey = marketCache.keys().next().value;
    if (firstKey !== undefined) marketCache.delete(firstKey);
  }
  marketCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '1y': return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case '90d':
    default: return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const borough = searchParams.get('borough');
    const neighborhood = searchParams.get('neighborhood');
    const type = searchParams.get('type') || 'sale';
    const period = searchParams.get('period') || '90d';

    const cacheKey = `market:${type}:${period}:${borough || 'all'}:${neighborhood || 'all'}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });
    }

    const periodStart = getPeriodStart(period);
    const now = new Date();

    // Base where clause — distribution gates enforced
    const baseWhere: Prisma.ListingWhereInput = {
      listing_type: type === 'rent' ? 'rent' : 'sale',
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
    };

    if (borough) {
      baseWhere.borough = { contains: borough, mode: 'insensitive' };
    }
    if (neighborhood) {
      baseWhere.neighborhood = { equals: neighborhood, mode: 'insensitive' };
    }

    // ── Active listings stats ──
    const activeWhere: Prisma.ListingWhereInput = {
      ...baseWhere,
      status: { in: ['Active', 'ComingSoon', 'ActiveUnderContract'] },
    };

    const activeListings = await prisma.listing.findMany({
      where: activeWhere,
      select: {
        list_price: true,
        living_area: true,
        days_on_market: true,
        first_active_date: true,
        status: true,
        created_at: true,
        modification_timestamp: true,
      },
    });

    const activePrices = activeListings
      .map(l => Number(l.list_price))
      .filter(p => p > 0);

    const activePricesPerSqft = activeListings
      .filter(l => l.living_area && Number(l.living_area) > 0)
      .map(l => Number(l.list_price) / Number(l.living_area));

    const activeDom = activeListings
      .map(l => {
        if (l.days_on_market > 0) return l.days_on_market;
        if (l.first_active_date) {
          return Math.floor((now.getTime() - l.first_active_date.getTime()) / (1000 * 60 * 60 * 24));
        }
        return Math.floor((now.getTime() - l.created_at.getTime()) / (1000 * 60 * 60 * 24));
      })
      .filter(d => d >= 0);

    // Count new listings in the period
    const newListingsCount = await prisma.listing.count({
      where: {
        ...activeWhere,
        created_at: { gte: periodStart },
      },
    });

    // Under contract count
    const underContractCount = activeListings.filter(l => l.status === 'ActiveUnderContract').length;

    // ── Closed listings stats ──
    const closedWhere: Prisma.ListingWhereInput = {
      ...baseWhere,
      status: 'Closed',
      modification_timestamp: { gte: periodStart },
    };

    const closedListings = await prisma.listing.findMany({
      where: closedWhere,
      select: {
        list_price: true,
        living_area: true,
        features: true,
        days_on_market: true,
      },
    });

    const closedPrices = closedListings
      .map(l => {
        // Try to get close_price from features JSON, fall back to list_price
        const features = l.features as Record<string, unknown> | null;
        const closePrice = features?.closePrice ? Number(features.closePrice) : null;
        return closePrice && closePrice > 0 ? closePrice : Number(l.list_price);
      })
      .filter(p => p > 0);

    // Sale-to-list ratio
    const saleToListRatios = closedListings
      .map(l => {
        const features = l.features as Record<string, unknown> | null;
        const closePrice = features?.closePrice ? Number(features.closePrice) : null;
        const listPrice = Number(l.list_price);
        if (closePrice && closePrice > 0 && listPrice > 0) {
          return closePrice / listPrice;
        }
        return null;
      })
      .filter((r): r is number => r !== null);

    // ── Neighborhood breakdown (top neighborhoods by listing count) ──
    const neighborhoodStats = await prisma.listing.groupBy({
      by: ['neighborhood'],
      where: activeWhere,
      _count: { id: true },
      _avg: { list_price: true },
      orderBy: { _count: { id: 'desc' } },
      take: 15,
    });

    const neighborhoodBreakdown = neighborhoodStats
      .filter(n => n.neighborhood)
      .map(n => ({
        name: n.neighborhood!,
        count: n._count.id,
        avgPrice: n._avg.list_price ? Math.round(Number(n._avg.list_price)) : null,
      }));

    // Find max count for bar chart percentages
    const maxNeighborhoodCount = neighborhoodBreakdown.length > 0
      ? Math.max(...neighborhoodBreakdown.map(n => n.count))
      : 1;

    const neighborhoodChart = neighborhoodBreakdown.map(n => ({
      ...n,
      percentage: Math.round((n.count / maxNeighborhoodCount) * 100),
    }));

    // ── Build response ──
    const periodLabel = period === '30d' ? '30 Days' : period === '1y' ? '1 Year' : '90 Days';
    const startDateStr = periodStart.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const endDateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const response = {
      success: true,
      filters: {
        type,
        period,
        periodLabel,
        borough: borough || 'All Boroughs',
        neighborhood: neighborhood || null,
      },
      active: {
        totalCount: activeListings.length,
        medianPrice: median(activePrices),
        avgPricePerSqft: activePricesPerSqft.length > 0
          ? Math.round(activePricesPerSqft.reduce((a, b) => a + b, 0) / activePricesPerSqft.length)
          : null,
        medianDaysOnMarket: median(activeDom),
        newListings: newListingsCount,
        underContract: underContractCount,
      },
      closed: {
        totalCount: closedListings.length,
        medianSoldPrice: median(closedPrices),
        saleToListRatio: saleToListRatios.length > 0
          ? Math.round((saleToListRatios.reduce((a, b) => a + b, 0) / saleToListRatios.length) * 1000) / 1000
          : null,
      },
      neighborhoodBreakdown: neighborhoodChart,
      _compliance: {
        source: 'db',
        disclaimer: `Based on information from the REBNY Listing Service for the period ${startDateStr} through ${endDateStr}. The data relating to real estate for ${type === 'rent' ? 'rent' : 'sale'} on this web site comes in part from the REBNY RLS. Data deemed reliable but not guaranteed.`,
        attribution: 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.',
        generatedAt: now.toISOString(),
      },
    };

    setCache(cacheKey, response);

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[/api/market] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'Failed to load market data.' },
      { status: 500 }
    );
  }
}
