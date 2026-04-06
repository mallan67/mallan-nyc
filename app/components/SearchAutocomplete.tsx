'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { getSuggestions as getDictionarySuggestions } from '@/lib/search/nyc-dictionary';
import type { DictionarySuggestion } from '@/lib/search/nyc-dictionary';

export interface Suggestion {
  type: 'address' | 'neighborhood' | 'zip' | 'agent' | 'listing' | 'location' | 'filter';
  label: string;
  sublabel: string;
  value: string;
  // Legacy fields for backward compatibility
  address?: string;
  neighborhood?: string;
  borough?: string;
  postalCode?: string;
}

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: Suggestion) => void;
  onClear?: () => void;
  placeholder?: string;
}

/** Category display config */
const CATEGORY_ORDER: { type: Suggestion['type']; header: string }[] = [
  { type: 'location', header: 'SEARCH BY LOCATION' },
  { type: 'neighborhood', header: 'LOCATIONS' },
  { type: 'filter', header: 'FILTERS' },
  { type: 'agent', header: 'AGENTS' },
  { type: 'listing', header: 'LISTINGS' },
  { type: 'address', header: 'BUILDINGS' },
  { type: 'zip', header: 'ZIP CODES' },
];

/** Human-readable type label shown below each suggestion */
function typeLabel(s: Suggestion): string {
  switch (s.type) {
    case 'neighborhood':
      if (s.sublabel === 'Borough') return 'BOROUGH';
      return 'NEIGHBORHOOD';
    case 'address': return 'ADDRESS';
    case 'zip': return 'ZIP CODE';
    case 'agent': return 'AGENT';
    case 'listing': return 'LISTING';
    case 'filter': return 'FILTER';
    case 'location': return '';
    default: return '';
  }
}

