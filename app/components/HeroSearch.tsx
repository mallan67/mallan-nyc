'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { parseNaturalLanguageSearch } from '@/lib/search/natural-language-parser';

type SearchTab = 'buy' | 'rent';

type HeroSettings = {
  heroImage: string;
  heroTagline: string;
};

type SearchSuggestion = {
  type: 'address' | 'neighborhood' | 'zip' | 'agent' | 'listing';
  label: string;
  sublabel: string;
  value: string;
};

const DEFAULT_HERO: HeroSettings = {
  heroImage: '/images/hero.jpg',
  heroTagline: 'New York Real Estate, Reimagined.',
};

// Default suggestions shown before user types
const DEFAULT_SUGGESTIONS: SearchSuggestion[] = [
  { type: 'neighborhood', label: 'Upper East Side', sublabel: 'Manhattan', value: 'upper-east-side' },
  { type: 'neighborhood', label: 'Upper West Side', sublabel: 'Manhattan', value: 'upper-west-side' },
  { type: 'neighborhood', label: 'Tribeca', sublabel: 'Manhattan', value: 'tribeca' },
  { type: 'neighborhood', label: 'Chelsea', sublabel: 'Manhattan', value: 'chelsea' },
  { type: 'neighborhood', label: 'Williamsburg', sublabel: 'Brooklyn', value: 'williamsburg' },
];

// Example queries shown as placeholder hints (rotate)
const EXAMPLE_QUERIES = [
  '2 bed midtown, pets, doorman',
  'studio under $500K in Chelsea',
  '3 bed condo UES with views',
  'rent 1 bed Williamsburg no fee',
  'pre-war co-op Upper West Side',
  'loft in Tribeca under $3M',
];

