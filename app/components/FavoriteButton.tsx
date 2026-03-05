'use client';

import { useFavorites, type FavoriteEntry } from '@/lib/hooks/useFavorites';
import type { DisplayListing } from '@/lib/idx/display-adapter';

interface FavoriteButtonProps {
  listing: DisplayListing;
  size?: 'sm' | 'md';
  className?: string;
}

export default function FavoriteButton({ listing, size = 'sm', className = '' }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite, loaded } = useFavorites();

  if (!loaded) return null;

  const active = isFavorite(listing.id);
  const entry: FavoriteEntry = {
    id: listing.id,
    slug: listing.slug,
    address: listing.address.streetName === 'Address Undisclosed'
      ? 'Address Undisclosed'
      : `${listing.address.streetNumber} ${listing.address.streetName}`,
    price: listing.listPrice,
    listingType: listing.listingType,
    beds: listing.bedroomsTotal,
    baths: listing.bathroomsFull,
    photoUrl: listing.media[0]?.url,
    savedAt: '',
  };

  const iconSize = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  const padding = size === 'md' ? 'p-2.5' : 'p-2';

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(entry);
      }}
      className={`${padding} rounded-full transition-all ${
        active
          ? 'bg-red-50 text-red-500 hover:bg-red-100'
          : 'bg-black/40 backdrop-blur-sm text-white hover:bg-black/60'
      } ${className}`}
      aria-label={active ? 'Remove from favorites' : 'Save to favorites'}
      title={active ? 'Remove from favorites' : 'Save to favorites'}
    >
      <svg
        className={iconSize}
        viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={active ? 0 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
        />
      </svg>
    </button>
  );
}
