'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { loadNeighborhoods, ALL_BOROUGH_SLUGS, BOROUGH_CONFIGS } from '@/lib/neighborhoods/boroughs';
import type { BoroughSlug } from '@/lib/types/neighborhood';

interface NeighborhoodSelectorProps {
  selected: string[];
  onChange: (neighborhoods: string[]) => void;
}

// Pre-load all neighborhood data (static imports, no API call)
const BOROUGH_NEIGHBORHOODS: Record<BoroughSlug, string[]> = {} as Record<BoroughSlug, string[]>;
for (const slug of ALL_BOROUGH_SLUGS) {
  BOROUGH_NEIGHBORHOODS[slug] = loadNeighborhoods(slug).map(n => n.name);
}

const BOROUGH_TABS: { slug: BoroughSlug; label: string }[] = [
  { slug: 'manhattan', label: 'Manhattan' },
  { slug: 'brooklyn', label: 'Brooklyn' },
  { slug: 'queens', label: 'Queens' },
  { slug: 'bronx', label: 'Bronx' },
  { slug: 'staten-island', label: 'Staten Island' },
];

export default function NeighborhoodSelector({ selected, onChange }: NeighborhoodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeBorough, setActiveBorough] = useState<BoroughSlug>('manhattan');
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const boroughName = BOROUGH_CONFIGS[activeBorough].name;
  const neighborhoods = BOROUGH_NEIGHBORHOODS[activeBorough];

  // "All [Borough]" selects all neighborhoods in that borough
  const allBoroughNeighborhoods = neighborhoods;
  const allBoroughSelected = allBoroughNeighborhoods.every(n => selected.includes(n));

  const toggleNeighborhood = useCallback((name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter(n => n !== name));
    } else {
      onChange([...selected, name]);
    }
  }, [selected, onChange]);

  const toggleAllBorough = useCallback(() => {
    if (allBoroughSelected) {
      // Deselect all from this borough
      onChange(selected.filter(n => !allBoroughNeighborhoods.includes(n)));
    } else {
      // Add all from this borough (dedup)
      const others = selected.filter(n => !allBoroughNeighborhoods.includes(n));
      onChange([...others, ...allBoroughNeighborhoods]);
    }
  }, [selected, onChange, allBoroughSelected, allBoroughNeighborhoods]);

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const triggerLabel = selected.length === 0
    ? 'Neighborhoods'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} Neighborhoods`;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-lg px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium ring-1 bg-white text-brand-dark hover:bg-gray-50 transition-colors flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap ${
          selected.length > 0 ? 'ring-brand-gold/50' : 'ring-black/10'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {triggerLabel}
        {selected.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-brand-gold text-white text-xs flex items-center justify-center font-semibold">
            {selected.length}
          </span>
        )}
      </button>

      {/* Desktop floating panel */}
      {isOpen && (
        <>
          <div
            ref={panelRef}
            className="hidden lg:block absolute top-full left-0 mt-2 w-[480px] bg-white rounded-xl shadow-xl ring-1 ring-black/10 z-50 overflow-hidden"
          >
            {/* Borough tabs */}
            <div className="flex border-b border-gray-100">
              {BOROUGH_TABS.map(({ slug, label }) => (
                <button
                  key={slug}
                  onClick={() => setActiveBorough(slug)}
                  className={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors ${
                    activeBorough === slug
                      ? 'text-brand-dark border-b-2 border-brand-gold'
                      : 'text-brand-dark/50 hover:text-brand-dark/70'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Neighborhood pills */}
            <div className="p-3 max-h-[350px] overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {/* All [Borough] pill */}
                <button
                  onClick={toggleAllBorough}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    allBoroughSelected
                      ? 'bg-brand-dark text-white'
                      : 'bg-gray-100 text-brand-dark hover:bg-gray-200'
                  }`}
                >
                  All {boroughName}
                </button>

                {neighborhoods.map(name => {
                  const isSelected = selected.includes(name);
                  return (
                    <button
                      key={name}
                      onClick={() => toggleNeighborhood(name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-brand-dark text-white'
                          : 'bg-gray-100 text-brand-dark/80 hover:bg-gray-200'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={clearAll}
                className="text-xs text-brand-dark/60 hover:text-brand-dark font-medium transition-colors"
                disabled={selected.length === 0}
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 bg-brand-dark text-white text-xs font-semibold rounded-lg hover:bg-brand-dark/90 transition-colors"
              >
                Done
              </button>
            </div>
          </div>

          {/* Mobile full-width sheet */}
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={() => setIsOpen(false)} />

            {/* Sheet */}
            <div className="mt-auto relative bg-white rounded-t-2xl max-h-[80vh] flex flex-col">
              {/* Handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>

              <h3 className="text-sm font-semibold text-brand-dark px-4 pb-2">Select Neighborhoods</h3>

              {/* Borough tabs — horizontal scroll */}
              <div className="flex gap-1 px-4 pb-2 overflow-x-auto">
                {BOROUGH_TABS.map(({ slug, label }) => (
                  <button
                    key={slug}
                    onClick={() => setActiveBorough(slug)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeBorough === slug
                        ? 'bg-brand-dark text-white'
                        : 'bg-gray-100 text-brand-dark/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Neighborhood pills — 2-col grid */}
              <div className="flex-1 overflow-y-auto px-4 py-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={toggleAllBorough}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors col-span-2 ${
                      allBoroughSelected
                        ? 'bg-brand-dark text-white'
                        : 'bg-gray-100 text-brand-dark hover:bg-gray-200'
                    }`}
                  >
                    All {boroughName}
                  </button>

                  {neighborhoods.map(name => {
                    const isSelected = selected.includes(name);
                    return (
                      <button
                        key={name}
                        onClick={() => toggleNeighborhood(name)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                          isSelected
                            ? 'bg-brand-dark text-white'
                            : 'bg-gray-100 text-brand-dark/80 hover:bg-gray-200'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Done button */}
              <div className="p-4 border-t border-gray-100">
                <div className="flex gap-3">
                  <button
                    onClick={clearAll}
                    className="flex-1 py-2.5 text-sm font-medium text-brand-dark/70 bg-gray-100 rounded-xl"
                    disabled={selected.length === 0}
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-brand-dark rounded-xl"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
