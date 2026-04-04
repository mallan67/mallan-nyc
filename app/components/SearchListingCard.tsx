'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import FavoriteButton from '@/app/components/FavoriteButton';
import { type DisplayListing, listingHref } from '@/lib/idx/display-adapter';
import { useSwipe } from '@/lib/hooks/useSwipe';

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatComingSoonBadge(listing: DisplayListing): string | null {
  if (!listing._displayCompliance.comingSoon) return null;
  const date = listing._displayCompliance.comingSoonDate;
  if (date) {
    const formatted = new Date(date).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    return `Coming Soon. No Showings or Open House until ${formatted}`;
  }
  return 'Coming Soon. No Showings or Open House Permitted';
}

interface CardProps {
  listing: DisplayListing;
  isRental: boolean;
  isHighlighted?: boolean;
  onHover?: (id: string | null) => void;
}

/** Get the first photo URL (prefers Photo type, falls back to any media) */
function heroPhoto(listing: DisplayListing): string {
  const photo = listing.media.find(m => !m.mediaType || m.mediaType === 'Photo');
  return photo?.url || listing.media[0]?.url || '/images/listing-placeholder.svg';
}

/** Grid card — standard card with photo on top */
export function GridCard({ listing, isRental, isHighlighted, onHover }: CardProps) {
  return (
    <Link
      href={listingHref(listing)}
      className={`glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group ${
        isHighlighted ? 'ring-2 ring-brand-gold shadow-lg' : ''
      }`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="relative overflow-hidden">
        <IDXImage
          src={heroPhoto(listing)}
          alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
          aspect="card"
          className="group-hover:scale-105 transition-transform duration-700"
        />
        {formatComingSoonBadge(listing) ? (
          <span className="absolute top-3 left-3 px-3 py-1 bg-amber-500 text-white text-xs rounded-xl z-10">
            {formatComingSoonBadge(listing)}
          </span>
        ) : (
          <div className="absolute top-3 left-3 z-10">
            <FavoriteButton listing={listing} />
          </div>
        )}
        {listing.media.length > 0 && (
          <div className="absolute top-3 right-3 flex gap-1.5 z-10">
            <span className="flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              {listing.photosCount || listing.media.length}
            </span>
          </div>
        )}
      </div>
      <div className="p-4 sm:p-5">
        <p className="text-2xl font-display font-bold text-brand-dark">
          {formatPrice(listing.listPrice, isRental)}
        </p>
        <div className="flex gap-3 text-[15px] text-brand-dark/90 mt-1.5">
          <span>{listing.bedroomsTotal} Bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
          <span className="text-brand-dark/30">&middot;</span>
          <span>{listing.bathroomsFull}{listing.bathroomsHalf > 0 ? `.${listing.bathroomsHalf}` : ''} Bath</span>
          {listing.livingArea && listing.livingArea > 0 && (
            <>
              <span className="text-brand-dark/30">&middot;</span>
              <span>{listing.livingArea.toLocaleString()} SF</span>
            </>
          )}
        </div>
        <p className="text-[15px] text-brand-dark mt-2">
          {listing.address.streetName === 'Address Undisclosed' ? (
            <span className="italic text-brand-dark/85">Address Undisclosed</span>
          ) : (
            <>{listing.address.streetNumber} {listing.address.streetName}{listing.address.unitNumber && `, ${listing.address.unitNumber}`}</>
          )}
        </p>
        <p className="text-sm text-brand-dark/70 mt-0.5">
          {listing.propertyType && <>{listing.propertyType}</>}
          {listing.address.neighborhood && listing.address.neighborhood !== listing.address.borough
            ? <>{listing.propertyType ? ' · ' : ''}{listing.address.neighborhood}, {listing.address.borough}</>
            : <>{listing.propertyType ? ' · ' : ''}{listing.address.borough}</>}
        </p>
        {!isRental && listing.associationFee && (
          <p className="text-sm text-brand-dark/70 mt-1">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}
        {isRental && listing.moveInCosts && (
          <p className="text-sm text-brand-dark/70 mt-1">Move-In: {listing.moveInCosts}</p>
        )}
        <p className="text-xs text-brand-dark/50 mt-2.5 pt-2 border-t border-black/5">
          Listing Courtesy of {listing.listOfficeName || 'REBNY RLS'}
          {listing.modificationTimestamp && (
            <> &middot; {new Date(listing.modificationTimestamp).toLocaleDateString()}</>
          )}
        </p>
      </div>
    </Link>
  );
}

/** List card — horizontal layout */
export function ListCard({ listing, isRental, isHighlighted, onHover }: CardProps) {
  return (
    <Link
      href={listingHref(listing)}
      className={`glass-card rounded-2xl overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 flex group ${
        isHighlighted ? 'ring-2 ring-brand-gold shadow-lg' : ''
      }`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="relative w-48 sm:w-64 flex-shrink-0">
        <IDXImage
          src={heroPhoto(listing)}
          alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
          aspect="card"
          className="group-hover:scale-105 transition-transform duration-700"
        />
        {formatComingSoonBadge(listing) ? (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500 text-white text-xs rounded-lg z-10">
            {formatComingSoonBadge(listing)}
          </span>
        ) : (
          <div className="absolute top-2 left-2 z-10">
            <FavoriteButton listing={listing} />
          </div>
        )}
      </div>
      <div className="p-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xl font-display font-bold text-brand-dark">
              {formatPrice(listing.listPrice, isRental)}
            </p>
            <div className="flex gap-3 text-[15px] text-brand-dark/90 mt-1">
              <span>{listing.bedroomsTotal} Bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
              <span className="text-brand-dark/30">&middot;</span>
              <span>{listing.bathroomsFull}{listing.bathroomsHalf > 0 ? `.${listing.bathroomsHalf}` : ''} Bath</span>
              {listing.livingArea && listing.livingArea > 0 && (
                <>
                  <span className="text-brand-dark/30">&middot;</span>
                  <span>{listing.livingArea.toLocaleString()} SF</span>
                </>
              )}
            </div>
            <p className="text-[15px] text-brand-dark truncate mt-1.5">
              {listing.address.streetName === 'Address Undisclosed' ? (
                <span className="italic text-brand-dark/85">Address Undisclosed</span>
              ) : (
                <>{listing.address.streetNumber} {listing.address.streetName}{listing.address.unitNumber && `, ${listing.address.unitNumber}`}</>
              )}
            </p>
            <p className="text-sm text-brand-dark/70 mt-0.5">
              {listing.propertyType && <>{listing.propertyType}</>}
              {listing.address.neighborhood && listing.address.neighborhood !== listing.address.borough
                ? <>{listing.propertyType ? ' · ' : ''}{listing.address.neighborhood}, {listing.address.borough}</>
                : <>{listing.propertyType ? ' · ' : ''}{listing.address.borough}</>}
            </p>
          </div>
          {listing.propertySubType && (
            <span className="text-xs px-2 py-1 bg-gray-100 text-brand-dark rounded-lg flex-shrink-0">
              {listing.propertySubType}
            </span>
          )}
        </div>
        {!isRental && listing.associationFee && (
          <p className="text-sm text-brand-dark/70 mt-1">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}
        {isRental && listing.moveInCosts && (
          <p className="text-sm text-brand-dark/70 mt-1">Move-In: {listing.moveInCosts}</p>
        )}
        <p className="text-xs text-brand-dark/50 mt-2">
          Listing Courtesy of {listing.listOfficeName || 'REBNY RLS'}
          {listing.modificationTimestamp && <> &middot; {new Date(listing.modificationTimestamp).toLocaleDateString()}</>}
        </p>
      </div>
    </Link>
  );
}

/** Split-view card — compact card for 2-col grid with photo carousel + touch swipe */
export function SplitCard({ listing, isRental, isHighlighted, onHover }: CardProps) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const photos = listing.media.filter(m => !m.mediaType || m.mediaType === 'Photo');
  const hasMultiple = photos.length > 1;

  const goPrev = useCallback(() => setPhotoIdx(i => (i > 0 ? i - 1 : photos.length - 1)), [photos.length]);
  const goNext = useCallback(() => setPhotoIdx(i => (i < photos.length - 1 ? i + 1 : 0)), [photos.length]);
  const swipe = useSwipe(goNext, goPrev);

  const prev = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    goPrev();
  }, [goPrev]);

  const next = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    goNext();
  }, [goNext]);

  return (
    <div
      className={`glass-card rounded-xl overflow-hidden hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all duration-300 ${
        isHighlighted ? 'ring-2 ring-brand-gold shadow-lg' : ''
      }`}
      onMouseEnter={() => { onHover?.(listing.id); setHovered(true); }}
      onMouseLeave={() => { onHover?.(null); setHovered(false); }}
    >
      {/* Photo with carousel + touch swipe */}
      <div
        className="relative overflow-hidden touch-pan-y"
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        <Link href={listingHref(listing)} className="block w-full" onClick={swipe.cancelIfSwiping}>
          <IDXImage
            src={photos[photoIdx]?.url || '/images/listing-placeholder.svg'}
            alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
            aspect="wide"
            className={`transition-transform duration-500 ${hovered ? 'scale-105' : ''}`}
          />
        </Link>
        {formatComingSoonBadge(listing) && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-amber-500 text-white text-[9px] rounded-md z-10">
            {formatComingSoonBadge(listing)}
          </span>
        )}
        <div className="absolute top-1.5 right-1.5 z-10">
          <FavoriteButton listing={listing} size="sm" />
        </div>
        {/* Photo count badge */}
        {photos.length > 1 && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md z-10">
            {photoIdx + 1}/{photos.length}
          </span>
        )}
        {/* Photo nav arrows — visible on hover */}
        {hasMultiple && hovered && (
          <>
            <button
              onClick={prev}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white z-20"
              aria-label="Previous photo"
            >
              <svg className="w-3 h-3 text-brand-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={next}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white z-20"
              aria-label="Next photo"
            >
              <svg className="w-3 h-3 text-brand-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </>
        )}
        {/* Dot indicators */}
        {hasMultiple && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-10">
            {photos.slice(0, 5).map((_, i) => (
              <span key={i} className={`w-1 h-1 rounded-full transition-colors ${i === photoIdx ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>
      {/* Info */}
      <Link href={listingHref(listing)} className="block px-3.5 py-3">
        <p className="text-lg font-display font-bold text-brand-dark">
          {formatPrice(listing.listPrice, isRental)}
        </p>
        <div className="flex gap-2 text-sm text-brand-dark/90 mt-1">
          <span>{listing.bedroomsTotal} Bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
          <span className="text-brand-dark/30">&middot;</span>
          <span>{listing.bathroomsFull}{listing.bathroomsHalf > 0 ? `.${listing.bathroomsHalf}` : ''} Bath</span>
          {listing.livingArea && listing.livingArea > 0 && (
            <>
              <span className="text-brand-dark/30">&middot;</span>
              <span>{listing.livingArea.toLocaleString()} SF</span>
            </>
          )}
        </div>
        <p className="text-sm text-brand-dark truncate mt-1.5">
          {listing.address.streetName === 'Address Undisclosed'
            ? 'Address Undisclosed'
            : `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}`}
        </p>
        <p className="text-[13px] text-brand-dark/70 truncate mt-0.5">
          {listing.propertyType && <>{listing.propertyType}</>}
          {listing.address.neighborhood && listing.address.neighborhood !== listing.address.borough
            ? <>{listing.propertyType ? ' · ' : ''}{listing.address.neighborhood}, {listing.address.borough || 'Manhattan'}</>
            : <>{listing.propertyType ? ' · ' : ''}{listing.address.borough || 'Manhattan'}</>}
        </p>
        {!isRental && listing.associationFee && (
          <p className="text-[13px] text-brand-dark/70 mt-0.5">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}
        {isRental && listing.moveInCosts && (
          <p className="text-[13px] text-brand-dark/70 mt-0.5">Move-In: {listing.moveInCosts}</p>
        )}
        <p className="text-xs text-brand-dark/50 mt-1.5">
          Listing Courtesy of {listing.listOfficeName || 'REBNY RLS'}
        </p>
      </Link>
    </div>
  );
}
