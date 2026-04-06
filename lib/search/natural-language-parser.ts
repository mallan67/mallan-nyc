/**
 * Natural language search parser.
 *
 * Parses queries like "2BR condo under $2M in Tribeca with doorman"
 * and maps them to SearchFilters + tab selection.
 *
 * Uses NYC dictionary for neighborhood/borough resolution, property lingo,
 * and transit matching. Keeps all original amenity/bed/bath/price/sqft patterns.
 *
 * Runs client-side — no API calls needed.
 *
 * Parse order (matters for disambiguation):
 *   1. Rent/buy intent
 *   2. "True N" bedrooms
 *   3. Lingo (before beds — "alcove studio" must match before "studio")
 *   4. Beds/baths
 *   5. Price
 *   6. Keywords (high floor, exposure, open kitchen)
 *   7. Amenities
 *   8. Neighborhoods/boroughs (before transit — "the bronx" must match before "the B")
 *   9. Transit
 *  10. Furnished, open house, sqft
 *  11. Filler word cleanup
 */

import type { SearchFilters, SearchTab, AmenityFilter } from './types';
import {
  resolveNeighborhood,
  resolveBorough,
  matchLingo,
  matchTransit,
} from './nyc-dictionary';
import type { LingoMatch } from './nyc-dictionary';

interface ParsedSearch {
  tab: SearchTab;
  filters: SearchFilters;
  neighborhood?: string;
  borough?: string;
  remainingQuery: string;
}

// ── Bedroom patterns ──
const BED_PATTERNS = [
  /(\d)\s*(?:bed(?:room)?s?|br|bd)/i,
  /studio/i,
];

// ── "True N" bedroom pattern (actual bedrooms, not flex) ──
const TRUE_BED_PATTERN = /\btrue\s+(\d)\b/i;

// ── Bathroom patterns ──
const BATH_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba)/i,
];

// ── Price patterns ──
const PRICE_PATTERNS = [
  // "under $2M", "below 2.5M", "max $3M"
  { regex: /(?:under|below|max|up\s*to|less\s*than|<)\s*\$?([\d,.]+)\s*(m(?:illion)?|k)?/i, type: 'max' as const },
  // "over $1M", "above $500K", "min $2M", "at least $1M"
  { regex: /(?:over|above|min(?:imum)?|at\s*least|more\s*than|from|starting\s*at|>)\s*\$?([\d,.]+)\s*(m(?:illion)?|k)?/i, type: 'min' as const },
  // "$1M - $3M", "$500K-$1M", "2-4M", "2M-4M"
  { regex: /\$?([\d,.]+)\s*(m(?:illion)?|k)?\s*[-–—to]+\s*\$?([\d,.]+)\s*(m(?:illion)?|k)?/i, type: 'range' as const },
  // "2M+", "$2M+" (min price with + suffix)
  { regex: /\$?([\d,.]+)\s*(m(?:illion)?|k)\s*\+/i, type: 'min' as const },
  // "$2M", "$500K" (standalone — treated as maxPrice)
  { regex: /\$\s*([\d,.]+)\s*(m(?:illion)?|k)?/i, type: 'max' as const },
];

