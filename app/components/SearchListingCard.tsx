'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import FavoriteButton from '@/app/components/FavoriteButton';
import FareActFeeBadge from '@/app/components/FareActFeeBadge';
import { type DisplayListing, listingHref } from '@/lib/idx/display-adapter';
import { useSwipe } from '@/lib/hooks/useSwipe';
import { formatBathrooms } from '@/lib/format/bathrooms';
import {
  LISTING_PLACEHOLDER_IMAGE,
  countPhotoMedia,
  getHeroPhoto,
  getValidPhotoMedia,
} from '@/lib/media/listing-card-media';

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * PR-FE.2 Option C (2026-05-15) — "Also listed by …" badge text.
 *
 * Returns null when this listing has no co-listed siblings on the
 * current response page. Otherwise returns a short string for the
 * supplementary badge rendered immediately below the primary REBNY
 * attribution line.
 *
 * The badge is INFORMATIONAL only — REBNY UCBA Art. III §2(C)
 * compliance is satisfied by the existing "RLS · Listing Courtesy of
 * {listOfficeName}" attribution above. The badge merely tells the
 * user that this physical property is co-listed by additional
 * brokerages — preventing the "looks like a duplicate / glitch"
 * confusion when the same apartment appears 3 times in search results
 * (typical NYC luxury new-development pattern).
 *
 * Format:
 *   - 1 sibling : "Also listed by {brokerage}"
 *   - 2 siblings: "Also listed by {brokerage} + 1 other"
 *   - N siblings: "Also listed by {brokerage} + {N-1} others"
 *   - count > 0 but no brokerage names: "Multiple listing sources"
 */
function formatCoListedBadge(listing: DisplayListing): string | null {
  const count = listing._coListedCount;
  if (!count || count <= 0) return null;
  const brokerages = listing._coListedBrokerages ?? [];
  if (brokerages.length === 0) return 'Multiple listing sources';
  const first = brokerages[0];
  if (count === 1) return `Also listed by ${first}`;
  if (count === 2) return `Also listed by ${first} + 1 other`;
  return `Also listed by ${first} + ${count - 1} others`;
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

/** Grid card — standard card with photo on top */
export function GridCard({ listing, isRental, isHighlighted, onHover }: CardProps) {
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());
  const heroSrc = getHeroPhoto(listing.media, failedPhotoUrls);
  const photoCount = countPhotoMedia(listing.media);
  const handlePhotoError = useCallback(() => {
    if (heroSrc === LISTING_PLACEHOLDER_IMAGE) return;
    setFailedPhotoUrls(prev => new Set(prev).add(heroSrc));
  }, [heroSrc]);

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
          src={heroSrc}
          alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
          aspect="card"
          className="group-hover:scale-105 transition-transform duration-700"
          onError={handlePhotoError}
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
        {photoCount > 0 && (
          <div className="absolute top-3 right-3 flex gap-1.5 z-10">
            <span className="flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              {photoCount}
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
          <span>{formatBathrooms(listing.bathroomsFull, listing.bathroomsHalf)} Bath</span>
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
        {isRental && (
          <FareActFeeBadge
            moveInCosts={listing.moveInCosts}
            tenantPaysDescription={listing.tenantPaysDescription}
            className="mt-1"
          />
        )}
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median */}
        <p className="text-sm text-brand-dark/80 mt-2">
          RLS · Listing Courtesy of {listing.listOfficeName || 'listing broker'}
        </p>
        {formatCoListedBadge(listing) && (
          // PR-FE.2 Option C — co-listed siblings badge. See
          // formatCoListedBadge at the top of this file for the text
          // rules. Rendered as a small pill below the REBNY attribution
          // so the primary "Listing Courtesy of {brokerage}" text stays
          // dominant (UCBA Art. III §2(C) compliance preserved). The
          // span is inline-block + gold accent so it visually reads
          // as supplementary info, not as another listing's
          // attribution.
          <p className="mt-1.5">
            <span className="inline-block text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold-deep ring-1 ring-brand-gold/30">
              {formatCoListedBadge(listing)}
            </span>
          </p>
        )}
      </div>
    </Link>
  );
}

