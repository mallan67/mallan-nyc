'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ComingSoonBadge } from './ComingSoonBadge';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';

interface SimilarListing {
  id: string;
  mlsId: string;
  slug: string;
  listPrice: number;
  beds: number;
  baths: number;
  sqft: number;
  address: string;
  neighborhood: string;
  borough?: string;
  postalCode?: string;
  photoUrl: string | null;
  photosCount?: number;
  propertyType: string;
  office: string;
  /** UCBA Art. I §16(C) — Coming Soon badge requires status + date. */
  status?: string | null;
  comingSoonDate?: string | null;
  activationDate?: string | null;
}

interface SimilarListingsProps {
  listingType: 'sale' | 'rent';
  beds: number;
  listPrice: number;
  postalCode: string;
  neighborhood?: string;
  currentListingId: string;
  /** Subject property class signals — comps are matched like-with-like (townhouse↔townhouse,
   *  condo↔condo, house↔house…). propertyType is the mapped display; propertySubType is the raw Cotality
   *  sub-type used to classify rentals/townhouses/houses the display can't. */
  propertyType?: string;
  propertySubType?: string | null;
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return `$${price.toLocaleString()}`;
}

/** Card — enclosed card with white background, border, shadow, fixed height */
function SimilarCard({ item, isRental }: { item: SimilarListing; isRental: boolean }) {
  return (
    <Link
      href={buildCanonicalListingPath({ slug: item.slug || item.mlsId, id: item.mlsId || item.id })}
      className="flex-shrink-0 w-[260px] sm:w-[280px] bg-white rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.1)] transition-all duration-300 group flex flex-col"
    >
      {/* Photo — fixed 4:3 aspect */}
      <div className="relative overflow-hidden aspect-[4/3] bg-gray-100">
        {item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.photoUrl}
            alt={item.address}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-brand-dark/15">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
            </svg>
          </div>
        )}
        {(item.photosCount ?? 0) > 1 && (
          <span className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-md z-10">
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {item.photosCount}
          </span>
        )}
        {/* REBNY UCBA Art. I §16(C) — Coming Soon badge */}
        <ComingSoonBadge
          status={item.status}
          comingSoonDate={item.comingSoonDate}
          activationDate={item.activationDate}
          className="absolute top-2.5 left-2.5 bg-blue-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded leading-tight max-w-[80%] z-10"
        />
      </div>
      {/* Card body */}
      <div className="p-3.5 flex flex-col flex-1">
        <p className="text-lg font-display font-bold text-brand-dark leading-tight">
          {formatPrice(item.listPrice, isRental)}
        </p>
        <div className="flex gap-2 text-[13px] text-brand-dark/80 mt-1">
          <span>{item.beds === 0 ? 'Studio' : `${item.beds} Bed${item.beds !== 1 ? 's' : ''}`}</span>
          <span className="text-brand-dark/25">&middot;</span>
          <span>{item.baths} Bath</span>
          {item.sqft > 0 && (
            <>
              <span className="text-brand-dark/25">&middot;</span>
              <span>{item.sqft.toLocaleString()} SF</span>
            </>
          )}
        </div>
        <p className="text-[13px] text-brand-dark mt-1.5 truncate">{item.address}</p>
        <p className="text-[12px] text-brand-dark/60 mt-0.5 truncate">
          {item.propertyType}{item.neighborhood ? ` · ${item.neighborhood}` : ''}
        </p>
        <div className="flex-1 min-h-[8px]" />
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median (median = ~12-13px in this card) */}
        <p className="text-[13px] text-brand-dark/60 pt-1.5 mt-1.5 truncate">
          RLS · Listing Courtesy of {item.office || 'REBNY RLS'}
        </p>
      </div>
    </Link>
  );
}

export default function SimilarListings({
  listingType,
  beds,
  listPrice,
  postalCode,
  neighborhood,
  currentListingId,
  propertyType,
  propertySubType,
}: SimilarListingsProps) {
  const [listings, setListings] = useState<SimilarListing[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      type: listingType,
      beds: String(beds),
      price: String(listPrice),
      postalCode,
      excludeId: currentListingId,
    });
    if (neighborhood) params.set('neighborhood', neighborhood);
    if (propertyType) params.set('propertyType', propertyType);
    if (propertySubType) params.set('propertySubType', propertySubType);

    fetch(`/api/listings/similar?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setListings(data.listings || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [listingType, beds, listPrice, postalCode, neighborhood, currentListingId, propertyType, propertySubType]);

  const scrollBy = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 320;
    scrollRef.current.scrollBy({ left: direction === 'right' ? amount : -amount, behavior: 'smooth' });
  }, []);

  if (!loading && listings.length === 0) return null;

  const isRental = listingType === 'rent';

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display font-semibold text-xl text-brand-dark">
          Similar Properties {isRental ? 'For Rent' : 'For Sale'}
        </h2>
        {listings.length > 3 && (
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              onClick={() => scrollBy('left')}
              className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-colors"
              aria-label="Scroll left"
            >
              <svg className="w-4 h-4 text-brand-dark/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={() => scrollBy('right')}
              className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center hover:bg-black/5 transition-colors"
              aria-label="Scroll right"
            >
              <svg className="w-4 h-4 text-brand-dark/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-[260px] sm:w-[280px] glass-card rounded-3xl overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-5 bg-gray-100 rounded w-2/5 animate-pulse" />
                <div className="h-3.5 bg-gray-100 rounded w-3/4 animate-pulse" />
                <div className="h-3.5 bg-gray-100 rounded w-full animate-pulse" />
                <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {listings.map((item) => (
            <div key={item.id} className="snap-start">
              <SimilarCard item={item} isRental={isRental} />
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-brand-dark/30 mt-3">
        Listing data provided by REBNY RLS. Information deemed reliable but not guaranteed.
      </p>
    </section>
  );
}