// ── Amenity patterns (all ~45 original entries preserved) ──
const AMENITY_MAP: Record<string, AmenityFilter> = {
  'doorman': 'doorman',
  'concierge': 'doorman',
  'gym': 'gym',
  'fitness': 'gym',
  'pool': 'pool',
  'swimming': 'pool',
  'spa': 'spa',
  'sauna': 'sauna',
  'roof deck': 'roof-deck',
  'rooftop': 'roof-deck',
  'roof top': 'roof-deck',
  'laundry': 'laundry-room',
  'elevator': 'elevator',
  'bike storage': 'bike-storage',
  'bike room': 'bike-storage',
  'storage': 'storage',
  'central air': 'central-air',
  'ac': 'central-air',
  'a/c': 'central-air',
  'dishwasher': 'dishwasher',
  'washer dryer': 'washer-dryer',
  'washer/dryer': 'washer-dryer',
  'w/d': 'washer-dryer',
  'in-unit laundry': 'washer-dryer',
  'outdoor space': 'outdoor-space',
  'balcony': 'outdoor-space',
  'terrace': 'outdoor-space',
  'garden': 'outdoor-space',
  'yard': 'outdoor-space',
  'patio': 'outdoor-space',
  'garage': 'garage',
  'parking': 'garage',
  'pet friendly': 'pet-friendly',
  'pets friendly': 'pet-friendly',
  'pets allowed': 'pet-friendly',
  'pets': 'pet-friendly',
  'pet': 'pet-friendly',
  'dog friendly': 'pet-friendly',
  'cat friendly': 'pet-friendly',
  'dog': 'pet-friendly',
  'dogs': 'pet-friendly',
  'cat': 'pet-friendly',
  'cats': 'pet-friendly',
  'pets ok': 'pet-friendly',
  'park view': 'park-views',
  'park views': 'park-views',
  'river view': 'river-views',
  'river views': 'river-views',
  'water view': 'river-views',
  'skyline view': 'skyline-views',
  'skyline views': 'skyline-views',
  'city view': 'skyline-views',
  'city views': 'skyline-views',
  'playroom': 'playroom',
  "children's playroom": 'playroom',
  'lounge': 'lounge',
  'steam room': 'steam-room',
  'walk-in closet': 'walk-in-closet',
  'walk in closet': 'walk-in-closet',
  'high ceilings': 'high-ceilings',
  'high ceiling': 'high-ceilings',
  'fireplace': 'fireplace',
  'light': 'natural-light',
  'sunny': 'natural-light',
  'bright': 'natural-light',
  'views': 'views',
  'view': 'views',
  'quiet': 'quiet',
  'renovated': 'renovated',
  'new renovation': 'renovated',
  'gut renovated': 'renovated',
  'move-in ready': 'renovated',
  'move in ready': 'renovated',
  // no-fee and no broker fee are handled by lingo (matchLingo) — kept here
  // as fallback in case lingo doesn't catch them
  'no fee': 'no-fee',
  'no broker fee': 'no-fee',
};

// ── Keyword patterns (matched as keywords for PublicRemarks text search) ──
const KEYWORD_PATTERNS: { regex: RegExp; keyword: string }[] = [
  { regex: /\bhigh\s+floor\b/i, keyword: 'high floor' },
  { regex: /\blow\s+floor\b/i, keyword: 'low floor' },
  { regex: /\b(?:south|southern)\s+(?:facing|exposure)\b/i, keyword: 'south facing' },
  { regex: /\b(?:north|northern)\s+(?:facing|exposure)\b/i, keyword: 'north facing' },
  { regex: /\b(?:east|eastern)\s+(?:facing|exposure)\b/i, keyword: 'east facing' },
  { regex: /\b(?:west|western)\s+(?:facing|exposure)\b/i, keyword: 'west facing' },
  { regex: /\bopen\s+kitchen\b/i, keyword: 'open kitchen' },
];

// ── Rent/buy intent ──
const RENT_PATTERNS = /\b(?:rent(?:al)?s?|renting|lease|leasing|for\s+rent)\b/i;
const BUY_PATTERNS = /\b(?:buy(?:ing)?|purchase|for\s+sale|sale)\b/i;

function parsePrice(numStr: string, suffix?: string): number {
  const num = parseFloat(numStr.replace(/,/g, ''));
  if (!suffix) return num;
  const s = suffix.toLowerCase();
  if (s.startsWith('m')) return num * 1_000_000;
  if (s === 'k') return num * 1_000;
  return num;
}

/**
 * Add a value to filters.keywords, deduplicating.
 */
function addKeyword(filters: SearchFilters, keyword: string): void {
  if (!filters.keywords) filters.keywords = [];
  if (!filters.keywords.includes(keyword)) {
    filters.keywords.push(keyword);
  }
}

/**
 * Add a value to filters.propertySubTypes, deduplicating.
 */
function addPropertySubType(filters: SearchFilters, value: string): void {
  if (!filters.propertySubTypes) filters.propertySubTypes = [];
  if (!filters.propertySubTypes.includes(value)) {
    filters.propertySubTypes.push(value);
  }
}

/**
 * Add an amenity to filters.amenities, deduplicating.
 */
function addAmenity(filters: SearchFilters, amenity: AmenityFilter): void {
  if (!filters.amenities) filters.amenities = [];
  if (!filters.amenities.includes(amenity)) {
    filters.amenities.push(amenity);
  }
}

