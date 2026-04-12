'use client';

import type { SearchFilters, AmenityFilter } from '@/lib/search/types';
import { AMENITY_FIELD_MAP } from '@/lib/search/types';

/* ──────────────────────────────────────────────
 * FilterChip — describes one removable pill
 * ────────────────────────────────────────────── */
export interface FilterChip {
  id: string;
  label: string;
  type:
    | 'neighborhood'
    | 'borough'
    | 'beds'
    | 'baths'
    | 'price'
    | 'amenity'
    | 'property'
    | 'keyword'
    | 'transit'
    | 'yearBuilt'
    | 'other';
  filterKey: string;
  filterValue?: string | number | boolean;
}

/* ──────────────────────────────────────────────
 * Color map — Tailwind classes per chip type
 * ────────────────────────────────────────────── */
const CHIP_COLORS: Record<FilterChip['type'], string> = {
  neighborhood: 'bg-brand-gold/15 text-brand-gold-deep border-brand-gold/30',
  borough:      'bg-brand-gold/15 text-brand-gold-deep border-brand-gold/30',
  beds:         'bg-blue-50 text-blue-700 border-blue-200',
  baths:        'bg-blue-50 text-blue-700 border-blue-200',
  price:        'bg-blue-50 text-blue-700 border-blue-200',
  amenity:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  property:     'bg-violet-50 text-violet-700 border-violet-200',
  keyword:      'bg-gray-100 text-gray-600 border-gray-200',
  transit:      'bg-orange-50 text-orange-700 border-orange-200',
  yearBuilt:    'bg-amber-50 text-amber-700 border-amber-200',
  other:        'bg-gray-100 text-gray-600 border-gray-200',
};

/* ──────────────────────────────────────────────
 * Price formatting — compact US-style
 *   2500000 → "$2.5M"
 *   750000  → "$750K"
 *   3000    → "$3K"
 * ────────────────────────────────────────────── */
