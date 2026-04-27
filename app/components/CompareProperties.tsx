'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import { type FavoriteEntry } from '@/lib/hooks/useFavorites';

interface ListingDetail {
  id: string;
  slug: string;
  listPrice: number;
  originalListPrice: number;
  listingType: 'sale' | 'rent';
  bedroomsTotal: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  livingArea: number | null;
  propertyType: string;
  propertySubType: string | null;
  associationFee?: number;
  yearBuilt?: number | null;
  taxAnnualAmount?: number | null;
  petsAllowed?: string;
  address: {
    streetNumber: string;
    streetName: string;
    unitNumber: string | null;
    neighborhood?: string;
    borough?: string;
    postalCode: string;
  };
  media: { url: string; mediaType: string; order: number }[];
  listOfficeName: string;
  modificationTimestamp: string;
  _displayCompliance: {
    attributionText: string;
    requiresAttribution: boolean;
  };
}

interface ComparePropertiesProps {
  /** Pre-selected favorite entries to compare (2-4) */
  entries: FavoriteEntry[];
  /** Callback when user removes a listing from comparison */
  onRemove?: (id: string) => void;
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatPricePerSqft(price: number, sqft: number | null): string {
  if (!sqft || sqft <= 0) return '—';
  return `$${Math.round(price / sqft).toLocaleString()}/SF`;
}

function highlightBest(values: (number | null | undefined)[], mode: 'low' | 'high'): number {
  const filtered = values.map((v, i) => ({ v: v ?? null, i })).filter(x => x.v !== null);
  if (filtered.length === 0) return -1;
  const best = mode === 'low'
    ? filtered.reduce((a, b) => (a.v! < b.v! ? a : b))
    : filtered.reduce((a, b) => (a.v! > b.v! ? a : b));
  return best.i;
}

/** Side-by-side comparison row */
function CompareRow({
  label,
  values,
  bestIndex = -1,
  sublabel,
}: {
  label: string;
  values: string[];
  bestIndex?: number;
  sublabel?: string;
}) {
  return (
    <tr className="border-b border-black/[0.04]">
      <td className="py-3 pr-4 text-sm font-medium text-brand-dark/70 whitespace-nowrap align-top">
        {label}
        {sublabel && <span className="block text-[10px] text-brand-dark/50 font-normal">{sublabel}</span>}
      </td>
      {values.map((val, i) => (
        <td
          key={i}
          className={`py-3 px-3 text-sm text-center ${
            bestIndex === i ? 'font-semibold text-green-700 bg-green-50/50' : 'text-brand-dark'
          }`}
        >
          {val || '—'}
        </td>
      ))}
    </tr>
  );
}

export default function CompareProperties({ entries, onRemove }: ComparePropertiesProps) {
  const [details, setDetails] = useState<(ListingDetail | null)[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch full details for each listing
  useEffect(() => {
    if (entries.length === 0) return;
    setLoading(true);

    Promise.all(
      entries.map(async (entry) => {
        try {
          const res = await fetch(`/api/listings/${encodeURIComponent(entry.id)}`);
          if (!res.ok) return null;
          const data = await res.json();
          return data?.listing || data || null;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      setDetails(results);
      setLoading(false);
    });
  }, [entries]);

  const isRental = entries[0]?.listingType === 'rent';

  if (entries.length < 2) {
    return (
      <div className="text-center py-12">
        <svg className="w-12 h-12 text-brand-dark/10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        <p className="text-brand-dark/70 text-sm">Select at least 2 properties to compare.</p>
      </div>
    );
  }

  // Use entry data (always available) supplemented by detail data (when loaded)
  const listings = entries.map((entry, i) => ({
    entry,
    detail: details[i] || null,
  }));

  const prices = listings.map(l => l.entry.price);
  const beds = listings.map(l => l.entry.beds);
  const baths = listings.map(l => l.entry.baths);
  const sqfts = listings.map(l => l.detail?.livingArea ?? null);
  const fees = listings.map(l => l.detail?.associationFee ?? null);
  const taxes = listings.map(l => l.detail?.taxAnnualAmount ?? null);
  const ppsf = listings.map(l => {
    const sqft = l.detail?.livingArea;
    return sqft && sqft > 0 ? Math.round(l.entry.price / sqft) : null;
  });

  const bestPrice = highlightBest(prices, 'low');
  const bestBeds = highlightBest(beds, 'high');
  const bestBaths = highlightBest(baths, 'high');
  const bestSqft = highlightBest(sqfts, 'high');
  const bestFee = highlightBest(fees, 'low');
  const bestPpsf = highlightBest(ppsf, 'low');

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px]">
        {/* Photo + basic info header */}
        <thead>
          <tr className="border-b border-black/[0.06]">
            <th className="w-32 lg:w-40" />
            {listings.map(({ entry }, i) => (
              <th key={entry.id} className="px-3 pb-4 align-top">
                <div className="relative">
                  {onRemove && (
                    <button
                      onClick={() => onRemove(entry.id)}
                      className="absolute -top-1 -right-1 z-10 w-6 h-6 rounded-full bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors"
                      aria-label="Remove from comparison"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  <Link href={`/listing/${entry.slug}?key=${encodeURIComponent(entry.id)}`} className="block">
                    <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-3">
                      <IDXImage
                        src={entry.photoUrl || '/images/listing-placeholder.svg'}
                        alt={entry.address}
                        aspect="card"
                      />
                    </div>
                    <p className="text-base font-display font-bold text-brand-dark text-center">
                      {formatPrice(entry.price, isRental)}
                    </p>
                    <p className="text-xs text-brand-dark/85 text-center mt-1 truncate px-1">
                      {entry.address}
                    </p>
                  </Link>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Key metrics */}
          <CompareRow
            label="Bedrooms"
            values={listings.map(l => `${l.entry.beds}`)}
            bestIndex={bestBeds}
          />
          <CompareRow
            label="Bathrooms"
            values={listings.map(l => `${l.entry.baths}`)}
            bestIndex={bestBaths}
          />
          <CompareRow
            label="Square Feet"
            values={listings.map(l => l.detail?.livingArea ? `${l.detail.livingArea.toLocaleString()} SF` : '—')}
            bestIndex={bestSqft}
          />
          <CompareRow
            label="Price / SF"
            values={listings.map(l => formatPricePerSqft(l.entry.price, l.detail?.livingArea ?? null))}
            bestIndex={bestPpsf}
          />

          {/* Property details */}
          <CompareRow
            label="Type"
            values={listings.map(l => l.detail?.propertyType || '—')}
          />
          <CompareRow
            label="Neighborhood"
            values={listings.map(l => {
              const d = l.detail;
              if (!d) return '—';
              const nh = d.address.neighborhood;
              const bor = d.address.borough;
              return nh && nh !== bor ? `${nh}, ${bor}` : bor || '—';
            })}
          />
          <CompareRow
            label="ZIP"
            values={listings.map(l => l.detail?.address.postalCode || '—')}
          />

          {/* Financials */}
          {!isRental && (
            <>
              <CompareRow
                label={listings.some(l => l.detail?.propertyType === 'Co-op') ? 'Maint / CC' : 'Common Charges'}
                sublabel="Monthly"
                values={listings.map(l => l.detail?.associationFee ? `$${l.detail.associationFee.toLocaleString()}/mo` : '—')}
                bestIndex={bestFee}
              />
              <CompareRow
                label="Annual Taxes"
                values={listings.map(l => l.detail?.taxAnnualAmount ? `$${l.detail.taxAnnualAmount.toLocaleString()}` : '—')}
                bestIndex={highlightBest(taxes, 'low')}
              />
            </>
          )}

          {/* Building info */}
          {loading ? (
            <tr>
              <td colSpan={listings.length + 1} className="py-6 text-center text-sm text-brand-dark/50">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-brand-gold/30 border-t-brand-gold rounded-full animate-spin" />
                  Loading details...
                </div>
              </td>
            </tr>
          ) : (
            <>
              <CompareRow
                label="Year Built"
                values={listings.map(l => l.detail?.yearBuilt ? String(l.detail.yearBuilt) : '—')}
              />
              <CompareRow
                label="Pets"
                values={listings.map(l => l.detail?.petsAllowed || '—')}
              />
            </>
          )}

          {/* Attribution */}
          <CompareRow
            label="Listed By"
            values={listings.map(l => l.detail?.listOfficeName || '—')}
          />
          <CompareRow
            label="Updated"
            values={listings.map(l => l.detail?.modificationTimestamp ? new Date(l.detail.modificationTimestamp).toLocaleDateString() : '—')}
          />
        </tbody>
      </table>

      {/* RLS Attribution — UCBA Art. III §2(C) + Art. VIII §4 (font not smaller than median page text) */}
      <p className="text-sm text-brand-dark/70 mt-4 text-center">
        Based on information from the REBNY Listing Service. Information deemed reliable but not guaranteed.
      </p>
    </div>
  );
}
