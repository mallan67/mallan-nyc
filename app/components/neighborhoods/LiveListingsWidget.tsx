'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { IDXSearchDisclaimer } from '@/app/components/IDXDisclaimer';
import { useAsyncResource } from '@/lib/hooks/useAsyncResource';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { getSearchThumbnail } from '@/lib/media/listing-media-resolver';

interface ListingItem {
  id: string;
  mlsId: string;
  slug: string;
  listingType: 'sale' | 'rent';
  listPrice: number;
  propertyType: string;
  propertySubType: string | null;
  /** Canonical pair (Maya 2026-07-23): building ownership + transaction. */
  ownershipLabel?: string | null;
  transactionLabel?: string;
  bedroomsTotal: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  livingArea: number | null;
  listOfficeName: string;
  status: string;
  onMarketDate?: string;
  /** UCBA Art. I §16(C) — first-showing date that must appear in Coming Soon display */
  activationDate?: string | null;
  comingSoonDate?: string | null;
  media: { url: string; mediaType: string; order: number }[];
  address: {
    streetNumber: string;
    streetName: string;
    unitNumber: string | null;
    city: string;
    postalCode: string;
  };
}

// Two-row combinable filter taxonomy (Maya 2026-07-23): transaction is a
// TRANSACTION type, ownership is a BUILDING form — they are orthogonal, so a
// rental in a condo is selectable as For Rent + Condo. ROW 2 is the COMPLETE
// building-form taxonomy from the live feed census (Condo / Co-op / Condop /
// Rental Building / Townhouse / House / Multi-Family / Mixed-Use); unit forms
// (Loft, Duplex, Triplex) stay propertySubType and are not building forms.
const TRANSACTION_TABS = [
  { key: 'all', label: 'All', type: undefined },
  { key: 'sale', label: 'For Sale', type: 'sale' },
  { key: 'rent', label: 'For Rent', type: 'rent' },
] as const;

const PROPERTY_TYPE_TABS = [
  { key: 'all', label: 'All Types', propertyType: undefined },
  { key: 'condo', label: 'Condo', propertyType: 'Condo' },
  { key: 'coop', label: 'Co-op', propertyType: 'Co-op' },
  { key: 'condop', label: 'Condop', propertyType: 'Condop' },
  { key: 'rental-building', label: 'Rental Building', propertyType: 'Rental Building' },
  { key: 'townhouse', label: 'Townhouse', propertyType: 'Townhouse' },
  { key: 'house', label: 'House / Single-Family', propertyType: 'House' },
  { key: 'multi-family', label: 'Multi-Family', propertyType: 'Multi-Family' },
  { key: 'mixed-use', label: 'Mixed-Use', propertyType: 'Mixed-Use' },
] as const;

interface LiveListingsWidgetProps {
  neighborhoodSlug: string;
  name: string;
  zipCodes?: string[];
  bounds?: { north: number; south: number; east: number; west: number };
}

