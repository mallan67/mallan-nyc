'use client';

import { useFavorites, type FavoriteEntry } from '@/lib/hooks/useFavorites';

interface DetailFavoriteButtonProps {
  id: string;
  slug: string;
  address: string;
  price: number;
  listingType: 'sale' | 'rent';
  beds: number;
  baths: number;
  photoUrl?: string;
}

export default function DetailFavoriteButton(props: DetailFavoriteButtonProps) {
  const { isFavorite, toggleFavorite, loaded } = useFavorites();

  if (!loaded) return null;

  const active = isFavorite(props.id);
  const entry: FavoriteEntry = { ...props, savedAt: '' };

  return (
    <button
      onClick={() => toggleFavorite(entry)}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-2xl ring-1 transition-colors ${
        active
          ? 'bg-red-50 text-red-600 ring-red-200 hover:bg-red-100'
          : 'bg-white text-brand-dark/95 ring-black/10 hover:bg-gray-50'
      }`}
      aria-label={active ? 'Remove from favorites' : 'Save to favorites'}
    >
      <svg
        className="w-4 h-4"
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
      {active ? 'Saved' : 'Save'}
    </button>
  );
}