export default function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  onClear,
  placeholder = 'Neighborhood, ZIP, address, or listing #',
}: SearchAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Instant dictionary matches (neighborhoods, lingo, transit)
    const dictResults = getDictionarySuggestions(query, 4);
    const dictSuggestions: Suggestion[] = dictResults.map((d: DictionarySuggestion) => ({
      type: d.type === 'neighborhood' || d.type === 'borough' ? 'neighborhood' as const : 'filter' as const,
      label: d.label,
      sublabel: d.type === 'borough' ? 'Borough' : (d.context ?? ''),
      value: d.value,
      ...(d.type === 'neighborhood' ? { neighborhood: d.value, borough: d.context } : {}),
    }));

    // Show dictionary results immediately (no network wait)
    if (dictSuggestions.length > 0) {
      setSuggestions(dictSuggestions);
      setIsOpen(true);
      setActiveIndex(-1);
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const res = await fetch(
        `/api/listings/suggest?q=${encodeURIComponent(query)}`,
        { signal: controller.signal }
      );
      const data = await res.json();

      if (data.success && data.suggestions?.length > 0) {
        // Merge: dictionary first, then API results (deduplicated), limit 8
        const seen = new Set(dictSuggestions.map(s => `${s.type}:${s.value}`));
        const apiFiltered = (data.suggestions as Suggestion[]).filter(
          s => !seen.has(`${s.type}:${s.value}`)
        );
        const merged = [...dictSuggestions, ...apiFiltered].slice(0, 8);
        setSuggestions(merged);
        setIsOpen(true);
        setActiveIndex(-1);
      } else if (dictSuggestions.length === 0) {
        setSuggestions([]);
        setIsOpen(false);
      }
      // If API returned nothing but we have dict results, keep them (already set above)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Keep dictionary results even if API fails
      if (dictSuggestions.length === 0) {
        setSuggestions([]);
        setIsOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (newValue: string) => {
    onChange(newValue);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 300);
  };

  const handleSelect = (suggestion: Suggestion) => {
    setIsOpen(false);
    setSuggestions([]);
    onSelect(suggestion);
    if (suggestion.type !== 'location') {
      onChange(suggestion.label || suggestion.address || '');
    }
  };

  /** Use browser geolocation */
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) return;
    const locationSuggestion: Suggestion = {
      type: 'location',
      label: 'Locating...',
      sublabel: '',
      value: '',
    };
    onChange('My location');
    setIsOpen(false);
    setSuggestions([]);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locationSuggestion.value = `${pos.coords.latitude},${pos.coords.longitude}`;
        locationSuggestion.label = 'Current Location';
        onSelect(locationSuggestion);
      },
      () => {
        // Permission denied or error — just close
        onChange('');
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  // Build flat list of selectable items for keyboard nav
  const selectableItems: Suggestion[] = [];
  // "Current location" is always first selectable when dropdown is open
  if (isOpen) {
    selectableItems.push({
      type: 'location',
      label: 'Search by my current location.',
      sublabel: '',
      value: 'current',
    });
  }
  for (const cat of CATEGORY_ORDER) {
    if (cat.type === 'location') continue;
    for (const s of suggestions) {
      if (s.type === cat.type) selectableItems.push(s);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || selectableItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < selectableItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : selectableItems.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const item = selectableItems[activeIndex];
      if (item.type === 'location') {
        handleCurrentLocation();
      } else {
        handleSelect(item);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Group suggestions by category
  const grouped: { header: string; items: Suggestion[] }[] = [];
  for (const cat of CATEGORY_ORDER) {
    if (cat.type === 'location') continue; // rendered separately
    const items = suggestions.filter(s => s.type === cat.type);
    if (items.length > 0) grouped.push({ header: cat.header, items });
  }

  // Track flat index for keyboard highlight across groups
  let flatIndex = 1; // 0 = current location row

  return (
    <div ref={wrapperRef} className="relative">
      <label htmlFor="search-autocomplete" className="sr-only">
        Search properties
      </label>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/40 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id="search-autocomplete"
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg pl-9 pr-9 py-2.5 text-sm bg-gray-50 border border-black/10 text-brand-dark placeholder:text-brand-dark/50 focus:outline-none focus:border-brand-gold/50 focus:ring-1 focus:ring-brand-gold/20 focus:bg-white transition-colors"
          aria-label="Search by neighborhood, ZIP, address, or listing number"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="search-suggestions"
          aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-brand-dark/20 border-t-brand-dark/60 rounded-full animate-spin" />
          </div>
        )}
        {!loading && value && (
          <button
            onClick={() => { onChange(''); setSuggestions([]); setIsOpen(false); if (onClear) onClear(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/40 hover:text-brand-dark/70 transition-colors"
            aria-label="Clear search and reset all filters"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Grouped Suggestions Dropdown */}
      {isOpen && (suggestions.length > 0 || value.length >= 2) && (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute z-50 w-full sm:w-[360px] mt-1 bg-white rounded-xl shadow-lg ring-1 ring-black/5 max-h-[420px] overflow-auto"
        >
          {/* Current Location */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[10px] font-semibold tracking-wider text-brand-dark/40 uppercase">Search by location</p>
          </div>
          <button
            id="suggestion-0"
            role="option"
            aria-selected={activeIndex === 0}
            onClick={handleCurrentLocation}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
              activeIndex === 0 ? 'bg-brand-gold/10' : 'hover:bg-gray-50'
            }`}
          >
            {/* Crosshair icon */}
            <svg className="w-4 h-4 text-brand-dark/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="1" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="23" />
              <line x1="1" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="23" y2="12" />
            </svg>
            <span className="text-sm text-brand-dark">Search by my current location.</span>
          </button>

          {/* Grouped results */}
          {grouped.map(({ header, items }) => (
            <div key={header}>
              <div className="px-3 pt-3 pb-1 border-t border-gray-100">
                <p className="text-[10px] font-semibold tracking-wider text-brand-dark/40 uppercase">{header}</p>
              </div>
              {items.map((suggestion) => {
                const idx = flatIndex++;
                const tLabel = typeLabel(suggestion);
                return (
                  <button
                    key={`${suggestion.type}-${suggestion.value}-${idx}`}
                    id={`suggestion-${idx}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    onClick={() => handleSelect(suggestion)}
                    className={`w-full text-left px-3 py-2 transition-colors ${
                      idx === activeIndex ? 'bg-brand-gold/10' : 'hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm text-brand-dark">
                      {suggestion.label}{suggestion.sublabel && suggestion.sublabel !== 'Borough' ? `, ${suggestion.sublabel}` : ''}
                    </p>
                    {tLabel && (
                      <p className="text-[10px] font-semibold tracking-wider text-brand-dark/35 uppercase mt-0.5">
                        {tLabel}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* No results state */}
          {suggestions.length === 0 && !loading && value.length >= 2 && (
            <div className="px-3 py-3 border-t border-gray-100">
              <p className="text-xs text-brand-dark/50 text-center">No results found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
