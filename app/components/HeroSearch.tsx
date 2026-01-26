'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

type SearchTab = 'buy' | 'rent' | 'sell' | 'commercial';

type HeroSettings = {
  heroImage: string;
  heroTagline: string;
};

type SearchSuggestion = {
  type: 'address' | 'neighborhood' | 'zip' | 'agent';
  label: string;
  value: string;
};

const DEFAULT_HERO: HeroSettings = {
  heroImage: '/images/hero.jpg',
  heroTagline: 'One Search. Every Space. Homes. Businesses. Investments.',
};

const AMENITY_PILLS = [
  { id: 'doorman', label: 'Doorman' },
  { id: 'health-club', label: 'Health Club' },
  { id: 'pets', label: 'Pets' },
  { id: 'pool', label: 'Pool' },
  { id: 'roof-deck', label: 'Roof Deck' },
];

/*
  STYLE CONSTANTS - Glass Design System

  Amenity chips: ultra-light floating pills, no heavy box
  - Desktop: single row, generous spacing
  - Mobile: 44px touch targets via padding, not min-height
*/
const CHIP_BASE = 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-150';
const CHIP_UNSELECTED = 'text-white/80 hover:text-white bg-transparent hover:bg-white/10';
const CHIP_SELECTED = 'bg-white/20 backdrop-blur-sm text-white border border-white/30';

/*
  Tab classes - unified glass style
*/
const TAB_BASE = 'px-4 sm:px-5 py-2 sm:py-2.5 text-sm sm:text-base font-medium capitalize transition-all duration-150';
const TAB_INACTIVE = 'text-white/70 hover:text-white/90 bg-transparent hover:bg-white/5';
const TAB_ACTIVE = 'text-white bg-white/15 backdrop-blur-sm';

// Mock suggestions for typeahead - TODO: Replace with real API call
const MOCK_SUGGESTIONS: SearchSuggestion[] = [
  { type: 'neighborhood', label: 'Upper East Side', value: 'upper-east-side' },
  { type: 'neighborhood', label: 'Upper West Side', value: 'upper-west-side' },
  { type: 'neighborhood', label: 'Tribeca', value: 'tribeca' },
  { type: 'neighborhood', label: 'SoHo', value: 'soho' },
  { type: 'neighborhood', label: 'Chelsea', value: 'chelsea' },
  { type: 'neighborhood', label: 'Midtown', value: 'midtown' },
  { type: 'neighborhood', label: 'Financial District', value: 'fidi' },
  { type: 'neighborhood', label: 'Greenwich Village', value: 'greenwich-village' },
  { type: 'zip', label: '10001 - Chelsea', value: '10001' },
  { type: 'zip', label: '10002 - Lower East Side', value: '10002' },
  { type: 'zip', label: '10003 - East Village', value: '10003' },
  { type: 'zip', label: '10010 - Gramercy', value: '10010' },
  { type: 'zip', label: '10021 - Upper East Side', value: '10021' },
  { type: 'zip', label: '10024 - Upper West Side', value: '10024' },
  { type: 'address', label: '432 Park Avenue, New York, NY', value: '432-park-avenue' },
  { type: 'address', label: '15 Central Park West, New York, NY', value: '15-central-park-west' },
  { type: 'address', label: '56 Leonard Street, New York, NY', value: '56-leonard-street' },
  { type: 'agent', label: 'Maya Allan', value: 'maya-allan' },
];

