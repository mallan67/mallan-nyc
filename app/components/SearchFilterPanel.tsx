'use client';

import { useCallback, useState } from 'react';
import type { SearchTab, SearchFilters, AmenityFilter } from '@/lib/search/types';
import {
  AMENITY_FIELD_MAP,
  UNSUPPORTED_AMENITIES,
  TAB_CONFIG,
  RESIDENTIAL_PROPERTY_TYPES,
  OWNERSHIP_TYPES as OWNERSHIP_VALUES,
  COMMERCIAL_SUB_TYPES,
} from '@/lib/search/types';

interface SearchFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: SearchFilters) => void;
  currentFilters: SearchFilters;
  activeTab: SearchTab;
}

export default function SearchFilterPanel({
  isOpen,
  onClose,
  onApply,
  currentFilters,
  activeTab,
}: SearchFilterPanelProps) {
  // Staged filters — only applied when user clicks "Apply".
  const [staged, setStaged] = useState<SearchFilters>(currentFilters);

  // Re-sync staged with currentFilters when the panel opens, OR when
  // currentFilters changes while the panel is open. React docs canonical
  // "adjust state when prop changes" pattern: store previous prop values
  // in state and compare during render. Set-state-during-render is
  // supported by React (the in-progress render is discarded and re-run).
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevCurrentFilters, setPrevCurrentFilters] = useState(currentFilters);
  if (prevIsOpen !== isOpen || prevCurrentFilters !== currentFilters) {
    setPrevIsOpen(isOpen);
    setPrevCurrentFilters(currentFilters);
    if (isOpen) setStaged(currentFilters);
  }

  const tabConfig = TAB_CONFIG[activeTab];
  const isCommercial = tabConfig.commercial;

  const updateStaged = useCallback((partial: Partial<SearchFilters>) => {
    setStaged(prev => ({ ...prev, ...partial }));
  }, []);

  const toggleArrayItem = useCallback(<T extends string>(arr: T[] | undefined, item: T): T[] => {
    const current = arr || [];
    return current.includes(item) ? current.filter(i => i !== item) : [...current, item];
  }, []);

  const handleApply = () => {
    onApply(staged);
    onClose();
  };

  const handleReset = () => {
    const reset: SearchFilters = { sort: currentFilters.sort };
    setStaged(reset);
    onApply(reset);
    onClose();
  };

  const hasChanges = JSON.stringify(staged) !== JSON.stringify(currentFilters);

  // Group amenities by their group.
  //
  // Amenities with NO live provider backing are not offered at all. Verified
  // corpus-wide on 2026-08-19: `no-fee`, `renovated`, `natural-light` and
  // `quiet` match nothing in the live feature vocabularies, so offering them
  // could only ever mislead — the API rejects them, and a control that always
  // errors is worse than no control.
  const amenityGroups = Object.entries(AMENITY_FIELD_MAP).reduce((acc, [key, config]) => {
    if (UNSUPPORTED_AMENITIES.has(key)) return acc;
    if (!acc[config.group]) acc[config.group] = [];
    acc[config.group].push({ key: key as AmenityFilter, ...config });
    return acc;
  }, {} as Record<string, { key: AmenityFilter; label: string; group: string }[]>);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-display font-semibold text-brand-dark">Filters</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close filters"
          >
            <svg className="w-5 h-5 text-brand-dark/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Price */}
          <FilterSection title="Price">
            {(() => {
              const isRent = tabConfig.apiType === 'rent';
              const allPrices = isRent
                ? [1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7500, 10000, 15000, 20000]
                : [100000, 200000, 300000, 400000, 500000, 600000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000, 10000000, 20000000];
              const fmtPrice = (v: number) =>
                isRent ? `$${v.toLocaleString()}` : v >= 1000000 ? `$${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M` : `$${(v / 1000).toFixed(0)}K`;
              const minOptions = allPrices.filter(v => !staged.maxPrice || v < staged.maxPrice);
              const maxOptions = allPrices.filter(v => !staged.minPrice || v > staged.minPrice);
              return (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-brand-dark/85 mb-1 block">Min</label>
                    <select
                      value={staged.minPrice || ''}
                      onChange={(e) => updateStaged({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                    >
                      <option value="">No min</option>
                      {minOptions.map((v) => (
                        <option key={v} value={v}>{fmtPrice(v)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end pb-2.5 text-brand-dark/40">&ndash;</div>
                  <div className="flex-1">
                    <label className="text-xs text-brand-dark/85 mb-1 block">Max</label>
                    <select
                      value={staged.maxPrice || ''}
                      onChange={(e) => updateStaged({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                    >
                      <option value="">No max</option>
                      {maxOptions.map((v) => (
                        <option key={v} value={v}>{fmtPrice(v)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })()}
          </FilterSection>

          {/* Beds & Baths */}
          {tabConfig.showBedsBaths && (
            <>
              <FilterSection title="Bedrooms">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-brand-dark/85 mb-1 block">Min</label>
                    <select
                      value={staged.beds != null ? staged.beds.toString() : ''}
                      onChange={(e) => updateStaged({ beds: e.target.value !== '' ? Number(e.target.value) : null })}
                      className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                    >
                      <option value="">Any</option>
                      <option value="0">Studio</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-2.5 text-brand-dark/40">&ndash;</div>
                  <div className="flex-1">
                    <label className="text-xs text-brand-dark/85 mb-1 block">Max</label>
                    <select
                      value={staged.maxBeds != null ? staged.maxBeds.toString() : ''}
                      onChange={(e) => updateStaged({ maxBeds: e.target.value !== '' ? Number(e.target.value) : null })}
                      className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                    >
                      <option value="">Any</option>
                      <option value="0">Studio</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4+</option>
                    </select>
                  </div>
                </div>
              </FilterSection>

              <FilterSection title="Bathrooms">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-brand-dark/85 mb-1 block">Min</label>
                    <select
                      value={staged.baths != null ? staged.baths.toString() : ''}
                      onChange={(e) => updateStaged({ baths: e.target.value !== '' ? Number(e.target.value) : null })}
                      className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                    >
                      <option value="">Any</option>
                      <option value="1">1</option>
                      <option value="1.5">1.5</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-2.5 text-brand-dark/40">&ndash;</div>
                  <div className="flex-1">
                    <label className="text-xs text-brand-dark/85 mb-1 block">Max</label>
                    <select
                      value={staged.maxBaths != null ? staged.maxBaths.toString() : ''}
                      onChange={(e) => updateStaged({ maxBaths: e.target.value !== '' ? Number(e.target.value) : null })}
                      className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                    >
                      <option value="">Any</option>
                      <option value="1">1</option>
                      <option value="1.5">1.5</option>
                      <option value="2">2</option>
                      <option value="3">3+</option>
                    </select>
                  </div>
                </div>
              </FilterSection>
            </>
          )}

          {/* Sqft */}
          <FilterSection title="Square Feet">
            {(() => {
              const allSqft = [300, 500, 700, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
              const fmtSqft = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K sf` : `${v} sf`;
              const minOptions = allSqft.filter(v => !staged.maxSqft || v < staged.maxSqft);
              const maxOptions = allSqft.filter(v => !staged.minSqft || v > staged.minSqft);
              return (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <select
                      value={staged.minSqft || ''}
                      onChange={(e) => updateStaged({ minSqft: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                    >
                      <option value="">No min</option>
                      {minOptions.map((v) => (
                        <option key={v} value={v}>{fmtSqft(v)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center text-brand-dark/40">&ndash;</div>
                  <div className="flex-1">
                    <select
                      value={staged.maxSqft || ''}
                      onChange={(e) => updateStaged({ maxSqft: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                    >
                      <option value="">No max</option>
                      {maxOptions.map((v) => (
                        <option key={v} value={v}>{fmtSqft(v)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })()}
          </FilterSection>

          {/* Property Type (includes Condo/Co-op/Condop for residential) */}
          <FilterSection title={isCommercial ? 'Commercial Type' : 'Property Type'}>
            <div className="grid grid-cols-2 gap-2">
              {(isCommercial ? COMMERCIAL_SUB_TYPES : RESIDENTIAL_PROPERTY_TYPES).map((type) => {
                const isOwnership = OWNERSHIP_VALUES.includes(type);
                const isChecked = isOwnership
                  ? (staged.ownershipTypes?.includes(type) ?? false)
                  : (staged.propertySubTypes?.includes(type) ?? false);
                const handleChange = () => {
                  if (isOwnership) {
                    updateStaged({ ownershipTypes: toggleArrayItem(staged.ownershipTypes, type) });
                  } else {
                    updateStaged({ propertySubTypes: toggleArrayItem(staged.propertySubTypes, type) });
                  }
                };
                return (
                  <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-brand-gold focus:ring-brand-gold/30"
                    />
                    <span className="text-brand-dark">{type}</span>
                  </label>
                );
              })}
            </div>
          </FilterSection>

          {/* Ownership Type section removed — Condo/Co-op/Condop merged into Property Type above */}

          {/* Status */}
          <FilterSection title="Listing Status">
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Active', value: 'Active' },
                { label: 'Coming Soon', value: 'ComingSoon' },
                { label: 'Under Contract', value: 'ActiveUnderContract' },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => updateStaged({ statuses: toggleArrayItem(staged.statuses, value) })}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    staged.statuses?.includes(value)
                      ? 'bg-brand-dark text-white'
                      : 'bg-gray-100 text-brand-dark hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Year Built */}
          <FilterSection title="Year Built">
            <div className="flex gap-2">
              {[
                { label: 'Any', value: 'any' },
                { label: 'Pre-War (≤1946)', value: 'pre-war' },
                { label: 'Post-War (1947+)', value: 'post-war' },
              ].map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => updateStaged({ yearBuilt: value as SearchFilters['yearBuilt'] })}
                  className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                    (staged.yearBuilt || 'any') === value
                      ? 'bg-brand-dark text-white'
                      : 'bg-gray-100 text-brand-dark hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Furnished (rental only) */}
          {tabConfig.showFurnished && (
            <FilterSection title="Furnished">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={staged.furnished ?? false}
                  onChange={() => updateStaged({ furnished: !staged.furnished })}
                  className="rounded border-gray-300 text-brand-gold focus:ring-brand-gold/30"
                />
                <span className="text-brand-dark">Furnished only</span>
              </label>
            </FilterSection>
          )}

          {/* Open House */}
          <FilterSection title="Open House">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Any', checked: !staged.openHouse },
                  { label: 'Today', checked: staged.openHouse && staged.openHouseDate === new Date().toISOString().split('T')[0] },
                  { label: 'This Weekend', checked: staged.openHouse && staged.openHouseDate === 'weekend' },
                  { label: 'Any Upcoming', checked: staged.openHouse && !staged.openHouseDate },
                ].map(({ label, checked }) => (
                  <button
                    key={label}
                    onClick={() => {
                      if (label === 'Any') {
                        updateStaged({ openHouse: false, openHouseDate: undefined });
                      } else if (label === 'Today') {
                        updateStaged({ openHouse: true, openHouseDate: new Date().toISOString().split('T')[0] });
                      } else if (label === 'This Weekend') {
                        updateStaged({ openHouse: true, openHouseDate: 'weekend' });
                      } else {
                        updateStaged({ openHouse: true, openHouseDate: undefined });
                      }
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      checked
                        ? 'bg-brand-dark text-white'
                        : 'bg-gray-100 text-brand-dark hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs text-brand-dark/85 mb-1 block">Or pick a date</label>
                <input
                  type="date"
                  value={staged.openHouseDate && staged.openHouseDate !== 'weekend' ? staged.openHouseDate : ''}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      updateStaged({ openHouse: true, openHouseDate: val });
                    } else {
                      updateStaged({ openHouse: false, openHouseDate: undefined });
                    }
                  }}
                  className="w-full rounded-xl px-3 py-2.5 ring-1 ring-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>
            </div>
          </FilterSection>

          {/* Amenities */}
          <FilterSection title="Amenities">
            <div className="space-y-4">
              {Object.entries(amenityGroups).map(([group, amenities]) => (
                <div key={group}>
                  <p className="text-xs font-medium text-brand-dark/60 uppercase tracking-wider mb-2">{group}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {amenities.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staged.amenities?.includes(key) ?? false}
                          onChange={() => updateStaged({ amenities: toggleArrayItem(staged.amenities, key) })}
                          className="rounded border-gray-300 text-brand-gold focus:ring-brand-gold/30"
                        />
                        <span className="text-brand-dark">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </FilterSection>
        </div>

        {/* Footer — Apply / Reset */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 py-3 text-sm font-medium text-brand-dark bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Reset All
          </button>
          <button
            onClick={handleApply}
            className={`flex-1 py-3 text-sm font-medium text-white rounded-xl transition-colors ${
              hasChanges ? 'bg-brand-dark hover:bg-brand-dark/90' : 'bg-brand-dark/70'
            }`}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-brand-dark mb-3">{title}</h3>
      {children}
    </div>
  );
}
