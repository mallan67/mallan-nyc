'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

type SearchTab = 'buy' | 'rent';

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
  heroTagline: 'New York Real Estate, Reimagined.',
};

// Static suggestions — will be replaced with /api/search/suggest once backend search is complete
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
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

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
      .catch(() => {});
  }, []);

  // GSAP entrance animation
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    (async () => {
      const { gsap } = await import('gsap');
      gsap.from('[data-hero-h]', { y: 60, opacity: 0, duration: 1.2, delay: 0.1, ease: 'back.out(1.2)' });
      gsap.from('[data-hero-p]', { y: 40, opacity: 0, duration: 1.2, delay: 0.25, ease: 'back.out(1.2)' });
      gsap.from('[data-hero-search]', { y: 50, opacity: 0, duration: 1.2, delay: 0.4, ease: 'back.out(1.2)' });
      gsap.from('[data-hero-stats]', { y: 30, opacity: 0, duration: 1.0, delay: 0.6, ease: 'back.out(1.2)' });
    })();
  }, []);

  // Filter suggestions client-side
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    const filtered = MOCK_SUGGESTIONS.filter(s =>
      s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.value.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 8);
    setSuggestions(filtered);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(query);
    }, 150);
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

  const handleSearch = () => {
    const params = new URLSearchParams();
    params.set('type', activeTab);
    if (query) params.set('q', query);
    router.push(`/search?${params.toString()}`);
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.label);
    setShowSuggestions(false);
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
    <section ref={heroRef} className="relative w-full h-screen min-h-[640px] overflow-hidden">
      {/* Hero Background */}
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
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="hero-gradient absolute inset-0" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 text-center">
        {/* Headline */}
        <h1
          data-hero-h
          className="font-display font-bold text-white text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] xl:text-7xl tracking-tight leading-[1.02] mb-5 max-w-5xl"
          style={{ textShadow: '0 4px 40px rgba(0,0,0,0.15)' }}
        >
          New York Real Estate,<br />Reimagined.
        </h1>

        {/* Subtitle */}
        <p
          data-hero-p
          className="text-white/70 text-sm md:text-base font-light max-w-lg mb-12 tracking-wide"
        >
          Full-service brokerage for buyers, sellers, and renters across all five boroughs.
        </p>

        {/* Search — Glass pill */}
        <div data-hero-search className="w-full max-w-2xl relative">
          {/* Tabs */}
          <div className="flex items-center justify-center gap-2 mb-5">
            {(['buy', 'rent'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`search-tab text-sm font-medium px-6 py-2.5 rounded-full capitalize ${
                  activeTab === tab
                    ? 'active'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search Bar — White pill */}
          <div
            className="flex items-center bg-white/90 backdrop-blur-xl rounded-2xl md:rounded-full"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.2)' }}
          >
            <svg className="ml-4 md:ml-6 w-5 h-5 text-brand-dark/25 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
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
              placeholder="Search by neighborhood, address, or building..."
              className="flex-1 min-w-0 px-3 md:px-4 py-3 md:py-6 text-sm md:text-base text-brand-dark bg-transparent outline-none placeholder:text-brand-dark/50 font-light tracking-wide"
              autoComplete="off"
              role="combobox"
              aria-expanded={showSuggestions && suggestions.length > 0}
              aria-controls="hero-search-listbox"
              aria-activedescendant={selectedIndex >= 0 ? `hero-suggestion-${selectedIndex}` : undefined}
              aria-autocomplete="list"
              aria-haspopup="listbox"
            />
            <button
              onClick={handleSearch}
              data-analytics-cta="hero_search"
              className="btn-liquid bg-brand-dark hover:bg-brand-gold-deep text-white text-sm font-medium px-5 md:px-10 py-3 md:py-6 rounded-xl md:rounded-full m-1 md:m-1.5 flex-shrink-0 transition-colors"
            >
              Search
            </button>
          </div>

          {/* Typeahead Suggestions */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              id="hero-search-listbox"
              role="listbox"
              aria-label="Search suggestions"
              className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden z-50"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.value}`}
                  id={`hero-suggestion-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={`w-full px-5 py-3.5 flex items-center gap-3 text-left transition-colors ${
                    index === selectedIndex
                      ? 'bg-black/[0.04]'
                      : 'hover:bg-black/[0.02]'
                  }`}
                >
                  <span className="text-brand-dark/50">
                    {getTypeIcon(suggestion.type)}
                  </span>
                  <span className="flex-1 text-brand-dark font-light text-sm">
                    {suggestion.label}
                  </span>
                  <span className="text-[11px] text-brand-dark/50 capitalize font-light">
                    {suggestion.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats — floating */}
        <div data-hero-stats className="flex items-center gap-8 md:gap-12 mt-14">
          <div className="text-center">
            <p className="font-display font-bold text-white text-2xl md:text-3xl" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.1)' }}>5</p>
            <p className="text-white/60 text-[11px] font-light tracking-wider mt-1">Boroughs</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <p className="font-display font-bold text-white text-2xl md:text-3xl" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.1)' }}>59</p>
            <p className="text-white/60 text-[11px] font-light tracking-wider mt-1">Neighborhoods</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <p className="font-display font-bold text-white text-2xl md:text-3xl" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.1)' }}>5.0</p>
            <p className="text-white/60 text-[11px] font-light tracking-wider mt-1">Zillow Rating</p>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div className="w-6 h-10 border border-white/20 rounded-full flex justify-center pt-2.5">
          <div className="w-1 h-2 bg-white/50 rounded-full animate-bounce" />
        </div>
      </div>
    </section>
  );
}
