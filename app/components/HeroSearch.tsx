'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

type SearchTab = 'buy' | 'rent' | 'sell';

type HeroSettings = {
  heroImage: string;
  heroTagline: string;
};

const DEFAULT_HERO: HeroSettings = {
  heroImage: '/images/hero.jpg',
  heroTagline: 'One Search. Every Space. Home. Business.',
};

const AMENITY_PILLS = [
  { id: 'doorman', label: 'Doorman' },
  { id: 'health-club', label: 'Health Club' },
  { id: 'pets', label: 'Pets Allowed' },
  { id: 'pool', label: 'Pool' },
  { id: 'roof-deck', label: 'Roof Deck' },
];

export default function HeroSearch() {
  const [activeTab, setActiveTab] = useState<SearchTab>('buy');
  const [query, setQuery] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [heroSettings, setHeroSettings] = useState<HeroSettings>(DEFAULT_HERO);

  useEffect(() => {
    fetch('/api/settings/company')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.heroImage) {
          setHeroSettings({
            heroImage: data.heroImage || DEFAULT_HERO.heroImage,
            heroTagline: data.heroTagline || DEFAULT_HERO.heroTagline,
          });
        }
      })
      .catch(() => {
        // Keep defaults on error
      });
  }, []);

  const toggleAmenity = (id: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSearch = () => {
    // Build search URL with params
    const params = new URLSearchParams();
    params.set('type', activeTab);
    if (query) params.set('q', query);
    if (selectedAmenities.length > 0) params.set('amenities', selectedAmenities.join(','));

    // Navigate to search page (stub for now)
    window.location.href = `/search?${params.toString()}`;
  };

  return (
    <section className="relative w-full h-[60vh] sm:h-[70vh] md:h-[80vh] min-h-[500px] md:min-h-[600px]">
      {/* Hero Background - uses uploaded image or gradient fallback */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500">
        <Image
          src={heroSettings.heroImage}
          alt="Luxury New York City apartment with skyline view"
          fill
          className="object-cover object-center"
          style={{ objectPosition: 'center 85%' }}
          priority
          sizes="100vw"
          quality={100}
          unoptimized
          onError={(e) => {
            // Hide broken image, show gradient fallback
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* Minimal overlay for text readability */}
        <div className="absolute inset-0 bg-black/5" />
      </div>

      {/* Search Module */}
      <div className="relative z-10 h-full flex items-center justify-center px-4">
        <div className="w-full max-w-2xl">
          {/* Tagline */}
          <h1 className="text-center text-white text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold font-serif tracking-wide mb-6 sm:mb-8 drop-shadow-lg" style={{ fontWeight: 500 }}>
            {heroSettings.heroTagline}
          </h1>

          {/* Tabs */}
          <div className="inline-flex bg-brand-dark/90 rounded-t-lg overflow-hidden">
            {(['buy', 'rent', 'sell'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 sm:px-6 md:px-8 py-2 sm:py-3 text-xs sm:text-sm font-serif capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-brand-dark'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="bg-white/95 backdrop-blur-sm rounded-b-lg rounded-tr-lg shadow-xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Address, Neighborhood, Development, Agent..."
                className="flex-1 px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg font-serif bg-transparent outline-none placeholder:text-gray-400"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                className="m-2 px-6 sm:px-8 py-2 sm:py-3 bg-brand-dark text-white font-serif rounded hover:bg-black transition-colors text-sm sm:text-base"
              >
                Search
              </button>
            </div>
          </div>

          {/* Amenity Pills */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-4 sm:mt-6">
            {AMENITY_PILLS.map((amenity) => (
              <button
                key={amenity.id}
                onClick={() => toggleAmenity(amenity.id)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-serif transition-all ${
                  selectedAmenities.includes(amenity.id)
                    ? 'bg-white text-brand-dark shadow-lg'
                    : 'bg-white/80 text-gray-700 hover:bg-white hover:shadow-md'
                }`}
              >
                {amenity.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
