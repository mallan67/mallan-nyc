'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface Suggestion {
  type: 'address' | 'neighborhood' | 'zip' | 'agent' | 'listing';
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
  placeholder?: string;
}

export default function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search by address, neighborhood, zip...',
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
        setSuggestions(data.suggestions);
        setIsOpen(true);
        setActiveIndex(-1);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setSuggestions([]);
      setIsOpen(false);
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
    onChange(suggestion.label || suggestion.address || '');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
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

  return (
    <div ref={wrapperRef} className="relative">
      <label htmlFor="search-autocomplete" className="sr-only">
        Search properties
      </label>
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/30 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          className="w-full rounded-xl pl-8 pr-8 py-2 text-sm bg-gray-50 border border-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:bg-white transition-colors"
          aria-label="Search by address, neighborhood, zip, or borough"
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
            onClick={() => { onChange(''); setSuggestions([]); setIsOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-dark/40 hover:text-brand-dark/70 transition-colors"
            aria-label="Clear search"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-lg ring-1 ring-black/5 py-1 max-h-80 overflow-auto"
        >
          {suggestions.map((suggestion, i) => (
            <li
              key={`${suggestion.type}-${suggestion.value}-${i}`}
              id={`suggestion-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => handleSelect(suggestion)}
              className={`px-4 py-2.5 cursor-pointer transition-colors ${
                i === activeIndex ? 'bg-brand-gold/10' : 'hover:bg-gray-50'
              }`}
            >
              <p className="text-sm font-medium text-brand-dark">
                {suggestion.label || suggestion.address}
              </p>
              <p className="text-xs text-brand-dark/85">
                {suggestion.sublabel || [suggestion.neighborhood, suggestion.borough, suggestion.postalCode].filter(Boolean).join(', ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
