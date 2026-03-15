/**
 * Natural language search parser.
 *
 * Parses queries like "2BR condo under $2M in Tribeca with doorman"
 * and maps them to SearchFilters + tab selection.
 *
 * Runs client-side — no API calls needed.
 */

import type { SearchFilters, SearchTab, AmenityFilter } from './types';

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
  // "$1M - $3M", "$500K-$1M"
  { regex: /\$?([\d,.]+)\s*(m(?:illion)?|k)?\s*[-–—to]+\s*\$?([\d,.]+)\s*(m(?:illion)?|k)?/i, type: 'range' as const },
  // "$2M", "$500K" (standalone — treated as maxPrice)
  { regex: /\$\s*([\d,.]+)\s*(m(?:illion)?|k)?/i, type: 'max' as const },
];

// ── Property type patterns ──
const PROPERTY_TYPE_MAP: Record<string, string[]> = {
  'condo': ['Condo'],
  'condop': ['Condop'],
  'co-op': ['Co-op'],
  'coop': ['Co-op'],
  'co op': ['Co-op'],
  'townhouse': ['Townhouse'],
  'town house': ['Townhouse'],
  'brownstone': ['Townhouse'],
  'loft': ['Loft'],
  'duplex': ['Duplex'],
  'triplex': ['Triplex'],
  'multi-family': ['Multi-Family'],
  'multifamily': ['Multi-Family'],
  'single family': ['Single Family'],
  'house': ['Single Family', 'Townhouse'],
  'new development': ['New Development'],
  'new construction': ['New Development'],
  'prewar': [],
  'pre-war': [],
  'postwar': [],
  'post-war': [],
};

// ── Amenity patterns ──
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
  'dogs': 'pet-friendly',
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
  'no fee': 'no-fee',
  'no broker fee': 'no-fee',
};

// ── NYC neighborhoods (lowercased for matching) ──
const NEIGHBORHOODS = [
  'battery park city', 'chelsea', 'chinatown', 'east harlem', 'east village',
  'financial district', 'fidi', 'flatiron', 'gramercy', 'greenwich village',
  'harlem', 'hells kitchen', "hell's kitchen", 'hudson yards', 'kips bay',
  'les', 'lower east side', 'lower manhattan', 'midtown', 'midtown east',
  'midtown west', 'morningside heights', 'murray hill', 'noho', 'nolita',
  'roosevelt island', 'soho', 'stuyvesant town', 'tribeca', 'upper east side',
  'ues', 'upper west side', 'uws', 'washington heights', 'west village',
  'inwood', 'marble hill', 'two bridges',
  // Brooklyn
  'bed-stuy', 'bedford-stuyvesant', 'boerum hill', 'brooklyn heights',
  'bushwick', 'carroll gardens', 'clinton hill', 'cobble hill', 'crown heights',
  'ditmas park', 'downtown brooklyn', 'dumbo', 'dyker heights', 'flatbush',
  'fort greene', 'gowanus', 'greenpoint', 'park slope', 'prospect heights',
  'red hook', 'sunset park', 'williamsburg', 'windsor terrace',
  // Queens
  'astoria', 'forest hills', 'jackson heights', 'lic', 'long island city',
  'sunnyside', 'flushing', 'bayside',
  // Bronx
  'riverdale', 'mott haven',
];

const BOROUGHS = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten island'];

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

