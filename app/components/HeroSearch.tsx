'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const HERO_VIDEO = '/videos/nyc-hero.mp4';

export default function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tagline, setTagline] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch tagline only — don't re-render video
  useEffect(() => {
    fetch('/api/settings/company')
      .then((r) => r.json())
      .then((data) => {
        if (data?.heroTagline) setTagline(data.heroTagline);
      })
      .catch(() => {});
  }, []);

  const handleSearch = () => {
    const params = new URLSearchParams();
    params.set('type', 'buy');
    if (query) params.set('q', query);
    router.push(`/search?${params.toString()}`);
  };

  return (
    <section className="relative w-full min-h-screen flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 bg-gray-900 bg-cover bg-center" style={{ backgroundImage: "url('/images/hero.jpg')" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/60" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-28 pb-16">
        <h1
          className="font-display italic text-4xl sm:text-5xl md:text-6xl xl:text-7xl text-white text-center leading-[1.05] tracking-tight max-w-4xl mb-10"
          style={{ textShadow: '0 2px 24px rgba(0,0,0,0.4)' }}
        >
          {tagline || 'Find your place in New York City.'}
        </h1>

        {/* Search bar — clean, no tabs */}
        <div className="w-full max-w-2xl">
          <div className="flex items-center bg-white rounded-full shadow-2xl overflow-hidden">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Address, neighborhood, or zip code..."
              aria-label="Search properties"
              className="flex-1 px-6 py-4 text-base text-gray-900 bg-transparent outline-none placeholder:text-gray-400"
              autoComplete="off"
            />
            <button
              onClick={handleSearch}
              data-analytics-cta="hero_search"
              className="px-8 py-4 bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              Search
            </button>
          </div>
          {/* Quick links */}
          <div className="flex items-center justify-center gap-4 mt-4">
            {['Buy', 'Rent', 'Sell'].map((label) => (
              <button
                key={label}
                onClick={() => router.push(`/${label.toLowerCase()}`)}
                className="text-white/60 text-sm font-medium hover:text-white transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce-down">
        <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </section>
  );
}