/** List card — horizontal layout */
export function ListCard({ listing, isRental, isHighlighted, onHover }: CardProps) {
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());
  const heroSrc = getHeroPhoto(listing.media, failedPhotoUrls);
  const handlePhotoError = useCallback(() => {
    if (heroSrc === LISTING_PLACEHOLDER_IMAGE) return;
    setFailedPhotoUrls(prev => new Set(prev).add(heroSrc));
  }, [heroSrc]);

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
          src={heroSrc}
          alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
          aspect="card"
          className="group-hover:scale-105 transition-transform duration-700"
          onError={handlePhotoError}
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
              <span>{formatBathrooms(listing.bathroomsFull, listing.bathroomsHalf)} Bath</span>
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
        {isRental && (
          <FareActFeeBadge
            moveInCosts={listing.moveInCosts}
            tenantPaysDescription={listing.tenantPaysDescription}
            className="mt-1"
          />
        )}
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median */}
        <p className="text-sm text-brand-dark/80 mt-2">
          RLS · Listing Courtesy of {listing.listOfficeName || 'listing broker'}
        </p>
        {formatCoListedBadge(listing) && (
          // PR-FE.2 Option C — co-listed siblings badge. See
          // formatCoListedBadge at the top of this file for the text
          // rules. Rendered as a small pill below the REBNY attribution
          // so the primary "Listing Courtesy of {brokerage}" text stays
          // dominant (UCBA Art. III §2(C) compliance preserved). The
          // span is inline-block + gold accent so it visually reads
          // as supplementary info, not as another listing's
          // attribution.
          <p className="mt-1.5">
            <span className="inline-block text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold-deep ring-1 ring-brand-gold/30">
              {formatCoListedBadge(listing)}
            </span>
          </p>
        )}
      </div>
    </Link>
  );
}

/** Split-view card — compact card for 2-col grid with photo carousel + touch swipe */
export function SplitCard({ listing, isRental, isHighlighted, onHover }: CardProps) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());
  const photos = getValidPhotoMedia(listing.media).filter((m) => !failedPhotoUrls.has(String(m.url)));
  const safePhotoIdx = photos.length > 0 ? Math.min(photoIdx, photos.length - 1) : 0;
  const currentSrc = photos[safePhotoIdx]?.url || LISTING_PLACEHOLDER_IMAGE;
  const hasMultiple = photos.length > 1;

  const goPrev = useCallback(() => setPhotoIdx(i => (photos.length > 0 && i > 0 ? i - 1 : Math.max(photos.length - 1, 0))), [photos.length]);
  const goNext = useCallback(() => setPhotoIdx(i => (photos.length > 0 && i < photos.length - 1 ? i + 1 : 0)), [photos.length]);
  const swipe = useSwipe(goNext, goPrev);
  const handlePhotoError = useCallback(() => {
    if (currentSrc === LISTING_PLACEHOLDER_IMAGE) return;
    setFailedPhotoUrls(prev => new Set(prev).add(currentSrc));
    setPhotoIdx(0);
  }, [currentSrc]);

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
            src={currentSrc}
            alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
            aspect="wide"
            className={`transition-transform duration-500 ${hovered ? 'scale-105' : ''}`}
            onError={handlePhotoError}
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
            {safePhotoIdx + 1}/{photos.length}
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
              <svg className="w-3 h-3 text-brand-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={next}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white z-20"
              aria-label="Next photo"
            >
              <svg className="w-3 h-3 text-brand-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </>
        )}
        {/* Dot indicators */}
        {hasMultiple && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-10">
            {photos.slice(0, 5).map((_, i) => (
              <span key={i} className={`w-1 h-1 rounded-full transition-colors ${i === safePhotoIdx ? 'bg-white' : 'bg-white/40'}`} />
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
          <span>{formatBathrooms(listing.bathroomsFull, listing.bathroomsHalf)} Bath</span>
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
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median */}
        <p className="text-sm text-brand-dark/80 mt-2">
          RLS · Listing Courtesy of {listing.listOfficeName || 'listing broker'}
        </p>
        {formatCoListedBadge(listing) && (
          // PR-FE.2 Option C — co-listed siblings badge. See
          // formatCoListedBadge at the top of this file for the text
          // rules. Rendered as a small pill below the REBNY attribution
          // so the primary "Listing Courtesy of {brokerage}" text stays
          // dominant (UCBA Art. III §2(C) compliance preserved). The
          // span is inline-block + gold accent so it visually reads
          // as supplementary info, not as another listing's
          // attribution.
          <p className="mt-1.5">
            <span className="inline-block text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold-deep ring-1 ring-brand-gold/30">
              {formatCoListedBadge(listing)}
            </span>
          </p>
        )}
      </Link>
    </div>
  );
}