export function parseNaturalLanguageSearch(query: string): ParsedSearch {
  const filters: SearchFilters = {};
  let remaining = query;
  let tab: SearchTab = 'buy-residential';

  // ── Detect rent vs buy ──
  if (RENT_PATTERNS.test(query)) {
    tab = 'rent-residential';
    remaining = remaining.replace(RENT_PATTERNS, '');
  } else if (BUY_PATTERNS.test(query)) {
    tab = 'buy-residential';
    remaining = remaining.replace(BUY_PATTERNS, '');
  }

  // ── Bedrooms ──
  if (/studio/i.test(remaining)) {
    filters.beds = 0;
    remaining = remaining.replace(/studio/i, '');
  } else {
    const bedMatch = remaining.match(BED_PATTERNS[0]);
    if (bedMatch) {
      filters.beds = parseInt(bedMatch[1]);
      remaining = remaining.replace(bedMatch[0], '');
    }
  }

  // ── Bathrooms ──
  const bathMatch = remaining.match(BATH_PATTERNS[0]);
  if (bathMatch) {
    filters.baths = parseFloat(bathMatch[1]);
    remaining = remaining.replace(bathMatch[0], '');
  }

  // ── Price (range first, then individual) ──
  for (const pp of PRICE_PATTERNS) {
    const match = remaining.match(pp.regex);
    if (match) {
      if (pp.type === 'range') {
        filters.minPrice = parsePrice(match[1], match[2]);
        filters.maxPrice = parsePrice(match[3], match[4]);
      } else if (pp.type === 'max') {
        filters.maxPrice = parsePrice(match[1], match[2]);
      } else if (pp.type === 'min') {
        filters.minPrice = parsePrice(match[1], match[2]);
      }
      remaining = remaining.replace(match[0], '');
      break; // Only match first price pattern
    }
  }

  // ── Property types ──
  const matchedSubTypes: string[] = [];
  for (const [pattern, types] of Object.entries(PROPERTY_TYPE_MAP)) {
    const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(remaining)) {
      matchedSubTypes.push(...types);
      remaining = remaining.replace(regex, '');
      // Handle pre-war/post-war
      if (pattern === 'prewar' || pattern === 'pre-war') filters.yearBuilt = 'pre-war';
      if (pattern === 'postwar' || pattern === 'post-war') filters.yearBuilt = 'post-war';
    }
  }
  if (matchedSubTypes.length > 0) {
    filters.propertySubTypes = [...new Set(matchedSubTypes)];
  }

  // ── Amenities (match longer phrases first) ──
  const matchedAmenities: AmenityFilter[] = [];
  const sortedAmenityKeys = Object.keys(AMENITY_MAP).sort((a, b) => b.length - a.length);
  for (const pattern of sortedAmenityKeys) {
    const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(remaining)) {
      const amenity = AMENITY_MAP[pattern];
      if (!matchedAmenities.includes(amenity)) {
        matchedAmenities.push(amenity);
      }
      remaining = remaining.replace(regex, '');
    }
  }
  if (matchedAmenities.length > 0) {
    filters.amenities = matchedAmenities;
  }

  // ── Neighborhoods (match longer names first) ──
  let matchedNeighborhood: string | undefined;
  let matchedBorough: string | undefined;
  const lowerRemaining = remaining.toLowerCase();

  const sortedNeighborhoods = [...NEIGHBORHOODS].sort((a, b) => b.length - a.length);
  for (const n of sortedNeighborhoods) {
    if (lowerRemaining.includes(n)) {
      matchedNeighborhood = n;
      // Map abbreviations to full names
      if (n === 'ues') matchedNeighborhood = 'upper east side';
      if (n === 'uws') matchedNeighborhood = 'upper west side';
      if (n === 'les') matchedNeighborhood = 'lower east side';
      if (n === 'fidi') matchedNeighborhood = 'financial district';
      if (n === 'lic') matchedNeighborhood = 'long island city';
      // Title case
      matchedNeighborhood = matchedNeighborhood.replace(/\b\w/g, (c) => c.toUpperCase());
      const regex = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      remaining = remaining.replace(regex, '');
      break;
    }
  }

  if (!matchedNeighborhood) {
    for (const b of BOROUGHS) {
      if (lowerRemaining.includes(b)) {
        matchedBorough = b.replace(/\b\w/g, (c) => c.toUpperCase());
        const regex = new RegExp(`\\b${b}\\b`, 'i');
        remaining = remaining.replace(regex, '');
        break;
      }
    }
  }

  // ── Furnished ──
  if (/\bfurnished\b/i.test(remaining)) {
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

  // Clean up remaining
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
