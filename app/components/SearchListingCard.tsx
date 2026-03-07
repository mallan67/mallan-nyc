'use client';

import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import FavoriteButton from '@/app/components/FavoriteButton';
import { type DisplayListing, listingHref } from '@/lib/idx/display-adapter';

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
  return 'Coming Soon';
}

interface CardProps {
  listing: DisplayListing;
  isRental: boolean;
  isHighlighted?: boolean;
  onHover?: (id: string | null) => void;
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
          src={listing.media[0]?.url || '/images/listing-placeholder.svg'}
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
      <div className="p-5">
        <p className="text-xl font-display font-semibold mb-1">
          {formatPrice(listing.listPrice, isRental)}
        </p>
        <p className="text-brand-dark">
          {listing.address.streetName === 'Address Undisclosed' ? (
            <span className="italic text-brand-dark/85">Address Undisclosed</span>
          ) : (
            <>{listing.address.streetNumber} {listing.address.streetName}{listing.address.unitNumber && `, ${listing.address.unitNumber}`}</>
          )}
        </p>
        <p className="text-brand-dark/85 text-sm">
          {listing.address.neighborhood && listing.address.neighborhood !== listing.address.borough ? `${listing.address.neighborhood}, ` : ''}{listing.address.borough}
        </p>
        <div className="flex gap-4 text-sm text-brand-dark/90 mt-3 pt-3 border-t border-black/5">
          <span>{listing.bedroomsTotal} bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
          <span>{listing.bathroomsFull}{listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`} bath</span>
          {listing.livingArea && listing.livingArea > 0 && (
            <span>{listing.livingArea.toLocaleString()} sqft</span>
          )}
        </div>
        {!isRental && listing.associationFee && (
          <p className="text-xs text-brand-dark/90 mt-2">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}
        <p className="text-[10px] text-brand-dark/85 mt-2 pt-2 border-t border-black/5">
          <span className="font-semibold tracking-wide">RLS</span>
          {' '}&middot;{' '}{listing.listOfficeName}
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
          src={listing.media[0]?.url || '/images/listing-placeholder.svg'}
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
            <p className="text-lg font-display font-semibold">
              {formatPrice(listing.listPrice, isRental)}
            </p>
            <p className="text-brand-dark truncate">
              {listing.address.streetName === 'Address Undisclosed' ? (
                <span className="italic text-brand-dark/85">Address Undisclosed</span>
              ) : (
                <>{listing.address.streetNumber} {listing.address.streetName}{listing.address.unitNumber && `, ${listing.address.unitNumber}`}</>
              )}
            </p>
            <p className="text-brand-dark/85 text-sm">
              {listing.address.neighborhood && listing.address.neighborhood !== listing.address.borough ? `${listing.address.neighborhood}, ` : ''}{listing.address.borough}
            </p>
          </div>
          {listing.propertySubType && (
            <span className="text-xs px-2 py-1 bg-gray-100 text-brand-dark/90 rounded-lg flex-shrink-0">
              {listing.propertySubType}
            </span>
          )}
        </div>
        <div className="flex gap-4 text-sm text-brand-dark/90 mt-2">
          <span>{listing.bedroomsTotal} bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
          <span>{listing.bathroomsFull}{listing.bathroomsHalf > 0 && `.${listing.bathroomsHalf}`} bath</span>
          {listing.livingArea && listing.livingArea > 0 && <span>{listing.livingArea.toLocaleString()} sqft</span>}
          {!isRental && listing.associationFee && (
            <span className="text-brand-dark/90">{listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo</span>
          )}
        </div>
        <p className="text-[10px] text-brand-dark/85 mt-2">
          <span className="font-semibold tracking-wide">RLS</span>
          {' '}&middot;{' '}{listing.listOfficeName}
          {listing.modificationTimestamp && <> &middot; {new Date(listing.modificationTimestamp).toLocaleDateString()}</>}
        </p>
      </div>
    </Link>
  );
}

/** Split-view card — horizontal layout with medium photo for the sidebar */
export function SplitCard({ listing, isRental, isHighlighted, onHover }: CardProps) {
  return (
    <Link
      href={listingHref(listing)}
      className={`glass-card rounded-2xl overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 flex group ${
        isHighlighted ? 'ring-2 ring-brand-gold shadow-lg' : ''
      }`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="relative w-[180px] flex-shrink-0">
        <IDXImage
          src={listing.media[0]?.url || '/images/listing-placeholder.svg'}
          alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
          aspect="card"
          className="group-hover:scale-105 transition-transform duration-500"
        />
        {formatComingSoonBadge(listing) && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500 text-white text-[10px] rounded-lg z-10">
            Coming Soon
          </span>
        )}
        {listing.media.length > 1 && (
          <span className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-lg">
            {listing.photosCount || listing.media.length}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-base font-display font-semibold text-brand-dark">
            {formatPrice(listing.listPrice, isRental)}
          </p>
          <FavoriteButton listing={listing} size="sm" />
        </div>
        <p className="text-sm text-brand-dark truncate mt-0.5">
          {listing.address.streetName === 'Address Undisclosed'
            ? 'Address Undisclosed'
            : `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}`}
        </p>
        {listing.address.neighborhood && (
          <p className="text-xs text-brand-dark/60 truncate">
            {listing.address.neighborhood !== listing.address.borough
              ? `${listing.address.neighborhood}, ${listing.address.borough || 'Manhattan'}`
              : listing.address.borough || 'Manhattan'}
          </p>
        )}
        <div className="flex gap-2.5 text-xs text-brand-dark/80 mt-2">
          <span>{listing.bedroomsTotal} bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
          <span className="text-brand-dark/30">·</span>
          <span>{listing.bathroomsFull}{listing.bathroomsHalf > 0 ? `.${listing.bathroomsHalf}` : ''} bath</span>
          {listing.livingArea && listing.livingArea > 0 && (
            <>
              <span className="text-brand-dark/30">·</span>
              <span>{listing.livingArea.toLocaleString()} sqft</span>
            </>
          )}
        </div>
        {!isRental && listing.associationFee && (
          <p className="text-[11px] text-brand-dark/60 mt-1">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}
        <p className="text-[9px] text-brand-dark/50 mt-1.5">
          <span className="font-semibold tracking-wide">RLS</span> · {listing.listOfficeName}
        </p>
      </div>
    </Link>
  );
}
