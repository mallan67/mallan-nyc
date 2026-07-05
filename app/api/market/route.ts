import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getAccessToken } from '@/lib/idx/auth';
import { checkDistributionGates } from '@/lib/idx/trestle-mapper';

const TRESTLE_URL = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

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

    // ── If DB has few results, supplement with live Trestle data ──
    let trestleActive: Record<string, unknown>[] = [];
    let trestleClosed: Record<string, unknown>[] = [];

    if (activeListings.length < 10) {
      try {
        const token = await getAccessToken();
        const isRental = type === 'rent';
        // Cotality PropertyType is camelCase 'ResidentialLease' (no space) — the space variant
        // matched 0 live rows, silently emptying every rental market stat (AGENTS.md §1 invariant 7).
        const propertyClass = isRental ? "PropertyType eq 'ResidentialLease'" : "PropertyType eq 'Residential'";
        const boroughFilter = borough ? ` and CityRegion eq '${borough.replace(/'/g, "''")}'` : '';
        // $select fields verified against live Trestle $metadata (2026-04-19):
        // IDXEntireListingDisplayYN / OwnerOptOut / ParticipantOnlyYN do NOT
        // exist on live Trestle — Owner Opt-Out / Participant Only are encoded
        // via the `Permission` enum and read by checkDistributionGates().
        const selectFields = 'ListPrice,LivingArea,DaysOnMarket,StandardStatus,ListOfficeName,CityRegion,PostalCode,ModificationTimestamp,OnMarketTimestamp,Permission,InternetEntireListingDisplayYN,InternetAddressDisplayYN';

        // Active listings from Trestle
        const activeParams = new URLSearchParams({
          $filter: `MlsStatus eq 'Active' and ${propertyClass}${boroughFilter}`,
          $select: selectFields,
          $top: '200',
          $count: 'true',
        });

        const activeRes = await fetch(`${TRESTLE_URL}/odata/Property?${activeParams}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 1800 },
        });

        if (activeRes.ok) {
          const data = await activeRes.json();
          trestleActive = data.value || [];
        }

        // Closed listings from Trestle (within period)
        const periodStartISO = periodStart.toISOString().split('T')[0];
        const closedParams = new URLSearchParams({
          $filter: `(MlsStatus eq 'Closed' or StandardStatus eq 'Closed') and ${propertyClass} and CloseDate ge ${periodStartISO}${boroughFilter}`,
          $select: `${selectFields},ClosePrice,CloseDate`,
          $top: '200',
        });

        const closedRes = await fetch(`${TRESTLE_URL}/odata/Property?${closedParams}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          next: { revalidate: 1800 },
        });

        if (closedRes.ok) {
          const data = await closedRes.json();
          trestleClosed = data.value || [];
        }
      } catch (err) {
        console.warn('[/api/market] Trestle fallback failed:', err instanceof Error ? err.message : err);
      }

      // Distribution gate check — filter out non-displayable listings
      trestleActive = trestleActive.filter(r => checkDistributionGates(r).displayable);
      trestleClosed = trestleClosed.filter(r => checkDistributionGates(r).displayable);
    }

    // Merge DB + Trestle active data for stats
    const allActivePrices = [
      ...activeListings.map(l => Number(l.list_price)),
      ...trestleActive.map(r => Number(r.ListPrice || 0)),
    ].filter(p => p > 0);

    const allActiveSqft = [
      ...activeListings.filter(l => l.living_area && Number(l.living_area) > 0).map(l => ({ price: Number(l.list_price), sqft: Number(l.living_area) })),
      ...trestleActive.filter(r => r.LivingArea && Number(r.LivingArea) > 0).map(r => ({ price: Number(r.ListPrice || 0), sqft: Number(r.LivingArea) })),
    ];

    const allActiveDom = [
      ...activeListings.map(l => {
        if (l.days_on_market > 0) return l.days_on_market;
        if (l.first_active_date) return Math.floor((now.getTime() - l.first_active_date.getTime()) / (1000 * 60 * 60 * 24));
        return Math.floor((now.getTime() - l.created_at.getTime()) / (1000 * 60 * 60 * 24));
      }),
      ...trestleActive.map(r => Number(r.DaysOnMarket || 0)),
    ].filter(d => d >= 0 && d < 3650);

    const totalActiveCount = activeListings.length + trestleActive.length;

    const activePrices = allActivePrices;

    const activePricesPerSqft = allActiveSqft
      .filter(d => d.price > 0 && d.sqft > 0)
      .map(d => d.price / d.sqft);

    const activeDom = allActiveDom;

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

    const closedPricesDb = closedListings
      .map(l => {
        const features = l.features as Record<string, unknown> | null;
        const closePrice = features?.closePrice ? Number(features.closePrice) : null;
        return closePrice && closePrice > 0 ? closePrice : Number(l.list_price);
      })
      .filter(p => p > 0);

    const closedPricesTrestle = trestleClosed
      .map(r => Number(r.ClosePrice || r.ListPrice || 0))
      .filter(p => p > 0);

    const closedPrices = [...closedPricesDb, ...closedPricesTrestle];
    const totalClosedCount = closedListings.length + trestleClosed.length;

    // Sale-to-list ratio
    const saleToListRatiosDb = closedListings
      .map(l => {
        const features = l.features as Record<string, unknown> | null;
        const closePrice = features?.closePrice ? Number(features.closePrice) : null;
        const listPrice = Number(l.list_price);
        if (closePrice && closePrice > 0 && listPrice > 0) return closePrice / listPrice;
        return null;
      })
      .filter((r): r is number => r !== null);

    const saleToListRatiosTrestle = trestleClosed
      .map(r => {
        const close = Number(r.ClosePrice || 0);
        const list = Number(r.ListPrice || 0);
        if (close > 0 && list > 0) return close / list;
        return null;
      })
      .filter((r): r is number => r !== null);

    const saleToListRatios = [...saleToListRatiosDb, ...saleToListRatiosTrestle];

    // ── Neighborhood breakdown (merge DB + Trestle) ──
    const neighborhoodMap = new Map<string, { count: number; totalPrice: number }>();

    // DB neighborhoods
    const neighborhoodStats = await prisma.listing.groupBy({
      by: ['neighborhood'],
      where: activeWhere,
      _count: { id: true },
      _avg: { list_price: true },
      orderBy: { _count: { id: 'desc' } },
      take: 15,
    });

    for (const n of neighborhoodStats) {
      if (!n.neighborhood) continue;
      neighborhoodMap.set(n.neighborhood, {
        count: n._count.id,
        totalPrice: n._avg.list_price ? Number(n._avg.list_price) * n._count.id : 0,
      });
    }

    // Trestle neighborhoods
    for (const r of trestleActive) {
      const nh = String(r.CityRegion || '').trim();
      if (!nh) continue;
      const existing = neighborhoodMap.get(nh) || { count: 0, totalPrice: 0 };
      existing.count++;
      existing.totalPrice += Number(r.ListPrice || 0);
      neighborhoodMap.set(nh, existing);
    }

    const neighborhoodBreakdown = [...neighborhoodMap.entries()]
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgPrice: data.count > 0 ? Math.round(data.totalPrice / data.count) : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

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
        totalCount: totalActiveCount,
        medianPrice: median(activePrices),
        avgPricePerSqft: activePricesPerSqft.length > 0
          ? Math.round(activePricesPerSqft.reduce((a, b) => a + b, 0) / activePricesPerSqft.length)
          : null,
        medianDaysOnMarket: median(activeDom),
        newListings: newListingsCount + trestleActive.filter(r => {
          const mod = r.ModificationTimestamp || r.OnMarketTimestamp;
          return mod && new Date(String(mod)) >= periodStart;
        }).length,
        underContract: underContractCount + trestleActive.filter(r => String(r.StandardStatus) === 'ActiveUnderContract').length,
      },
      closed: {
        totalCount: totalClosedCount,
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