function fmtPrice(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    // Show one decimal unless it's a round million
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${n.toLocaleString('en-US')}`;
}

/* ──────────────────────────────────────────────
 * buildChips — derive chip list from active filters
 * ────────────────────────────────────────────── */
export function buildChips(
  filters: SearchFilters,
  neighborhoods: string[],
  borough?: string,
): FilterChip[] {
  const chips: FilterChip[] = [];

  // Borough
  if (borough) {
    chips.push({
      id: `borough-${borough}`,
      label: borough,
      type: 'borough',
      filterKey: 'borough',
      filterValue: borough,
    });
  }

  // Neighborhoods (each gets its own chip)
  for (const n of neighborhoods) {
    chips.push({
      id: `neighborhood-${n}`,
      label: n,
      type: 'neighborhood',
      filterKey: 'neighborhoods',
      filterValue: n,
    });
  }

  // Beds (range)
  if (filters.beds != null || filters.maxBeds != null) {
    const min = filters.beds;
    const max = filters.maxBeds;
    const bedLabel = (v: number) => v === 0 ? 'Studio' : String(v);
    let label: string;
    if (min != null && max != null) {
      label = min === max ? `${bedLabel(min)} Bed` : `${bedLabel(min)}–${bedLabel(max)} Beds`;
    } else if (min != null) {
      label = `${bedLabel(min)}+ Beds`;
    } else {
      label = `≤${bedLabel(max!)} Beds`;
    }
    chips.push({ id: `beds-${min}-${max}`, label, type: 'beds', filterKey: 'beds', filterValue: min ?? max ?? undefined });
  }

  // Baths (range)
  if (filters.baths != null || filters.maxBaths != null) {
    const min = filters.baths;
    const max = filters.maxBaths;
    let label: string;
    if (min != null && max != null) {
      label = min === max ? `${min} Bath` : `${min}–${max} Baths`;
    } else if (min != null) {
      label = `${min}+ Baths`;
    } else {
      label = `≤${max} Baths`;
    }
    chips.push({ id: `baths-${min}-${max}`, label, type: 'baths', filterKey: 'baths', filterValue: min ?? max ?? undefined });
  }

  // Price range
  if (filters.minPrice != null && filters.maxPrice != null) {
    chips.push({
      id: 'price-range',
      label: `${fmtPrice(filters.minPrice)} – ${fmtPrice(filters.maxPrice)}`,
      type: 'price',
      filterKey: 'price',
    });
  } else if (filters.minPrice != null) {
    chips.push({
      id: 'price-min',
      label: `${fmtPrice(filters.minPrice)}+`,
      type: 'price',
      filterKey: 'minPrice',
      filterValue: filters.minPrice,
    });
  } else if (filters.maxPrice != null) {
    chips.push({
      id: 'price-max',
      label: `Under ${fmtPrice(filters.maxPrice)}`,
      type: 'price',
      filterKey: 'maxPrice',
      filterValue: filters.maxPrice,
    });
  }

  // Property sub-types
  if (filters.propertySubTypes?.length) {
    for (const pt of filters.propertySubTypes) {
      chips.push({
        id: `property-${pt}`,
        label: pt,
        type: 'property',
        filterKey: 'propertySubTypes',
        filterValue: pt,
      });
    }
  }

  // Year built
  if (filters.yearBuilt && filters.yearBuilt !== 'any') {
    const label = filters.yearBuilt === 'pre-war' ? 'Pre-War' : 'Post-War';
    chips.push({
      id: `yearBuilt-${filters.yearBuilt}`,
      label,
      type: 'yearBuilt',
      filterKey: 'yearBuilt',
      filterValue: filters.yearBuilt,
    });
  }

  // Amenities
  if (filters.amenities?.length) {
    for (const a of filters.amenities) {
      const meta = AMENITY_FIELD_MAP[a as AmenityFilter];
      chips.push({
        id: `amenity-${a}`,
        label: meta?.label ?? a,
        type: 'amenity',
        filterKey: 'amenities',
        filterValue: a,
      });
    }
  }

  // Keywords
  if (filters.keywords?.length) {
    for (const kw of filters.keywords) {
      chips.push({
        id: `keyword-${kw}`,
        label: kw.charAt(0).toUpperCase() + kw.slice(1),
        type: 'keyword',
        filterKey: 'keywords',
        filterValue: kw,
      });
    }
  }

  // Transit
  if (filters.transit) {
    chips.push({
      id: `transit-${filters.transit.line}`,
      label: filters.transit.label,
      type: 'transit',
      filterKey: 'transit',
      filterValue: filters.transit.line,
    });
  }

  // Furnished
  if (filters.furnished) {
    chips.push({
      id: 'furnished',
      label: 'Furnished',
      type: 'other',
      filterKey: 'furnished',
      filterValue: true,
    });
  }

  // Open House
  if (filters.openHouse) {
    chips.push({
      id: 'openHouse',
      label: filters.openHouseDate
        ? `Open House ${new Date(filters.openHouseDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'Open House',
      type: 'other',
      filterKey: 'openHouse',
      filterValue: true,
    });
  }

  return chips;
}

/* ──────────────────────────────────────────────
 * SearchChips — the rendered chip bar
 * ────────────────────────────────────────────── */
interface SearchChipsProps {
  chips: FilterChip[];
  onRemove: (chip: FilterChip) => void;
  onClearAll: () => void;
  total?: number;
}

export default function SearchChips({ chips, onRemove, onClearAll, total }: SearchChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Chips */}
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${CHIP_COLORS[chip.type]}`}
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip)}
            className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-black/10 transition-colors"
            aria-label={`Remove ${chip.label} filter`}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0">
              <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}

      {/* Clear all — shown when 2+ chips */}
      {chips.length >= 2 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-1.5 py-1"
        >
          Clear all
        </button>
      )}

      {/* Result count — right-aligned */}
      {total != null && (
        <span className="ml-auto text-xs text-gray-400 tabular-nums whitespace-nowrap">
          {total.toLocaleString('en-US')} result{total !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
