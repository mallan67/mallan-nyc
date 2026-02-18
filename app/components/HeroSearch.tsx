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
  heroTagline: 'Find your place in New York City.',
};

const TAB_BASE = 'px-5 py-2.5 text-sm font-semibold capitalize transition-all duration-150 tracking-wide';
const TAB_INACTIVE = 'text-white/70 hover:text-white hover:bg-white/10';
const TAB_ACTIVE = 'bg-white/20 text-white';

const MOCK_SUGGESTIONS: SearchSuggestion[] = [
  { type: 'neighborhood', label: 'Upper East Side', value: 'upper-east-side' },
  { type: 'neighborhood', label: 'Upper West Side', value: 'upper-west-side' },
  { type: 'neighborhood', label: 'Tribeca', value: 'tribeca' },
  { type: 'neighborhood', label: 'SoHo', value: 'soho' },
  { type: 'neighborhood', label: 'Chelsea', value: 'chelsea' },
  { type: 'neighborhood', label: 'Midtown', value: 'midtown' },
  { type: 'neighborhood', label: 'Financial District', value: 'fidi' },
  { type: 'neighborhood', label: 'Greenwich Village', value: 'greenwich-village' },
  { type: 'zip', label: '10001 — Chelsea', value: '10001' },
  { type: 'zip', label: '10002 — Lower East Side', value: '10002' },
  { type: 'zip', label: '10003 — East Village', value: '10003' },
  { type: 'zip', label: '10010 — Gramercy', value: '10010' },
  { type: 'zip', label: '10021 — Upper East Side', value: '10021' },
  { type: 'zip', label: '10024 — Upper West Side', value: '10024' },
  { type: 'address', label: '432 Park Avenue, New York, NY', value: '432-park-avenue' },
  { type: 'address', label: '15 Central Park West, New York, NY', value: '15-central-park-west' },
  { type: 'address', label: '56 Leonard Street, New York, NY', value: '56-leonard-street' },
  { type: 'agent', label: 'Maya Allan', value: 'maya-allan' },
];

export default function HeroSearch() {
  const router = useRouter();
  const activeTab: SearchTab = 'buy';
  const [query, setQuery] = useState('');
  const [heroSettings, setHeroSettings] = useState<HeroSettings>(DEFAULT_HERO);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/settings/company')
      .then((r) => r.json())
      .then((data) => {
        if (data?.heroImage) {
          setHeroSettings({
            heroImage: data.heroImage || DEFAULT_HERO.heroImage,
            heroTagline: data.heroTagline || DEFAULT_HERO.heroTagline,
          });
        }
      })
      .catch(() => {});
  }, []);

  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) { setSuggestions([]); return; }
    const filtered = MOCK_SUGGESTIONS.filter(s =>
      s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.value.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 8);
    setSuggestions(filtered);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(query), 150);
    return () => clearTimeout(timer);
  }, [query, fetchSuggestions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
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
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) handleSuggestionClick(suggestions[selectedIndex]);
        else handleSearch();
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
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
      case 'zip':
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
      case 'address':
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
      case 'agent':
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
    }
  };

  return (
    <section className="relative w-full min-h-screen flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 bg-gray-900">
        <Image
          src={heroSettings.heroImage}
          alt="New York City real estate"
          fill
          className="object-cover object-center"
          style={{ objectPosition: 'center 85%' }}
          priority
          sizes="100vw"
          quality={100}
          unoptimized
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {/* Layered overlay — darker at top (nav), dramatic at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/75" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-32 pb-20">

        {/* Eyebrow */}
        <p className="text-xs sm:text-sm font-semibold tracking-[0.25em] uppercase text-[#C4A052] mb-6">
          Licensed NYC Real Estate Broker
        </p>

        {/* Main headline */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-black tracking-tight text-white text-center leading-[1.1] max-w-3xl mb-5">
          {heroSettings.heroTagline}
        </h1>

        {/* Sub-headline */}
        <p className="text-base sm:text-lg md:text-xl text-white/70 text-center max-w-xl mb-10 font-normal leading-relaxed">
          Residential, rental, and commercial properties across Manhattan, Brooklyn, Queens and beyond.
        </p>

        {/* Search module */}
        <div className="w-full max-w-2xl">
          <div className="relative">
            {/* Tabs */}
            <div className="inline-flex rounded-t-xl bg-black/50 backdrop-blur-md border border-white/15 border-b-0 overflow-hidden">
              {(['buy', 'rent', 'sell', 'commercial'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab === 'commercial') router.push('/search?type=commercial');
                    else router.push(`/${tab}`);
                  }}
                  className={`${TAB_BASE} ${activeTab === tab ? TAB_ACTIVE : TAB_INACTIVE}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search bar */}
            <div className="bg-black/50 backdrop-blur-md border border-white/15 shadow-2xl rounded-b-2xl rounded-tr-2xl p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); setSelectedIndex(-1); }}
                  onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Address, neighborhood, zip code..."
                  aria-label="Search properties"
                  className="flex-1 px-5 py-4 text-base sm:text-lg text-white bg-white/20 rounded-xl border border-white/20 outline-none placeholder:text-white/50 focus:border-white/50 focus:bg-white/25 transition-all"
                  autoComplete="off"
                />
                <button
                  onClick={handleSearch}
                  data-analytics-cta="hero_search"
                  className="px-8 py-4 bg-[#C4A052] text-gray-950 font-bold rounded-xl hover:bg-[#d4b060] shadow-lg transition-all text-sm sm:text-base tracking-wide whitespace-nowrap"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl ring-1 ring-black/5 overflow-hidden z-50"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.type}-${suggestion.value}`}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${index === selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-gray-400">{getTypeIcon(suggestion.type)}</span>
                    <span className="flex-1 text-gray-800 font-medium">{suggestion.label}</span>
                    <span className="text-xs text-gray-400 capitalize">{suggestion.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Social proof strip */}
        <div className="flex items-center gap-6 sm:gap-10 mt-10 text-white/50 text-xs sm:text-sm">
          <span><span className="text-white font-semibold">5 Boroughs</span> covered</span>
          <span className="w-px h-4 bg-white/20" />
          <span><span className="text-white font-semibold">Residential</span> &amp; Commercial</span>
          <span className="w-px h-4 bg-white/20" />
          <span><span className="text-white font-semibold">REBNY</span> Licensed</span>
        </div>
      </div>

      {/* Bottom fade into next section */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
    </section>
  );
}
