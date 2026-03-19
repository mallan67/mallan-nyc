'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { loadNeighborhoods, ALL_BOROUGH_SLUGS, BOROUGH_CONFIGS } from '@/lib/neighborhoods/boroughs';
import type { BoroughSlug } from '@/lib/types/neighborhood';

interface NeighborhoodSelectorProps {
  selected: string[];
  onChange: (neighborhoods: string[]) => void;
}

// ── Grouped neighborhood data by borough ──
// Manhattan is the primary market — full coverage with geographic groupings.
// Other boroughs use their existing JSON data in a single group.

interface NeighborhoodGroup {
  label: string;
  neighborhoods: string[];
}

const MANHATTAN_GROUPS: NeighborhoodGroup[] = [
  {
    label: 'DOWNTOWN',
    neighborhoods: [
      'Chelsea', 'East Village', 'Flatiron', 'Gramercy',
      'Greenwich Village', 'Meatpacking District', 'NoHo', 'NoMad',
      'Stuyvesant Town', 'Union Square', 'West Village',
    ],
  },
  {
    label: 'LOWER MANHATTAN',
    neighborhoods: [
      'Battery Park City', 'Chinatown', 'Civic Center',
      'Financial District', 'Little Italy', 'Lower East Side',
      'Nolita', 'SoHo', 'South Street Seaport', 'Tribeca',
      'Two Bridges',
    ],
  },
  {
    label: 'MIDTOWN',
    neighborhoods: [
      'Beekman Place', 'Central Park South', 'Hell\'s Kitchen',
      'Hudson Yards', 'Kips Bay', 'Lincoln Square', 'Midtown East',
      'Midtown West', 'Murray Hill', 'Roosevelt Island',
      'Sutton Place', 'Tudor City', 'Turtle Bay',
    ],
  },
  {
    label: 'UPTOWN',
    neighborhoods: [
      'Carnegie Hill', 'East Harlem', 'Hamilton Heights', 'Harlem',
      'Inwood', 'Lenox Hill', 'Manhattan Valley', 'Marble Hill',
      'Morningside Heights', 'Sugar Hill', 'Upper East Side',
      'Upper West Side', 'Washington Heights', 'Yorkville',
    ],
  },
];

// Build grouped data for other boroughs from their JSON files
function buildFlatGroup(slug: BoroughSlug): NeighborhoodGroup[] {
  const names = loadNeighborhoods(slug).map(n => n.name);
  return [{ label: '', neighborhoods: names }];
}

const BOROUGH_GROUPS: Record<BoroughSlug, NeighborhoodGroup[]> = {
  manhattan: MANHATTAN_GROUPS,
  brooklyn: buildFlatGroup('brooklyn'),
  queens: buildFlatGroup('queens'),
  bronx: buildFlatGroup('bronx'),
  'staten-island': buildFlatGroup('staten-island'),
};

// Flat list of all neighborhoods per borough (for "All [Borough]" toggle)
const BOROUGH_ALL_NAMES: Record<BoroughSlug, string[]> = {} as Record<BoroughSlug, string[]>;
for (const slug of ALL_BOROUGH_SLUGS) {
  BOROUGH_ALL_NAMES[slug] = BOROUGH_GROUPS[slug].flatMap(g => g.neighborhoods);
}

const BOROUGH_TABS: { slug: BoroughSlug; label: string }[] = [
  { slug: 'manhattan', label: 'Manhattan' },
  { slug: 'brooklyn', label: 'Brooklyn' },
  { slug: 'queens', label: 'Queens' },
  { slug: 'bronx', label: 'Bronx' },
  { slug: 'staten-island', label: 'Staten Island' },
];