export default function HeroSearch() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SearchTab>('buy');
  const [query, setQuery] = useState('');
  const [heroSettings, setHeroSettings] = useState<HeroSettings>(DEFAULT_HERO);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedAmenities, setSelectedAmenities] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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

  // Fetch suggestions based on query
  // TODO: Replace with real API call to /api/search/suggest
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    // Simulate async fetch with mock data
    // TODO: Replace with actual API call:
    // const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(searchQuery)}`);
    // const data = await res.json();
    // setSuggestions(data.suggestions);

    const filtered = MOCK_SUGGESTIONS.filter(s =>
      s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.value.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 8);

    setSuggestions(filtered);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(query);
    }, 150); // Debounce
    return () => clearTimeout(timer);
  }, [query, fetchSuggestions]);

  // Click outside to close suggestions
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAmenityToggle = (amenityId: string) => {
    setSelectedAmenities(prev => {
      const next = new Set(prev);
      if (next.has(amenityId)) {
        next.delete(amenityId);
      } else {
        next.add(amenityId);
      }
      return next;
    });
  };

  const handleAmenitySearch = () => {
    if (selectedAmenities.size === 0) return;
    const basePath = activeTab === 'sell' ? '/sell' : `/${activeTab}`;
    const amenityParams = Array.from(selectedAmenities).join(',');
    router.push(`${basePath}?amenities=${amenityParams}`);
  };

  const handleSearch = () => {
    const params = new URLSearchParams();
    params.set('type', activeTab);
    if (query) params.set('q', query);
    router.push(`/search?${params.toString()}`);
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.label);
    setShowSuggestions(false);
    // Navigate based on suggestion type
    const params = new URLSearchParams();
    params.set('type', activeTab);
    params.set(suggestion.type, suggestion.value);
    router.push(`/search?${params.toString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') handleSearch();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else {
          handleSearch();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const getTypeIcon = (type: SearchSuggestion['type']) => {
    switch (type) {
      case 'neighborhood':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'zip':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case 'address':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        );
      case 'agent':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
    }
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
        {/* Gradient overlay for text readability - stronger on mobile */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/35 to-black/10" />
      </div>

      {/* Search Module */}
      <div className="relative z-10 h-full flex items-center justify-center px-4">
        <div className="w-full max-w-2xl">
          {/*
            TAGLINE - Two lines, identical sizing

            Why lines appeared different before:
            - Using <h1> vs <p> tags (different browser defaults)
            - Different classes per line
            - Inconsistent font-weight

            Fix: Same exact classes on both, use drop-shadow for readability
          */}
          <div className="text-center mb-4 sm:mb-5">
            <p className="text-sm sm:text-base md:text-lg font-medium text-white/95 leading-snug tracking-wide drop-shadow-sm">
              One Search. Every Space.
            </p>
            <p className="text-sm sm:text-base md:text-lg font-medium text-white/95 leading-snug tracking-wide drop-shadow-sm mt-0.5">
              Homes. Businesses. Investments.
            </p>
          </div>

          {/*
            SEARCH TABS + BAR - Unified Glass Style

            Classes Reference:
            - Tabs container: inline-flex, no bg (transparent)
            - Tab inactive: TAB_INACTIVE - text-white/70, transparent bg
            - Tab active: TAB_ACTIVE - bg-white/15 backdrop-blur
            - Search bar: bg-white/10 backdrop-blur-md, subtle border
          */}

          {/* Tabs - inline, no container background */}
          <div className="inline-flex rounded-t-lg overflow-hidden">
            {(['buy', 'rent', 'sell', 'commercial'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`${TAB_BASE} ${activeTab === tab ? TAB_ACTIVE : TAB_INACTIVE}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Bar - Glass Container */}
          <div className="relative">
            <div className="bg-white/10 backdrop-blur-md rounded-b-lg rounded-tr-lg border border-white/15">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShowSuggestions(true);
                    setSelectedIndex(-1);
                  }}
                  onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Address, Zip, Neighborhood, Agent..."
                  className="flex-1 px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg text-white bg-transparent outline-none placeholder:text-white/40"
                  autoComplete="off"
                />
                <button
                  onClick={handleSearch}
                  data-analytics-cta="hero_search"
                  className="m-2 px-6 sm:px-8 py-2.5 sm:py-3 bg-white/90 text-gray-900 font-semibold rounded hover:bg-white transition-colors text-sm sm:text-base"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Typeahead Suggestions Dropdown - premium white panel */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-2xl ring-1 ring-black/5 overflow-hidden z-50"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.type}-${suggestion.value}`}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-gray-100'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-gray-400">
                      {getTypeIcon(suggestion.type)}
                    </span>
                    <span className="flex-1 text-gray-800">
                      {suggestion.label}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">
                      {suggestion.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/*
            AMENITIES - Floating pills, no background container

            Desktop: single row with gap-3
            Mobile: wrap into 2-3 per row with gap-2
            No heavy box, just text chips floating on hero
          */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-4 sm:mt-5">
            {AMENITY_PILLS.map((amenity) => {
              const isSelected = selectedAmenities.has(amenity.id);
              return (
                <button
                  key={amenity.id}
                  onClick={() => handleAmenityToggle(amenity.id)}
                  aria-pressed={isSelected}
                  className={`${CHIP_BASE} ${isSelected ? CHIP_SELECTED : CHIP_UNSELECTED}`}
                >
                  {amenity.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
