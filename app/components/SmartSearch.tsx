'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { parseNaturalLanguageSearch } from '@/lib/search/natural-language-parser';

const EXAMPLES = [
  '2BR condo under $2M in Tribeca with doorman',
  'Studio rental in East Village pet friendly',
  'Pre-war co-op UES with park views',
  'Townhouse in Brooklyn $1M-$3M',
  '3 bed 2 bath elevator building Chelsea',
  'Loft in SoHo with washer/dryer',
];

/**
 * AI-powered natural language search box.
 * Parses intent client-side and navigates to search with pre-filled filters.
 */
export default function SmartSearch({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [placeholder, setPlaceholder] = useState(EXAMPLES[0]);
  const [showExamples, setShowExamples] = useState(false);

  const handleSearch = useCallback((searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;

    const parsed = parseNaturalLanguageSearch(q);
    const params = new URLSearchParams();

    params.set('tab', parsed.tab);
    if (parsed.filters.minPrice) params.set('minPrice', parsed.filters.minPrice.toString());
    if (parsed.filters.maxPrice) params.set('maxPrice', parsed.filters.maxPrice.toString());
    if (parsed.filters.beds != null) params.set('beds', parsed.filters.beds.toString());
    if (parsed.filters.baths != null) params.set('baths', parsed.filters.baths.toString());
    if (parsed.filters.propertySubTypes?.length) params.set('subTypes', parsed.filters.propertySubTypes.join(','));
    if (parsed.filters.yearBuilt && parsed.filters.yearBuilt !== 'any') params.set('yearBuilt', parsed.filters.yearBuilt);
    if (parsed.filters.furnished) params.set('furnished', 'true');
    if (parsed.filters.amenities?.length) params.set('amenities', parsed.filters.amenities.join(','));
    if (parsed.filters.openHouse) params.set('openHouse', 'true');
    if (parsed.filters.minSqft) params.set('minSqft', parsed.filters.minSqft.toString());
    if (parsed.neighborhood) params.set('neighborhood', parsed.neighborhood);
    if (parsed.borough) params.set('borough', parsed.borough);
    if (parsed.remainingQuery) params.set('q', parsed.remainingQuery);

    router.push(`/search?${params.toString()}`);
  }, [router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          <svg className="absolute left-4 w-5 h-5 text-brand-dark/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowExamples(true)}
            onBlur={() => setTimeout(() => setShowExamples(false), 200)}
            placeholder={placeholder}
            className="w-full pl-12 pr-28 py-4 rounded-2xl bg-white ring-1 ring-black/10 focus:ring-2 focus:ring-brand-gold/40 text-brand-dark text-[15px] placeholder:text-brand-dark/30 outline-none shadow-sm transition-shadow focus:shadow-md"
            aria-label="Describe your ideal property"
          />
          <button
            type="submit"
            className="absolute right-2 px-5 py-2.5 bg-brand-gold text-white font-semibold text-sm rounded-xl hover:bg-brand-gold-deep transition-colors"
          >
            Search
          </button>
        </div>

        {/* Example queries dropdown */}
        {showExamples && !query && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden z-50">
            <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-brand-dark/40 uppercase tracking-wider">Try searching for...</p>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onMouseDown={() => { setQuery(example); handleSearch(example); }}
                className="w-full text-left px-4 py-2.5 text-sm text-brand-dark/80 hover:bg-brand-gold/5 hover:text-brand-dark transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 text-brand-gold/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                {example}
              </button>
            ))}
          </div>
        )}
      </form>
      <p className="text-center text-[11px] text-brand-dark/30 mt-2">
        Describe your ideal home in plain English — we&apos;ll find the matches
      </p>
    </div>
  );
}
