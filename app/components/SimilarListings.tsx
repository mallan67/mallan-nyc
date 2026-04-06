'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import IDXImage from './IDXImage';

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
}

interface SimilarListingsProps {
  listingType: 'sale' | 'rent';
  beds: number;
  listPrice: number;
  postalCode: string;
  neighborhood?: string;
  currentListingId: string;
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return `$${price.toLocaleString()}`;
}

/** Card matching the search page GridCard style exactly */
function SimilarCard({ item, isRental }: { item: SimilarListing; isRental: boolean }) {
  return (
    <Link
      href={`/listing/${item.slug || item.mlsId}?key=${encodeURIComponent(item.mlsId || item.id)}`}
      className="flex-shrink-0 w-[260px] sm:w-[280px] glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
    >
      {/* Photo */}
      <div className="relative overflow-hidden">
        {item.photoUrl ? (
          <IDXImage
            src={item.photoUrl}
            alt={item.address}
            aspect="card"
            className="group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="aspect-[4/3] flex items-center justify-center bg-gray-100 text-brand-dark/20">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
            </svg>
          </div>
        )}
        {(item.photosCount ?? 0) > 1 && (
          <div className="absolute top-3 right-3 z-10">
            <span className="flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              {item.photosCount}
            </span>
          </div>
        )}
      </div>
      {/* Card body — fixed height for alignment */}
      <div className="p-4 flex flex-col min-h-[160px]">
        <p className="text-xl font-display font-bold text-brand-dark">
          {formatPrice(item.listPrice, isRental)}
        </p>
        <div className="flex gap-2 text-[14px] text-brand-dark/90 mt-1">
          <span>{item.beds === 0 ? 'Studio' : `${item.beds} Bed${item.beds !== 1 ? 's' : ''}`}</span>
          <span className="text-brand-dark/30">&middot;</span>
          <span>{item.baths} Bath</span>
          {item.sqft > 0 && (
            <>
              <span className="text-brand-dark/30">&middot;</span>
              <span>{item.sqft.toLocaleString()} SF</span>
            </>
          )}
        </div>
        <p className="text-[14px] text-brand-dark mt-1.5 truncate">
          {item.address}
        </p>
        <p className="text-[13px] text-brand-dark/70 mt-0.5 truncate">
          {item.propertyType}
          {item.neighborhood && <> &middot; {item.neighborhood}</>}
        </p>
        <div className="flex-1" />
        <p className="text-xs text-brand-dark/50 pt-2 border-t border-black/5 truncate">
          Listing Courtesy of {item.office || 'REBNY RLS'}
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

    fetch(`/api/listings/similar?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setListings(data.listings || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [listingType, beds, listPrice, postalCode, neighborhood, currentListingId]);

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
