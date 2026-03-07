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

function SimilarCard({ item, isRental }: { item: SimilarListing; isRental: boolean }) {
  return (
    <Link
      href={`/listing/${item.slug || item.mlsId}`}
      className="flex-shrink-0 w-[280px] sm:w-[300px] group"
    >
      {/* Photo */}
      <div className="relative overflow-hidden rounded-xl bg-gray-100">
        {item.photoUrl ? (
          <div className="aspect-[4/3] overflow-hidden">
            <IDXImage
              src={item.photoUrl}
              alt={item.address}
              aspect="card"
            />
          </div>
        ) : (
          <div className="aspect-[4/3] flex items-center justify-center text-brand-dark/20">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
            </svg>
          </div>
        )}
        {/* Photo count badge */}
        {item.photosCount && item.photosCount > 1 && (
          <span className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded z-10">
            1/{item.photosCount}
          </span>
        )}
        {/* Next arrow */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <svg className="w-4 h-4 text-brand-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </div>
      </div>

      {/* Card body */}
      <div className="pt-3 pb-1">
        {/* Neighborhood */}
        <p className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider">
          {item.neighborhood || 'New York'}
        </p>
        {/* Address */}
        <p className="text-[15px] text-brand-dark mt-0.5 leading-snug">
          {item.address}
        </p>
        {/* Property type + stats */}
        <p className="text-[13px] text-brand-dark/60 mt-1 uppercase tracking-wide">
          {item.propertyType}
        </p>
        <p className="text-[13px] text-brand-dark/60 mt-0.5">
          {item.beds} BD | {item.baths} BA{item.sqft > 0 && <> | {item.sqft.toLocaleString()} SQ. FT.</>}
        </p>
        {/* Courtesy line */}
        <p className="text-[11px] text-brand-dark/40 mt-2">
          Courtesy of {item.office}
        </p>
        {/* Price */}
        <div className="flex items-center justify-between mt-2">
          <p className="font-display font-bold text-base text-brand-dark">
            {formatPrice(item.listPrice, isRental)}
          </p>
          <svg className="w-5 h-5 text-brand-dark/25 hover:text-brand-gold transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
        </div>
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
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-shrink-0 w-[280px] sm:w-[300px]">
              <div className="aspect-[4/3] bg-gray-100 rounded-xl animate-pulse" />
              <div className="pt-3 space-y-2">
                <div className="h-3 bg-gray-100 rounded w-1/3 animate-pulse" />
                <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
                <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
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
