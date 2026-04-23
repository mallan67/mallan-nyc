'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { IDXSearchDisclaimer } from '@/app/components/IDXDisclaimer';

interface ListingItem {
  id: string;
  mlsId: string;
  slug: string;
  listingType: 'sale' | 'rent';
  listPrice: number;
  propertyType: string;
  propertySubType: string | null;
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

const TABS = [
  { key: 'all', label: 'All', type: undefined, propertyType: undefined },
  { key: 'sale-condo', label: 'Condos', type: 'sale', propertyType: 'Condo' },
  { key: 'sale-coop', label: 'Co-ops', type: 'sale', propertyType: 'Co-op' },
  { key: 'rent', label: 'Rentals', type: 'rent', propertyType: undefined },
] as const;

interface LiveListingsWidgetProps {
  neighborhoodSlug: string;
  name: string;
  zipCodes?: string[];
  bounds?: { north: number; south: number; east: number; west: number };
}

export default function LiveListingsWidget({
  neighborhoodSlug,
  name,
  zipCodes,
  bounds,
}: LiveListingsWidgetProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    const tab = TABS.find(t => t.key === activeTab) || TABS[0];
    const params = new URLSearchParams({
      limit: '6',
      sort: 'price-desc',
    });
    // Primary: filter by neighborhood name (matches Trestle CityRegion + DB neighborhood field)
    // Fallback: ZIP codes narrow the Trestle query; bounds post-filter for precision.
    params.set('neighborhood', name);
    if (zipCodes && zipCodes.length > 0) {
      params.set('zipCodes', zipCodes.join(','));
    }
    if (bounds) {
      params.set('bounds', `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`);
    }
    if (tab.type) params.set('type', tab.type);
    if (tab.propertyType) params.set('propertyType', tab.propertyType);

    fetch(`/api/listings?${params}`)
      .then(r => r.json())
      .then(data => {
        setListings(data.listings || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => {
        setListings([]);
        setLoading(false);
      });
  }, [name, activeTab, zipCodes, bounds]);

  return (
    <section aria-label={`${name} Listings`} className="py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-brand-dark mb-6">
          {name} Listings
        </h2>

        {/* Tabs */}
        <div
          className="flex gap-1 mb-6 overflow-x-auto border-b border-black/5"
          role="tablist"
          aria-label="Filter by property type"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
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
              href={`/search?tab=${activeTab === 'rent' ? 'rent' : 'buy'}-residential&neighborhood=${encodeURIComponent(name)}`}
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

  const primaryPhoto = listing.media?.find(m => !m.mediaType || m.mediaType === 'Photo');
  const photoUrl = primaryPhoto?.url || listing.media?.[0]?.url;

  const isComingSoon = listing.status === 'ComingSoon' || listing.status === 'Coming Soon';

  return (
    <Link
      href={`/listing/${listing.slug || `listing-${listing.id}`}?key=${encodeURIComponent(listing.id)}`}
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

        <p className="text-sm text-brand-dark/95 mt-0.5">
          {listing.address.streetNumber} {listing.address.streetName}
          {listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}
        </p>

        <p className="text-xs text-brand-dark/85 mt-1">
          {listing.bedroomsTotal} bed{listing.bedroomsTotal !== 1 ? 's' : ''} &middot;{' '}
          {listing.bathroomsFull} bath{listing.bathroomsFull !== 1 ? 's' : ''}
          {listing.livingArea ? ` · ${listing.livingArea.toLocaleString()} sq ft` : ''}
        </p>

        {/* REBNY Compliance H1/F6: "Listing Courtesy of [Broker Name]" - REQUIRED */}
        <p className="text-xs text-brand-dark/70 mt-2">
          RLS · Listing Courtesy of {listing.listOfficeName || 'listing broker'}
        </p>
      </div>
    </Link>
  );
}