export default function HeroSearch() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SearchTab>('buy');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Reset search state when navigating back to homepage
  useEffect(() => {
    setQuery('');
    setIsSearching(false);
  }, []);
  const [heroSettings, setHeroSettings] = useState<HeroSettings>(DEFAULT_HERO);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
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

  // Rotate placeholder examples
  useEffect(() => {
    if (query) return; // Don't rotate while user is typing
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_QUERIES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [query]);

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

  const abortRef = useRef<AbortController | null>(null);

  // Fetch suggestions from API (debounced)
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/listings/suggest?q=${encodeURIComponent(searchQuery)}`,
        { signal: controller.signal }
      );
      const data = await res.json();
      if (data.success && data.suggestions?.length > 0) {
        setSuggestions(data.suggestions);
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, fetchSuggestions]);

  // Cleanup abort controller
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

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

  // Build URL params from parsed filters (shared by AI and regex paths)
  const buildSearchUrl = useCallback((filters: Record<string, unknown>) => {
    const params = new URLSearchParams();
    const tab = (filters.tab as string) || (activeTab === 'rent' ? 'rent-residential' : 'buy-residential');
    params.set('tab', tab);
    if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));
    if (filters.beds != null) params.set('beds', String(filters.beds));
    if (filters.baths != null) params.set('baths', String(filters.baths));
    if (filters.propertySubTypes && (filters.propertySubTypes as string[]).length) {
      params.set('subTypes', (filters.propertySubTypes as string[]).join(','));
    }
    if (filters.yearBuilt && filters.yearBuilt !== 'any') params.set('yearBuilt', String(filters.yearBuilt));
    if (filters.furnished) params.set('furnished', 'true');
    if (filters.amenities && (filters.amenities as string[]).length) {
      params.set('amenities', (filters.amenities as string[]).join(','));
    }
    if (filters.openHouse) params.set('openHouse', 'true');
    if (filters.minSqft) params.set('minSqft', String(filters.minSqft));
    if (filters.neighborhood) params.set('neighborhood', String(filters.neighborhood));
    if (filters.borough) params.set('borough', String(filters.borough));
    if (filters.q) params.set('q', String(filters.q));
    if (filters.remainingQuery) params.set('q', String(filters.remainingQuery));
    return `/search?${params.toString()}`;
  }, [activeTab]);

  // Regex fallback — instant, no API call
  const regexParse = useCallback((q: string) => {
    const parsed = parseNaturalLanguageSearch(q);
    return {
      tab: parsed.tab,
      ...parsed.filters,
      neighborhood: parsed.neighborhood,
      borough: parsed.borough,
      remainingQuery: parsed.remainingQuery,
    };
  }, []);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) {
      router.push(`/search?type=${activeTab}`);
      return;
    }

    // Simple queries (just a neighborhood name, zip, or short text) — skip AI
    const isSimple = /^\d{5}$/.test(q) || q.length < 4;
    if (isSimple) {
      const params = new URLSearchParams();
      params.set('type', activeTab);
      params.set('q', q);
      router.push(`/search?${params.toString()}`);
      return;
    }

    // Try AI parsing first, fall back to regex
    setIsSearching(true);
    try {
      const res = await fetch('/api/search/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: AbortSignal.timeout(3000), // 3s max — if AI is slow, use regex
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.filters) {
          // AI parsed successfully — add the active tab context if AI didn't detect intent
          if (!data.filters.tab) {
            data.filters.tab = activeTab === 'rent' ? 'rent-residential' : 'buy-residential';
          }
          router.push(buildSearchUrl(data.filters));
          setIsSearching(false);
          return;
        }
      }
    } catch {
      // AI failed or timed out — fall through to regex
    }

    // Regex fallback (instant)
    const nlSignals = /(\$|under|over|below|above|budget|\d+\s*(br|bed|bath)|studio|condo|co-?op|townhouse|loft|pre-?war|doorman|elevator|pets?|laundry|gym|furnished|pool|parking|no\s*fee|renovated|quiet|sunny|bright|views?|fireplace|balcony|terrace|roof|washer|dryer|w\/d|dishwasher|dogs?|cats?|high\s*ceil)/i;
    if (nlSignals.test(q)) {
      router.push(buildSearchUrl(regexParse(q)));
      setIsSearching(false);
      return;
    }

    // Standard search
    const params = new URLSearchParams();
    params.set('type', activeTab);
    params.set('q', q);
    router.push(`/search?${params.toString()}`);
    setIsSearching(false);
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.label);
    setShowSuggestions(false);

    if (suggestion.type === 'agent') {
      // Navigate to agent profile page
      router.push(`/agents/${suggestion.value}`);
      return;
    }

    if (suggestion.type === 'listing') {
      // Navigate to listing detail page
      router.push(`/listing/${suggestion.value}`);
      return;
    }

    const params = new URLSearchParams();
    params.set('type', activeTab);
    if (suggestion.type === 'neighborhood') {
      params.set('neighborhood', suggestion.value);
    } else if (suggestion.type === 'zip') {
      params.set('zip', suggestion.value);
    } else if (suggestion.type === 'address') {
      params.set('q', suggestion.value);
    }
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
      case 'listing':
        return (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
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
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 pt-20 text-center">
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
            <svg className="ml-4 md:ml-6 w-5 h-5 text-brand-dark/65 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
              onFocus={() => {
                if (query.length >= 2) {
                  setShowSuggestions(true);
                } else if (query.length === 0) {
                  setSuggestions(DEFAULT_SUGGESTIONS);
                  setShowSuggestions(true);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Try "${EXAMPLE_QUERIES[placeholderIndex]}" or an address, zip, neighborhood...`}
              className="flex-1 min-w-0 px-3 md:px-4 py-3 md:py-6 text-sm md:text-base text-brand-dark bg-transparent outline-none placeholder:text-brand-dark/85 font-light tracking-wide"
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
              disabled={isSearching}
              data-analytics-cta="hero_search"
              className="btn-liquid bg-brand-dark hover:bg-brand-gold-deep text-white text-sm font-medium px-5 md:px-10 py-3 md:py-6 rounded-xl md:rounded-full m-1 md:m-1.5 flex-shrink-0 transition-colors disabled:opacity-70"
            >
              {isSearching ? 'Searching...' : 'Search'}
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
                  <span className="text-brand-dark/85">
                    {getTypeIcon(suggestion.type)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-brand-dark font-light text-sm truncate">
                      {suggestion.label}
                    </span>
                    {suggestion.sublabel && (
                      <span className="block text-[11px] text-brand-dark/50 font-light truncate">
                        {suggestion.sublabel}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-brand-dark/40 capitalize font-light flex-shrink-0">
                    {suggestion.type === 'listing' ? 'listing #' : suggestion.type}
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