export default function LiveListingsWidget({
  neighborhoodSlug: _neighborhoodSlug,
  name,
  zipCodes,
  bounds,
}: LiveListingsWidgetProps) {
  const [activeTxn, setActiveTxn] = useState<string>('all');
  const [activeForm, setActiveForm] = useState<string>('all');

  // Build the query string up front so it's the stable cache key driving
  // useAsyncResource — neighborhood name, both filter rows, zip codes, and
  // bounds all contribute. Encoding in the key means filter changes refetch
  // automatically; identical params reuse the same in-flight request. The two
  // rows COMBINE: For Rent + Condo → type=rent&propertyType=Condo (rentals in
  // condo buildings).
  const queryString = (() => {
    const txn = TRANSACTION_TABS.find((t) => t.key === activeTxn) || TRANSACTION_TABS[0];
    const form = PROPERTY_TYPE_TABS.find((t) => t.key === activeForm) || PROPERTY_TYPE_TABS[0];
    const params = new URLSearchParams({ limit: '6', sort: 'price-desc' });
    params.set('neighborhood', name);
    if (zipCodes && zipCodes.length > 0) params.set('zipCodes', zipCodes.join(','));
    if (bounds) params.set('bounds', `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`);
    if (txn.type) params.set('type', txn.type);
    if (form.propertyType) params.set('propertyType', form.propertyType);
    return params.toString();
  })();

  const fetcher = useCallback(
    async (key: string | number, signal: AbortSignal): Promise<{ listings: ListingItem[]; total: number }> => {
      const res = await fetch(`/api/listings?${key}`, { signal });
      const data = await res.json();
      return { listings: (data.listings as ListingItem[]) || [], total: data.total || 0 };
    },
    [],
  );

  const { data, loading } = useAsyncResource(queryString, fetcher);
  const listings = data?.listings ?? [];
  const total = data?.total ?? 0;

  return (
    <section aria-label={`${name} Listings`} className="py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-brand-dark mb-6">
          {name} Listings
        </h2>

        {/* ROW 1 — Transaction (For Sale / For Rent). Horizontally scrollable
            on mobile so no category is ever dropped. */}
        <div
          className="flex gap-1 mb-2 overflow-x-auto border-b border-black/5"
          role="tablist"
          aria-label="Filter by transaction type"
        >
          {TRANSACTION_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTxn === tab.key}
              onClick={() => setActiveTxn(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTxn === tab.key
                  ? 'border-brand-gold-deep text-brand-dark'
                  : 'border-transparent text-brand-dark/85 hover:text-brand-dark/95'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ROW 2 — Building form (complete taxonomy; combines with ROW 1:
            For Rent + Condo returns rentals in condo buildings). */}
        <div
          className="flex gap-1 mb-6 overflow-x-auto border-b border-black/5"
          role="tablist"
          aria-label="Filter by building type"
        >
          {PROPERTY_TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeForm === tab.key}
              onClick={() => setActiveForm(tab.key)}
              className={`px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeForm === tab.key
                  ? 'border-brand-gold-deep text-brand-dark'
                  : 'border-transparent text-brand-dark/85 hover:text-brand-dark/95'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-3xl overflow-hidden">
                <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-5 bg-gray-100 rounded animate-pulse w-24" />
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-40" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-32" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && listings.length === 0 && (
          <div className="text-center py-12 text-brand-dark/85">
            <p className="mb-4">No active listings match this filter.</p>
            <Link
              href={`/search?tab=buy-residential&neighborhood=${encodeURIComponent(name)}`}
              className="text-brand-gold hover:underline text-sm"
            >
              Search all {name} listings
            </Link>
          </div>
        )}

        {!loading && listings.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        {!loading && total > 6 && (
          <div className="mt-6 text-center">
            <Link
              href={`/search?tab=${activeTxn === 'rent' ? 'rent' : 'buy'}-residential&neighborhood=${encodeURIComponent(name)}`}
              className="inline-block px-6 py-2.5 border border-brand-dark text-brand-dark text-sm font-medium rounded-2xl hover:bg-brand-dark hover:text-white transition-colors"
            >
              View All {total} Listings
            </Link>
          </div>
        )}

        {/* REBNY IDX Disclaimer - REQUIRED on any page showing listings */}
        <IDXSearchDisclaimer className="mt-6" />
      </div>
    </section>
  );
}

function ListingCard({ listing }: { listing: ListingItem }) {
  const isRental = listing.listingType === 'rent';
  const price = isRental
    ? `$${listing.listPrice.toLocaleString()}/mo`
    : `$${listing.listPrice.toLocaleString()}`;

  // NEVER a floorplan: getSearchThumbnail returns the first valid PHOTO only
  // (explicit placeholder otherwise) — Maya 2026-07-23.
  const photoUrl = getSearchThumbnail(listing.media);

  const isComingSoon = listing.status === 'ComingSoon' || listing.status === 'Coming Soon';

  return (
    <Link
      href={buildCanonicalListingPath({ slug: listing.slug || listing.mlsId, id: listing.mlsId || listing.id })}
      className="glass-card rounded-3xl overflow-hidden hover:shadow-md transition-shadow block"
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-brand-gold/10 relative">
        {photoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl}
            alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-brand-dark/75 text-sm">
            No Photo
          </div>
        )}

        {/* Coming Soon badge — REBNY UCBA Art. I, Sec. 16(C) exact wording.
            When we have an ActivationDate/comingSoonDate from the feed, surface it
            so consumers see the specific first-showing day, not the generic "Permitted" line. */}
        {isComingSoon && (() => {
          const csDate = listing.comingSoonDate || listing.activationDate;
          const formatted = csDate
            ? new Date(csDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : null;
          return (
            <div className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded leading-tight max-w-[90%]">
              {formatted
                ? `Coming Soon. No Showings or Open House until ${formatted}`
                : 'Coming Soon. No Showings or Open House Permitted'}
            </div>
          );
        })()}
      </div>

      <div className="p-4">
        <p className="text-lg font-display font-semibold text-brand-dark">{price}</p>

        {/* Canonical ownership + transaction (Maya 2026-07-23): building
            ownership decides the label; sale/rent decides the prefix. */}
        {(listing.transactionLabel || listing.ownershipLabel) && (
          <p className="text-[11px] font-medium tracking-wide text-brand-gold-deep mt-0.5 uppercase">
            {listing.transactionLabel || (isRental ? 'For Rent' : 'For Sale')}
            {listing.ownershipLabel ? ` · ${listing.ownershipLabel}` : ''}
          </p>
        )}

        <p className="text-sm text-brand-dark/95 mt-0.5">
          {listing.address.streetNumber} {listing.address.streetName}
          {listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}
        </p>

        <p className="text-xs text-brand-dark/85 mt-1">
          {listing.bedroomsTotal} bed{listing.bedroomsTotal !== 1 ? 's' : ''} &middot;{' '}
          {listing.bathroomsFull} bath{listing.bathroomsFull !== 1 ? 's' : ''}
          {listing.livingArea ? ` · ${listing.livingArea.toLocaleString()} sq ft` : ''}
        </p>

        {/* REBNY Compliance H1/F6: "Listing Courtesy of [Broker Name]" — UCBA Art. III §2(C): font not
            smaller than median — median of always-rendered text elements = 13.5px (tristle gate 2026-06-10); size pinned at 14px. */}
        <p className="text-sm text-brand-dark/60 mt-2">
          RLS · Listing Courtesy of {listing.listOfficeName || 'listing broker'}
        </p>
      </div>
    </Link>
  );
}
