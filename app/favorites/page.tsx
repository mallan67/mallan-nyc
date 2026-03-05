'use client';

import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Link from 'next/link';
import { useFavorites, type FavoriteEntry } from '@/lib/hooks/useFavorites';

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  return `$${(price / 1_000).toFixed(0)}K`;
}

function RemoveButton({ fav }: { fav: FavoriteEntry }) {
  const { toggleFavorite } = useFavorites();
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(fav);
      }}
      className="p-2 rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-all"
      aria-label="Remove from favorites"
      title="Remove from favorites"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={0}>
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    </button>
  );
}

export default function FavoritesPage() {
  const { favorites, clearAll, loaded } = useFavorites();

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-display font-semibold">Saved Properties</h1>
              <p className="text-brand-dark/50 text-sm mt-1">
                {loaded ? `${favorites.length} saved listing${favorites.length !== 1 ? 's' : ''}` : 'Loading...'}
              </p>
            </div>
            {favorites.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Remove all saved properties?')) clearAll();
                }}
                className="text-sm text-red-500 hover:text-red-600 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {!loaded ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-28" />
              ))}
            </div>
          ) : favorites.length === 0 ? (
            <div className="text-center py-20">
              <svg className="w-16 h-16 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
              <h2 className="text-lg font-medium text-brand-dark/40 mb-2">No saved properties yet</h2>
              <p className="text-brand-dark/30 text-sm mb-6">
                Click the heart icon on any listing to save it here.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/buy" className="px-5 py-2.5 bg-brand-dark text-white rounded-2xl text-sm font-medium hover:bg-brand-dark/90 transition-colors">
                  Browse Sales
                </Link>
                <Link href="/rent" className="px-5 py-2.5 ring-1 ring-black/10 text-brand-dark rounded-2xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Browse Rentals
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden group hover:shadow-md transition-shadow"
                >
                  {/* Photo */}
                  <div className="relative aspect-[4/3] bg-gray-100">
                    {fav.photoUrl ? (
                      <img
                        src={fav.photoUrl}
                        alt={fav.address}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-brand-dark/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <RemoveButton fav={fav} />
                    </div>
                    <div className="absolute bottom-2 left-2">
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                        fav.listingType === 'rent'
                          ? 'bg-purple-600/90 text-white'
                          : 'bg-blue-600/90 text-white'
                      }`}>
                        {fav.listingType === 'rent' ? 'Rental' : 'Sale'}
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <Link
                    href={`/listing/${fav.slug}?key=${encodeURIComponent(fav.id)}`}
                    className="block p-4"
                  >
                    <p className="font-semibold text-lg">
                      {formatPrice(fav.price, fav.listingType === 'rent')}
                    </p>
                    <p className="text-brand-dark/60 text-sm mt-1 truncate">
                      {fav.address}
                    </p>
                    <p className="text-brand-dark/40 text-xs mt-1">
                      {fav.beds} bed &middot; {fav.baths} bath
                    </p>
                    {fav.savedAt && (
                      <p className="text-brand-dark/30 text-[10px] mt-2">
                        Saved {new Date(fav.savedAt).toLocaleDateString()}
                      </p>
                    )}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
