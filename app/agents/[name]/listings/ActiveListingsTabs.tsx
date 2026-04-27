'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ComingSoonBadge } from '@/app/components/ComingSoonBadge';

interface ListingDTO {
  id: string;
  slug: string;
  listPrice: number;
  bedroomsTotal: number | null;
  bathroomsFull: number | null;
  livingArea: number | null;
  address: {
    streetNumber: string;
    streetName: string;
    unitNumber: string | null;
    neighborhood: string | null;
    city: string;
  };
  media: { url: string }[] | null;
  // REBNY attribution — UCBA Art. III §2(C). Falls back to Mallan when the
  // agent's listings do not carry an explicit ListOfficeName.
  listOfficeName?: string | null;
  // UCBA Art. I §16(C) — Coming Soon badge requires status + date.
  status?: string | null;
  comingSoonDate?: string | null;
  activationDate?: string | null;
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function ActiveListingCard({ listing, isRental }: { listing: ListingDTO; isRental: boolean }) {
  const photoUrl = listing.media?.[0]?.url || '/images/listing-placeholder.svg';
  const neighborhood = listing.address.neighborhood || listing.address.city || '';
  const addr = `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}`;

  return (
    <Link
      href={`/listing/${listing.slug}?key=${encodeURIComponent(listing.id)}`}
      className="group block rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg transition-shadow"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        <Image
          src={photoUrl}
          alt={addr}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        {/* REBNY UCBA Art. I §16(C) — Coming Soon badge takes precedence over Active */}
        {(() => {
          const csBadge = (
            <ComingSoonBadge
              status={listing.status}
              comingSoonDate={listing.comingSoonDate}
              activationDate={listing.activationDate}
              className="absolute top-2.5 left-2.5 bg-blue-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded leading-tight max-w-[80%]"
            />
          );
          return csBadge;
        })()}
        {listing.status !== 'ComingSoon' && listing.status !== 'Coming Soon' && (
          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-green-600 text-white text-[10px] font-bold rounded uppercase tracking-wide">
            Active
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="font-display font-bold text-lg text-brand-dark leading-tight">
          {formatPrice(listing.listPrice, isRental)}
        </p>
        <div className="flex items-center gap-1.5 text-[12px] text-brand-dark/90 mt-1">
          {listing.bedroomsTotal != null && (
            <span>{listing.bedroomsTotal === 0 ? 'Studio' : `${listing.bedroomsTotal} Beds`}</span>
          )}
          {listing.bathroomsFull != null && (
            <>
              <span className="text-brand-dark/20">·</span>
              <span>{listing.bathroomsFull} Baths</span>
            </>
          )}
          {listing.livingArea != null && listing.livingArea > 0 && (
            <>
              <span className="text-brand-dark/20">·</span>
              <span>{listing.livingArea.toLocaleString()} SF</span>
            </>
          )}
        </div>
        <p className="text-sm text-brand-dark/90 mt-1.5 truncate">{addr}</p>
        <p className="text-[11px] text-brand-dark/75">{neighborhood}</p>
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median */}
        <p className="text-sm text-brand-dark/80 mt-2 truncate">
          RLS · Listing Courtesy of {listing.listOfficeName || 'Mallan Real Estate Inc.'}
        </p>
      </div>
    </Link>
  );
}

export default function ActiveListingsTabs({ sales, rentals }: { sales: ListingDTO[]; rentals: ListingDTO[] }) {
  const hasSales = sales.length > 0;
  const hasRentals = rentals.length > 0;
  const defaultTab = hasSales ? 'sales' : 'rentals';
  const [activeTab, setActiveTab] = useState<'sales' | 'rentals'>(defaultTab);

  const listings = activeTab === 'sales' ? sales : rentals;
  const isRental = activeTab === 'rentals';

  return (
    <section className="py-10 scroll-mt-32">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-lg font-display font-semibold text-brand-dark mb-4 pb-2 border-b border-black/5">
          Active Listings
        </h2>

        {/* Tabs */}
        {hasSales && hasRentals && (
          <div className="flex gap-0 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-6 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'sales'
                  ? 'border-brand-dark text-brand-dark'
                  : 'border-transparent text-brand-dark/75 hover:text-brand-dark/90'
              }`}
            >
              For Sale ({sales.length})
            </button>
            <button
              onClick={() => setActiveTab('rentals')}
              className={`px-6 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'rentals'
                  ? 'border-brand-dark text-brand-dark'
                  : 'border-transparent text-brand-dark/75 hover:text-brand-dark/90'
              }`}
            >
              For Rent ({rentals.length})
            </button>
          </div>
        )}

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {listings.map((listing) => (
            <ActiveListingCard key={listing.id} listing={listing} isRental={isRental} />
          ))}
        </div>
      </div>
    </section>
  );
}
