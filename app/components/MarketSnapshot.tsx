'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SnapshotData {
  neighborhood: string;
  borough: string;
  medianPrice: number | null;
  avgPricePerSqft: number | null;
  totalActive: number;
  avgDaysOnMarket: number | null;
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 1)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price.toLocaleString()}`;
}

/**
 * Shows a neighborhood market context box on listing detail pages.
 * Fetches from /api/market endpoint, cached 1hr.
 */
export default function MarketSnapshot({
  neighborhood,
  borough,
  listPrice,
  pricePerSqft,
  listingType,
}: {
  neighborhood: string;
  borough: string;
  listPrice: number;
  pricePerSqft: number | null;
  listingType: 'sale' | 'rent';
}) {
  const [data, setData] = useState<SnapshotData | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ type: listingType === 'rent' ? 'rental' : 'sale' });
    if (borough) params.set('borough', borough);
    // Try neighborhood first, fall back to borough-level
    fetch(`/api/market?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.success) return;
        // Find this neighborhood in the breakdown
        const match = d.neighborhoodBreakdown?.find(
          (n: { name: string }) => n.name.toLowerCase() === neighborhood.toLowerCase()
        );
        setData({
          neighborhood: match ? match.name : borough,
          borough,
          medianPrice: match?.avgPrice || d.active?.medianPrice || null,
          avgPricePerSqft: d.active?.avgPricePerSqft || null,
          totalActive: match?.count || d.active?.totalCount || 0,
          avgDaysOnMarket: d.active?.medianDaysOnMarket || null,
        });
      })
      .catch(() => {});
  }, [neighborhood, borough, listingType]);

  if (!data || !data.medianPrice) return null;

  const priceDiff = data.medianPrice ? ((listPrice - data.medianPrice) / data.medianPrice) * 100 : null;
  const isBelow = priceDiff !== null && priceDiff < 0;
  const isAbove = priceDiff !== null && priceDiff > 0;
  const priceLabel = listingType === 'rent' ? 'Median Rent' : 'Median Price';

  return (
    <div className="rounded-2xl bg-[#F8F7F4] border border-black/[0.03] p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <h3 className="text-[13px] font-semibold text-brand-dark">Market Context: {data.neighborhood}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-[11px] text-brand-dark/50">{priceLabel}</p>
          <p className="text-[15px] font-display font-bold text-brand-dark">
            {formatPrice(data.medianPrice!)}
            {listingType === 'rent' && <span className="text-[11px] font-normal text-brand-dark/50">/mo</span>}
          </p>
        </div>
        {data.avgPricePerSqft && listingType === 'sale' && (
          <div>
            <p className="text-[11px] text-brand-dark/50">Avg $/SF</p>
            <p className="text-[15px] font-display font-bold text-brand-dark">${data.avgPricePerSqft.toLocaleString()}</p>
          </div>
        )}
        <div>
          <p className="text-[11px] text-brand-dark/50">Active Listings</p>
          <p className="text-[15px] font-display font-bold text-brand-dark">{data.totalActive}</p>
        </div>
        {data.avgDaysOnMarket != null && (
          <div>
            <p className="text-[11px] text-brand-dark/50">Avg Days on Market</p>
            <p className="text-[15px] font-display font-bold text-brand-dark">{data.avgDaysOnMarket}</p>
          </div>
        )}
      </div>

      {/* Price comparison */}
      {priceDiff !== null && Math.abs(priceDiff) >= 1 && (
        <div className={`text-[12px] font-medium px-3 py-1.5 rounded-lg inline-block ${
          isBelow ? 'bg-green-50 text-green-700' : isAbove ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'
        }`}>
          This listing is {Math.abs(Math.round(priceDiff))}% {isBelow ? 'below' : 'above'} the area {listingType === 'rent' ? 'median rent' : 'median price'}
        </div>
      )}

      <Link href="/market" className="block mt-3 text-[11px] text-brand-gold-deep hover:text-brand-gold transition-colors font-medium">
        View Full Market Report &rarr;
      </Link>
    </div>
  );
}
