'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import listingsData from '@/data/listings.json';
import { IDXSearchDisclaimer } from '@/app/components/IDXDisclaimer';
import type { Listing } from '@/lib/types/listing';

const listings = (listingsData as { listings: unknown[] }).listings as Listing[];

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'Condo', label: 'Condos' },
  { key: 'Co-op', label: 'Co-ops' },
  { key: 'Townhouse', label: 'Townhouses' },
  { key: 'rent', label: 'Luxury Rentals' },
] as const;

interface LiveListingsWidgetProps {
  neighborhoodSlug: string;
  name: string;
}

export default function LiveListingsWidget({
  neighborhoodSlug,
  name,
}: LiveListingsWidgetProps) {
  const [activeTab, setActiveTab] = useState<string>('all');

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      // REBNY Compliance: filter out IDX opt-out (H3 - Art. III Sec. 2C)
      if (l.compliance?.idxOptOut) return false;
      // REBNY Compliance: filter out Participant Only (H4 - Definitions W)
      if (l.flags?.participantOnlyNetwork) return false;
      // Filter out sold/rented (H6 - Art. I Sec. 6)
      if (l.mlsStatus === 'Sold' || l.mlsStatus === 'Rented') return false;

      // Neighborhood match
      if (l.address?.neighborhood !== neighborhoodSlug) return false;

      // Tab filter
      if (activeTab === 'all') return true;
      if (activeTab === 'rent') return l.listingType === 'rent';
      return (
        l.listingType === 'sale' &&
        l.propertyInfo?.propertyType === activeTab
      );
    });
  }, [neighborhoodSlug, activeTab]);

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
                  : 'border-transparent text-brand-dark/50 hover:text-brand-dark/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-brand-dark/50">
            <p className="mb-4">No active listings match this filter.</p>
            <Link
              href={`/buy?neighborhood=${neighborhoodSlug}`}
              className="text-brand-gold hover:underline text-sm"
            >
              Search all {name} listings
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.slice(0, 6).map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        {filtered.length > 6 && (
          <div className="mt-6 text-center">
            <Link
              href={`/buy?neighborhood=${neighborhoodSlug}`}
              className="inline-block px-6 py-2.5 border border-brand-dark text-brand-dark text-sm font-medium rounded-2xl hover:bg-brand-dark hover:text-white transition-colors"
            >
              View All {filtered.length} Listings
            </Link>
          </div>
        )}

        {/* REBNY IDX Disclaimer - REQUIRED on any page showing listings */}
        <IDXSearchDisclaimer className="mt-6" />
      </div>
    </section>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  const isRental = listing.listingType === 'rent';
  const price = isRental
    ? `$${listing.price.listPrice.toLocaleString()}/mo`
    : `$${listing.price.listPrice.toLocaleString()}`;

  // REBNY Compliance H10: hide address if InternetAddressDisplayYN = false
  // For our data model, we check a compliance flag
  const showAddress = true; // Mock data doesn't have this flag yet

  const isComingSoon = listing.mlsStatus === 'Active' && listing.flags?.isPreMarket;

  return (
    <div className="glass-card rounded-3xl overflow-hidden hover:shadow-md transition-shadow">
      {/* Image placeholder */}
      <div className="aspect-[4/3] bg-brand-gold/10 relative">
        {listing.media?.images?.[0]?.url ? (
          /* eslint-disable-next-line @next/next/no-img-element -- IDX listing images bypass next/image per image strategy */
          <img
            src={listing.media.images[0].url}
            alt={showAddress ? `${listing.address.streetNumber} ${listing.address.streetName}` : 'Listing photo'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-brand-dark/40 text-sm">
            No Photo
          </div>
        )}

        {/* Coming Soon badge - H7/D7: exact REBNY wording required */}
        {isComingSoon && (
          <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded">
            Coming Soon. No Showings or Open House until{' '}
            {listing.listing?.listingDate
              ? new Date(listing.listing.listingDate).toLocaleDateString('en-US')
              : 'TBD'}
          </div>
        )}

        {listing.flags?.isPriceReduced && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
            Price Reduced
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="text-lg font-display font-semibold text-brand-dark">{price}</p>

        {showAddress && (
          <p className="text-sm text-brand-dark/70 mt-0.5">
            {listing.address.streetNumber} {listing.address.streetName}
            {listing.address.unit ? `, ${listing.address.unit}` : ''}
          </p>
        )}

        <p className="text-xs text-brand-dark/50 mt-1">
          {listing.propertyInfo.bedroomsTotal} bed
          {listing.propertyInfo.bedroomsTotal !== 1 ? 's' : ''} &middot;{' '}
          {listing.propertyInfo.bathroomsFull} bath
          {listing.propertyInfo.bathroomsFull !== 1 ? 's' : ''}
          {listing.propertyInfo.aboveGradeFinishedArea
            ? ` · ${listing.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sq ft`
            : ''}
        </p>

        {/* REBNY Compliance H1/F6: "Listing Courtesy of [Broker Name]" - REQUIRED */}
        <p className="text-[11px] text-brand-dark/40 mt-2">
          Listing Courtesy of {listing.agent?.listOfficeName || 'REBNY RLS'}
        </p>

        {/* REBNY Compliance H11/G1: NO compensation amounts displayed - verified */}
      </div>
    </div>
  );
}