// ── Checkbox row component ──
function CheckRow({ name, checked, onChange }: { name: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-gray-50 cursor-pointer transition-colors group">
      <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
        checked ? 'bg-brand-dark border-brand-dark' : 'border-gray-300 group-hover:border-gray-400'
      }`}>
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className={`text-xs font-medium ${checked ? 'text-brand-dark' : 'text-brand-dark/70'}`}>
        {name}
      </span>
    </label>
  );
}

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

  // Close on Escape + return focus to trigger
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Focus management: move focus into panel on open, return on close
  const prevOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      requestAnimationFrame(() => {
        panelRef.current?.querySelector<HTMLElement>('label, button')?.focus();
      });
    }
    if (!isOpen && prevOpen.current) {
      triggerRef.current?.focus();
    }
    prevOpen.current = isOpen;
  }, [isOpen]);

  const boroughName = BOROUGH_CONFIGS[activeBorough].name;
  const groups = BOROUGH_GROUPS[activeBorough];
  const allBoroughNeighborhoods = BOROUGH_ALL_NAMES[activeBorough];
  const allBoroughSelected = useMemo(
    () => allBoroughNeighborhoods.every(n => selected.includes(n)),
    [allBoroughNeighborhoods, selected]
  );

  const toggleNeighborhood = useCallback((name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter(n => n !== name));
    } else {
      onChange([...selected, name]);
    }
  }, [selected, onChange]);

  const toggleGroup = useCallback((groupNames: string[]) => {
    const allSelected = groupNames.every(n => selected.includes(n));
    if (allSelected) {
      onChange(selected.filter(n => !groupNames.includes(n)));
    } else {
      const others = selected.filter(n => !groupNames.includes(n));
      onChange([...others, ...groupNames]);
    }
  }, [selected, onChange]);

  const toggleAllBorough = useCallback(() => {
    if (allBoroughSelected) {
      onChange(selected.filter(n => !allBoroughNeighborhoods.includes(n)));
    } else {
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

  // ── Shared content renderer (used by both desktop and mobile) ──
  const renderGroups = (colClass: string) => (
    <>
      {/* All [Borough] checkbox */}
      <div className="px-1 pb-1 border-b border-gray-100 mb-2">
        <CheckRow
          name={`All ${boroughName}`}
          checked={allBoroughSelected}
          onChange={toggleAllBorough}
        />
      </div>

      {groups.map((group) => {
        const groupAllSelected = group.neighborhoods.every(n => selected.includes(n));
        return (
          <div key={group.label || 'default'} className="mb-3">
            {group.label && (
              <div className="flex items-center justify-between px-1 mb-1">
                <h4 className="text-[10px] font-bold text-brand-dark/40 tracking-wider">{group.label}</h4>
                <button
                  onClick={() => toggleGroup(group.neighborhoods)}
                  className="text-[10px] text-brand-dark/40 hover:text-brand-dark/70 font-medium transition-colors"
                >
                  {groupAllSelected ? 'Clear' : 'Select all'}
                </button>
              </div>
            )}
            <div className={colClass}>
              {group.neighborhoods.map(name => (
                <CheckRow
                  key={name}
                  name={name}
                  checked={selected.includes(name)}
                  onChange={() => toggleNeighborhood(name)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );

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

      {/* Panels */}
      {isOpen && (
        <>
          {/* ── Desktop floating panel ── */}
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Select neighborhoods"
            className="hidden lg:block absolute top-full left-0 mt-2 w-[520px] bg-white rounded-xl shadow-xl ring-1 ring-black/10 z-50 overflow-hidden"
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

            {/* Grouped checkboxes */}
            <div className="p-3 max-h-[400px] overflow-y-auto">
              {renderGroups('grid grid-cols-2 gap-x-2')}
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

          {/* ── Mobile full-width sheet ── */}
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Select neighborhoods">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={() => { setIsOpen(false); triggerRef.current?.focus(); }} />

            {/* Sheet */}
            <div className="mt-auto relative bg-white rounded-t-2xl max-h-[85vh] flex flex-col">
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

              {/* Grouped checkboxes */}
              <div className="flex-1 overflow-y-auto px-4 py-2">
                {renderGroups('grid grid-cols-2 gap-x-2')}
              </div>

              {/* Footer */}
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
                    onClick={() => { setIsOpen(false); triggerRef.current?.focus(); }}
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
