'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──
interface MarketData {
  success: boolean;
  filters: {
    type: string;
    period: string;
    periodLabel: string;
    borough: string;
    neighborhood: string | null;
  };
  active: {
    totalCount: number;
    medianPrice: number | null;
    avgPricePerSqft: number | null;
    medianDaysOnMarket: number | null;
    newListings: number;
    underContract: number;
  };
  closed: {
    totalCount: number;
    medianSoldPrice: number | null;
    saleToListRatio: number | null;
  };
  neighborhoodBreakdown: {
    name: string;
    count: number;
    avgPrice: number | null;
    percentage: number;
  }[];
  _compliance: {
    disclaimer: string;
    attribution: string;
    generatedAt: string;
  };
}

const BOROUGHS = [
  { value: '', label: 'All NYC' },
  { value: 'Manhattan', label: 'Manhattan' },
  { value: 'Brooklyn', label: 'Brooklyn' },
  { value: 'Queens', label: 'Queens' },
  { value: 'Bronx', label: 'Bronx' },
  { value: 'Staten Island', label: 'Staten Island' },
];

const PERIODS = [
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
];

function formatPrice(value: number | null): string {
  if (value === null) return '--';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function formatNumber(value: number | null): string {
  if (value === null) return '--';
  return Math.round(value).toLocaleString();
}

function formatRatio(value: number | null): string {
  if (value === null) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

// ── Stat Card ──
function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-5 sm:p-6 text-center">
      <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

// ── Loading skeleton ──
function SkeletonCard() {
  return (
    <div className="bg-gray-50 rounded-xl p-5 sm:p-6 text-center animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-24 mx-auto mb-3" />
      <div className="h-8 bg-gray-200 rounded w-20 mx-auto" />
    </div>
  );
}

export default function MarketReportContent() {
  const [type, setType] = useState<'sale' | 'rent'>('sale');
  const [borough, setBorough] = useState('');
  const [period, setPeriod] = useState('90d');
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type, period });
      if (borough) params.set('borough', borough);
      const res = await fetch(`/api/market?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load market data');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load market data');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [type, borough, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const priceLabel = type === 'rent' ? 'Median Rent' : 'Median Price';
  const closedLabel = type === 'rent' ? 'Median Leased Price' : 'Median Sold Price';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* ── Header ── */}
      <div className="mb-8 sm:mb-10">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-black tracking-tight font-display">
          NYC Market Report
        </h1>
        <p className="mt-2 text-base sm:text-lg text-brand-dark/70">
          Real estate market data and trends across New York City
        </p>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-8 sm:mb-10">
        {/* Sale / Rent toggle */}
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setType('sale')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              type === 'sale'
                ? 'bg-white text-brand-dark shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sales
          </button>
          <button
            onClick={() => setType('rent')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              type === 'rent'
                ? 'bg-white text-brand-dark shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Rentals
          </button>
        </div>

        {/* Borough selector */}
        <select
          value={borough}
          onChange={(e) => setBorough(e.target.value)}
          className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
          aria-label="Select borough"
        >
          {BOROUGHS.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>

        {/* Period selector */}
        <div className="inline-flex rounded-lg bg-gray-100 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                period === p.value
                  ? 'bg-white text-brand-dark shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center mb-8">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 text-sm text-red-500 underline hover:text-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Key Stats Cards ── */}
      <section className="mb-10 sm:mb-12" aria-label="Key market statistics">
        <h2 className="text-lg sm:text-xl font-semibold text-brand-dark mb-4">
          Active Market
          {data && !loading && (
            <span className="text-sm font-normal text-gray-400 ml-2">
              {data.filters.borough}
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {loading ? (
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          ) : data ? (
            <>
              <StatCard
                label={priceLabel}
                value={formatPrice(data.active.medianPrice)}
              />
              <StatCard
                label="Avg $/SqFt"
                value={data.active.avgPricePerSqft ? `$${formatNumber(data.active.avgPricePerSqft)}` : '--'}
              />
              <StatCard
                label="Days on Market"
                value={formatNumber(data.active.medianDaysOnMarket)}
                subtitle="Median"
              />
              <StatCard
                label="Active Listings"
                value={formatNumber(data.active.totalCount)}
              />
            </>
          ) : null}
        </div>
      </section>

      {/* ── Inventory Snapshot ── */}
      <section className="mb-10 sm:mb-12" aria-label="Inventory snapshot">
        <h2 className="text-lg sm:text-xl font-semibold text-brand-dark mb-4">
          Inventory Snapshot
          {data && !loading && (
            <span className="text-sm font-normal text-gray-400 ml-2">
              Past {data.filters.periodLabel}
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {loading ? (
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          ) : data ? (
            <>
              <StatCard
                label="New Listings"
                value={formatNumber(data.active.newListings)}
              />
              <StatCard
                label="Under Contract"
                value={formatNumber(data.active.underContract)}
              />
              <StatCard
                label="Closed"
                value={formatNumber(data.closed.totalCount)}
              />
              <StatCard
                label={closedLabel}
                value={formatPrice(data.closed.medianSoldPrice)}
              />
              <StatCard
                label="Sale-to-List"
                value={formatRatio(data.closed.saleToListRatio)}
              />
            </>
          ) : null}
        </div>
      </section>

      {/* ── Neighborhood Breakdown (CSS bar chart) ── */}
      {data && !loading && data.neighborhoodBreakdown.length > 0 && (
        <section className="mb-10 sm:mb-12" aria-label="Listings by neighborhood">
          <h2 className="text-lg sm:text-xl font-semibold text-brand-dark mb-4">
            Listings by Neighborhood
          </h2>
          <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
            <div className="space-y-3">
              {data.neighborhoodBreakdown.map((n) => (
                <div key={n.name} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-brand-dark truncate max-w-[200px] sm:max-w-none">
                      {n.name}
                    </span>
                    <div className="flex items-center gap-3 text-sm text-gray-500 shrink-0 ml-3">
                      {n.avgPrice !== null && (
                        <span className="hidden sm:inline text-xs text-gray-400">
                          Avg {formatPrice(n.avgPrice)}
                        </span>
                      )}
                      <span className="font-medium text-brand-dark min-w-[32px] text-right">
                        {n.count}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(n.percentage, 3)}%`,
                        backgroundColor: '#C4A052',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA: Personalized Market Analysis ── */}
      {data && !loading && (data.active.totalCount > 0 || data.closed.totalCount > 0) && (
        <section className="mb-10 sm:mb-12">
          <div className="bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] rounded-3xl p-8 md:p-10">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-3">
                What does this mean for your property?
              </h2>
              <p className="text-white/70 text-sm md:text-base leading-relaxed mb-6">
                {type === 'sale'
                  ? 'Whether you\'re buying or selling, these numbers only tell part of the story. Get a personalized analysis of your target neighborhood — pricing strategy, timing, and comparable sales tailored to your goals.'
                  : 'Rental markets move fast. Get expert guidance on pricing, timing, and neighborhood selection to maximize your investment or find the right apartment.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="tel:+16462584460"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-gold text-white font-semibold rounded-full hover:bg-brand-gold-deep transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call (646) 258-4460
                </a>
                <a
                  href="/about#contact"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-white/30 text-white font-medium rounded-full hover:bg-white/10 transition-colors text-sm"
                >
                  Request a Free Market Analysis
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Empty state ── */}
      {data && !loading && data.active.totalCount === 0 && data.closed.totalCount === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center mb-8">
          <p className="text-gray-500 text-lg">No market data available for the selected filters.</p>
          <p className="text-gray-400 text-sm mt-1">Try selecting a different borough or time period.</p>
        </div>
      )}

      {/* ── REBNY Disclaimer (REQUIRED) ── */}
      <footer className="border-t border-gray-200 pt-6 mt-10 sm:mt-12">
        {data && data._compliance ? (
          <>
            <p className="text-xs text-gray-400 leading-relaxed">
              {data._compliance.disclaimer}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {data._compliance.attribution}
            </p>
          </>
        ) : (
          <p className="text-xs text-gray-400 leading-relaxed">
            Based on information from the REBNY Listing Service for the period currently available. The data relating to real estate on this web site comes in part from the REBNY RLS. Data deemed reliable but not guaranteed.
          </p>
        )}
        <p className="text-xs text-gray-300 mt-2">
          Mallan Real Estate Inc. | Licensed Real Estate Broker | #10991205323
        </p>
      </footer>
    </div>
  );
}
