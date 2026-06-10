'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ComingSoonBadge } from '@/app/components/ComingSoonBadge';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';

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
  // Provenance for attribution. Mallan exclusives are OUR OWN listing, so they
  // show "Exclusive listing by Mallan Real Estate Inc." (never the RLS courtesy
  // line, which would mislabel our own listing as a third-party RLS one).
  _source?: string;
  _displayCompliance?: { attributionText?: string | null } | null;
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
      href={buildCanonicalListingPath({ slug: listing.slug, id: listing.id })}
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
        {/* Status badge — single source-of-truth render so we never show two
            badges or mislabel a status. UCBA Art. I §16(C) Coming Soon takes
            precedence (full required phrasing in <ComingSoonBadge/>). For all
            other statuses we show a colored pill that reflects the ACTUAL
            status — previously this was hardcoded "Active" which was incorrect
            for Pending / ActiveUnderContract / Closed / Withdrawn etc. */}
        {(() => {
          const status = String(listing.status || '').replace(/\s+/g, '');
          if (status === 'ComingSoon') {
            return (
              <ComingSoonBadge
                status={listing.status}
                comingSoonDate={listing.comingSoonDate}
                activationDate={listing.activationDate}
                className="absolute top-2.5 left-2.5 bg-blue-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded leading-tight max-w-[80%]"
              />
            );
          }
          // Map known statuses to label + color. Unknown statuses fall through
          // to the raw status text so they aren't silently misrepresented.
          const statusMap: Record<string, { label: string; bg: string }> = {
            Active: { label: 'Active', bg: 'bg-green-600' },
            ActiveUnderContract: { label: 'In Contract', bg: 'bg-amber-600' },
            Pending: { label: 'Pending', bg: 'bg-amber-600' },
            Closed: { label: 'Closed', bg: 'bg-gray-600' },
            Withdrawn: { label: 'Withdrawn', bg: 'bg-gray-500' },
            Canceled: { label: 'Cancelled', bg: 'bg-gray-500' },
            Cancelled: { label: 'Cancelled', bg: 'bg-gray-500' },
            Expired: { label: 'Expired', bg: 'bg-gray-500' },
            Hold: { label: 'On Hold', bg: 'bg-gray-500' },
          };
          const cfg = statusMap[status] || { label: status || 'Status', bg: 'bg-gray-600' };
          return (
            <span className={`absolute top-2.5 left-2.5 px-2 py-0.5 ${cfg.bg} text-white text-[10px] font-bold rounded uppercase tracking-wide`}>
              {cfg.label}
            </span>
          );
        })()}
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
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median.
            Mallan exclusive → "Exclusive listing by Mallan Real Estate Inc."
            (Mallan IS the listing broker). Third-party RLS → courtesy line.
            "Exclusive" = our OWN CRM listing: SL-/RL- listing_id prefix OR the
            DTO already classified it exclusive (rls_eligible===false). The
            prefix is the definitive CRM-authored signal — Trestle-synced rows
            carry RLS… ids (and a synced agent_id), so they never match here and
            keep the required RLS courtesy. (Codex reviews, PR #307/#308.) */}
        <p className="text-[13px] text-brand-dark/60 mt-2 truncate">
          {listing._source === 'exclusive' || /^(SL|RL)-/i.test(listing.id || '')
            ? listing._displayCompliance?.attributionText || 'Exclusive listing by Mallan Real Estate Inc.'
            : `RLS · Listing Courtesy of ${listing.listOfficeName || 'Mallan Real Estate Inc.'}`}
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