/**
 * Apply a lingo match to the appropriate filter field.
 */
function applyLingoMatch(filters: SearchFilters, match: LingoMatch): void {
  switch (match.filterKey) {
    case 'propertySubTypes':
      addPropertySubType(filters, match.filterValue as string);
      break;
    case 'ownershipTypes':
      if (!filters.ownershipTypes) filters.ownershipTypes = [];
      if (!filters.ownershipTypes.includes(match.filterValue as string)) {
        filters.ownershipTypes.push(match.filterValue as string);
      }
      break;
    case 'yearBuilt':
      filters.yearBuilt = match.filterValue as 'pre-war' | 'post-war';
      break;
    case 'amenities':
      // "no-fee" from lingo → add to amenities
      addAmenity(filters, match.filterValue as AmenityFilter);
      break;
    case 'furnished':
      filters.furnished = true;
      break;
    case 'keywords':
      addKeyword(filters, match.filterValue as string);
      break;
    default:
      break;
  }
}

export function parseNaturalLanguageSearch(query: string): ParsedSearch {
  const filters: SearchFilters = {};
  let remaining = query;
  let tab: SearchTab = 'buy-residential';

  // ── 1. Detect rent vs buy ──
  if (RENT_PATTERNS.test(query)) {
    tab = 'rent-residential';
    remaining = remaining.replace(RENT_PATTERNS, '');
  } else if (BUY_PATTERNS.test(query)) {
    tab = 'buy-residential';
    remaining = remaining.replace(BUY_PATTERNS, '');
  }

  // ── 2. "True N" bedrooms (actual bedrooms, not flex — store as keyword + beds) ──
  const trueBedMatch = remaining.match(TRUE_BED_PATTERN);
  if (trueBedMatch) {
    filters.beds = parseInt(trueBedMatch[1]);
    addKeyword(filters, `true ${trueBedMatch[1]}`);
    remaining = remaining.replace(trueBedMatch[0], '');
  }

  // ── 3. NYC Property Lingo (via dictionary) — BEFORE beds ──
  // Must run before bed parsing so "alcove studio" is matched as a layout type,
  // not as "studio" (0 beds). Also handles: jr4, flex 2/3, sponsor unit, condo,
  // co-op, prewar/postwar, brownstone, townhouse, penthouse, no fee, furnished, walk-up.
  const lingoResult = matchLingo(remaining);
  for (const match of lingoResult.matches) {
    applyLingoMatch(filters, match);
  }
  remaining = lingoResult.remainder;

  // ── 4. Bedrooms (skip if "true N" already set beds) ──
  if (filters.beds == null) {
    if (/\bstudio\b/i.test(remaining)) {
      filters.beds = 0;
      remaining = remaining.replace(/\bstudio\b/i, '');
    } else {
      const bedMatch = remaining.match(BED_PATTERNS[0]);
      if (bedMatch) {
        filters.beds = parseInt(bedMatch[1]);
        remaining = remaining.replace(bedMatch[0], '');
      }
    }
  }

  // ── 4b. Bathrooms ──
  const bathMatch = remaining.match(BATH_PATTERNS[0]);
  if (bathMatch) {
    filters.baths = parseFloat(bathMatch[1]);
    remaining = remaining.replace(bathMatch[0], '');
  }

  // ── 5. Price (range first, then individual) ──
  for (const pp of PRICE_PATTERNS) {
    const match = remaining.match(pp.regex);
    if (match) {
      if (pp.type === 'range') {
        // For ranges like "2-4M", if first number has no suffix but second does,
        // inherit the second suffix for both (NYC shorthand: "2-4M" means $2M-$4M)
        const suffix1 = match[2];
        const suffix2 = match[4];
        const effectiveSuffix1 = suffix1 || suffix2;
        filters.minPrice = parsePrice(match[1], effectiveSuffix1);
        filters.maxPrice = parsePrice(match[3], suffix2);
      } else if (pp.type === 'max') {
        filters.maxPrice = parsePrice(match[1], match[2]);
      } else if (pp.type === 'min') {
        filters.minPrice = parsePrice(match[1], match[2]);
      }
      remaining = remaining.replace(match[0], '');
      break; // Only match first price pattern
    }
  }

  // ── 6. Keyword patterns (high floor, exposure, open kitchen) ──
  for (const kp of KEYWORD_PATTERNS) {
    if (kp.regex.test(remaining)) {
      addKeyword(filters, kp.keyword);
      remaining = remaining.replace(kp.regex, '');
    }
  }

  // ── 7. Amenities (match longer phrases first) ──
  // These map to Trestle multi-value picklist fields (BuildingFeatures, etc.)
  const sortedAmenityKeys = Object.keys(AMENITY_MAP).sort((a, b) => b.length - a.length);
  for (const pattern of sortedAmenityKeys) {
    const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(remaining)) {
      const amenity = AMENITY_MAP[pattern];
      addAmenity(filters, amenity);
      remaining = remaining.replace(regex, '');
    }
  }

  // ── 8. Neighborhoods (via dictionary) — BEFORE transit ──
  // Must resolve neighborhoods/boroughs before transit to prevent false positives
  // (e.g., "the bronx" being parsed as "the B" subway line).
  //
  // Strategy: try every contiguous substring of words (longest first) against resolveNeighborhood.
  // This catches multi-word names ("upper east side", "park slope") and abbreviations ("UES", "HK").
  let matchedNeighborhood: string | undefined;
  let matchedBorough: string | undefined;

  const words = remaining.split(/\s+/).filter(w => w.length > 0);
  let neighborhoodFound = false;

  // Try longest possible phrases first (up to 5 words)
  for (let len = Math.min(5, words.length); len >= 1 && !neighborhoodFound; len--) {
    for (let start = 0; start <= words.length - len && !neighborhoodFound; start++) {
      const phrase = words.slice(start, start + len).join(' ');
      const resolved = resolveNeighborhood(phrase);
      if (resolved) {
        // For multi-word phrases, only accept exact or alias matches.
        // Fuzzy matches on multi-word phrases cause false positives
        // (e.g., "L williamsburg" fuzzy-matching to "Williamsburg").
        if (len > 1 && resolved.matchType === 'fuzzy') continue;
        matchedNeighborhood = resolved.canonical;
        matchedBorough = resolved.borough;
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        remaining = remaining.replace(regex, '');
        neighborhoodFound = true;
      }
    }
  }

  // ── 8b. Borough (via dictionary — only if no neighborhood was matched) ──
  if (!matchedNeighborhood) {
    const boroughWords = remaining.split(/\s+/).filter(w => w.length > 0);
    for (let len = Math.min(3, boroughWords.length); len >= 1; len--) {
      let boroughFound = false;
      for (let start = 0; start <= boroughWords.length - len; start++) {
        const phrase = boroughWords.slice(start, start + len).join(' ');
        const resolved = resolveBorough(phrase);
        if (resolved) {
          matchedBorough = resolved;
          const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          remaining = remaining.replace(regex, '');
          boroughFound = true;
          break;
        }
      }
      if (boroughFound) break;
    }
  }

  // ── 9. Transit (via dictionary) — AFTER neighborhoods/boroughs ──
  const transitResult = matchTransit(remaining);
  if (transitResult.match) {
    filters.transit = {
      line: transitResult.match.lines.join('/') || 'subway',
      label: transitResult.match.label,
    };
    remaining = transitResult.remainder;
  }

  // ── 10. Furnished (fallback — lingo may have already set it) ──
  if (!filters.furnished && /\bfurnished\b/i.test(remaining)) {
    filters.furnished = true;
    remaining = remaining.replace(/\bfurnished\b/i, '');
  }

  // ── Open house ──
  if (/\bopen\s*house\b/i.test(remaining)) {
    filters.openHouse = true;
    remaining = remaining.replace(/\bopen\s*house\b/i, '');
  }

  // ── Sqft ──
  const sqftMatch = remaining.match(/(\d{3,5})\+?\s*(?:sq\s*ft|sf|square\s*feet)/i);
  if (sqftMatch) {
    filters.minSqft = parseInt(sqftMatch[1]);
    remaining = remaining.replace(sqftMatch[0], '');
  }

  // ── 11. Clean up remaining ──
  remaining = remaining
    .replace(/\b(?:in|with|and|near|on|at|the|a|an|for|that|has|have|having)\b/gi, '')
    .replace(/[,;.!?]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    tab,
    filters,
    neighborhood: matchedNeighborhood,
    borough: matchedBorough,
    remainingQuery: remaining,
  };
}
