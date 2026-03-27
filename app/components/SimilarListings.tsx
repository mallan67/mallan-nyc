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
      href={`/listing/${item.slug || item.mlsId}?key=${encodeURIComponent(item.mlsId || item.id)}`}
      className="flex-shrink-0 w-[220px] sm:w-[240px] group rounded-2xl border border-black/[0.06] bg-white overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Photo — fixed aspect ratio */}
      <div className="relative overflow-hidden bg-gray-100">
        {item.photoUrl ? (
          <div className="aspect-[4/3] overflow-hidden">
            <IDXImage
              src={item.photoUrl}
              alt={item.address}
              aspect="card"
              className="group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        ) : (
          <div className="aspect-[4/3] flex items-center justify-center text-brand-dark/20">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
            </svg>
          </div>
        )}
        {item.photosCount && item.photosCount > 1 && (
          <span className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded z-10">
            1/{item.photosCount}
          </span>
        )}
      </div>

      {/* Card body — fixed height, truncated text */}
      <div className="p-3 h-[140px] flex flex-col">
        {/* Neighborhood */}
        <p className="text-[10px] font-semibold text-brand-dark/45 uppercase tracking-wider truncate">
          {item.neighborhood || 'New York'}
        </p>
        {/* Address */}
        <p className="text-sm font-medium text-brand-dark mt-0.5 leading-snug truncate">
          {item.address}
        </p>
        {/* Type + stats */}
        <p className="text-xs text-brand-dark/55 mt-1 uppercase tracking-wide truncate">
          {item.propertyType}
        </p>
        <p className="text-xs text-brand-dark/55 mt-0.5">
          {item.beds} BD | {item.baths} BA{item.sqft > 0 && <> | {item.sqft.toLocaleString()} SF</>}
        </p>
        {/* Spacer pushes price to bottom */}
        <div className="flex-1" />
        {/* Courtesy + Price */}
        <p className="text-[10px] text-brand-dark/35 truncate">
          {item.office ? `Courtesy of ${item.office}` : '\u00A0'}
        </p>
        <div className="flex items-center justify-between mt-1">
          <p className="font-display font-bold text-[15px] text-brand-dark">
            {formatPrice(item.listPrice, isRental)}
          </p>
          <svg className="w-4.5 h-4.5 text-brand-dark/20 hover:text-brand-gold transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
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
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-shrink-0 w-[220px] sm:w-[240px] rounded-2xl border border-black/[0.06] overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-2.5 bg-gray-100 rounded w-1/3 animate-pulse" />
                <div className="h-3.5 bg-gray-100 rounded w-3/4 animate-pulse" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2 animate-pulse" />
                <div className="h-4 bg-gray-100 rounded w-2/5 animate-pulse mt-3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory"
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
