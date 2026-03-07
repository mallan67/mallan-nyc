'use client';

import { useState, useEffect } from 'react';
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
  photoUrl: string | null;
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
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  return `$${price.toLocaleString()}`;
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

  if (!loading && listings.length === 0) return null;

  const isRental = listingType === 'rent';

  return (
    <section>
      <h2 className="text-xl font-display font-semibold mb-4">Similar Nearby</h2>

      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {listings.map((item) => (
            <Link
              key={item.id}
              href={`/listing/${item.slug || item.mlsId}`}
              className="glass-card rounded-2xl overflow-hidden hover:shadow-md transition-all group"
            >
              <div className="bg-gray-100">
                {item.photoUrl ? (
                  <IDXImage
                    src={item.photoUrl}
                    alt={item.address}
                    aspect="card"
                  />
                ) : (
                  <div className="aspect-[4/3] flex items-center justify-center text-brand-dark/20">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="font-display font-semibold text-sm text-brand-dark">
                  {formatPrice(item.listPrice, isRental)}
                </p>
                <p className="text-xs text-brand-dark/70 mt-0.5">
                  {item.beds} bd &middot; {item.baths} ba
                  {item.sqft > 0 && <> &middot; {item.sqft.toLocaleString()} sf</>}
                </p>
                <p className="text-xs text-brand-dark/60 mt-0.5 truncate">{item.address}</p>
                <p className="text-[10px] text-brand-dark/40 mt-1">RLS &middot; {item.office}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-[9px] text-brand-dark/30 mt-3">
        REBNY RLS &middot; Data deemed reliable but not guaranteed
      </p>
    </section>
  );
}
