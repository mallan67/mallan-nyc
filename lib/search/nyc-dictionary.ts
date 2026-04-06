/**
 * NYC Dictionary — Knowledge base for NYC search intelligence.
 *
 * Pure data + lookup module. No React, no Node APIs, runs in browser.
 *
 * Exports:
 *   resolveNeighborhood(input) — exact alias + fuzzy matching
 *   resolveBorough(input) — borough alias resolution
 *   matchLingo(text) — NYC property lingo (jr4, sponsor unit, etc.)
 *   matchTransit(text) — subway line/service detection
 *   getSuggestions(input, limit) — autocomplete suggestions
 *
 * REBNY COMPLIANCE:
 *   - NO protected class terms (Fair Housing Act 42 USC 3604(c), NY HRL, NYC HRL Title 8)
 *   - Neighborhood filters are geographic only (permitted under Fair Housing Section 4.5)
 *   - No "off-market" language (REBNY + NY DOS advertising rules)
 *   - No compensation/commission terms
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedNeighborhood {
  /** Canonical name (exact match to borough JSON data files) */
  canonical: string;
  /** Borough the neighborhood belongs to */
  borough: string;
  /** How the match was made */
  matchType: 'exact' | 'alias' | 'fuzzy';
  /** Levenshtein distance (0 for exact/alias, >0 for fuzzy) */
  distance: number;
}

export interface LingoMatch {
  /** The original text that was matched */
  matched: string;
  /** Category of the match */
  type: 'layout' | 'ownership' | 'year-built' | 'rental';
  /** Which SearchFilters key to set */
  filterKey: string;
  /** The value to set */
  filterValue: string | boolean | number;
  /** Human-readable label for display chips */
  label: string;
}

export interface TransitMatch {
  /** The original text that was matched */
  matched: string;
  /** Subway line(s) detected */
  lines: string[];
  /** Human-readable label */
  label: string;
}

export type SuggestionType = 'neighborhood' | 'borough' | 'lingo' | 'transit';

export interface DictionarySuggestion {
  type: SuggestionType;
  /** Display text for dropdown */
  label: string;
  /** Value to use when selected */
  value: string;
  /** Extra context (borough for neighborhoods, category for lingo) */
  context?: string;
}

// ─── Borough Data ────────────────────────────────────────────────────────────

/**
 * Canonical neighborhood names per borough.
 * MUST match exactly what's in data/{borough}-neighborhoods.json.
 */
const BOROUGH_NEIGHBORHOODS: Record<string, string[]> = {
  Manhattan: [
    'Upper East Side', 'Upper West Side', 'Tribeca', 'SoHo', 'Chelsea',
    'Financial District', 'Greenwich Village', 'Midtown East', "Hell's Kitchen",
    'East Village', 'Lower East Side', 'Harlem', 'NoMad', 'Flatiron',
    'Gramercy', 'Battery Park City', 'Hudson Yards', 'Midtown West',
    'West Village', 'Nolita', 'NoHo', 'Little Italy', 'Chinatown',
    'Washington Heights', 'Inwood', 'Murray Hill', 'Kips Bay', 'Sutton Place',
    'Morningside Heights', 'East Harlem', 'Roosevelt Island', 'Yorkville',
    'Two Bridges',
  ],
  Brooklyn: [
    'Brooklyn Heights', 'Williamsburg', 'DUMBO', 'Park Slope', 'Cobble Hill',
    'Carroll Gardens', 'Fort Greene', 'Prospect Heights', 'Greenpoint', 'Bed-Stuy',
  ],
  Queens: [
    'Astoria', 'Long Island City', 'Jackson Heights', 'Flushing',
    'Forest Hills', 'Sunnyside', 'Bayside',
  ],
  Bronx: [
    'Riverdale', 'City Island', 'Mott Haven', 'Pelham Bay', 'Fordham',
  ],
  'Staten Island': [
    'St. George', 'Todt Hill', 'Great Kills', 'New Brighton',
  ],
};

/** Flat lookup: canonical name (lowercased) -> { canonical, borough } */
const CANONICAL_LOOKUP = new Map<string, { canonical: string; borough: string }>();
for (const [borough, neighborhoods] of Object.entries(BOROUGH_NEIGHBORHOODS)) {
  for (const name of neighborhoods) {
    CANONICAL_LOOKUP.set(name.toLowerCase(), { canonical: name, borough });
  }
}

/** All canonical names for fuzzy matching */
const ALL_CANONICAL_NAMES = Array.from(CANONICAL_LOOKUP.values()).map(v => v.canonical);

// ─── Neighborhood Alias Map ─────────────────────────────────────────────────

/**
 * Maps NYC abbreviations, slang, and common misspellings to canonical names.
 * ~120+ entries. Keys are lowercased for matching.
 */
const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  // ── Manhattan ──
  'ues': 'Upper East Side',
  'uws': 'Upper West Side',
  'upper east': 'Upper East Side',
  'upper west': 'Upper West Side',
  'les': 'Lower East Side',
  'fidi': 'Financial District',
  'fi di': 'Financial District',
  'fin district': 'Financial District',
  'wall street': 'Financial District',
  'wall st': 'Financial District',
  'hk': "Hell's Kitchen",
  'hells kitchen': "Hell's Kitchen",
  'hell\'s kitchen': "Hell's Kitchen",
  'clinton': "Hell's Kitchen",
  'ev': 'East Village',
  'e village': 'East Village',
  'east vil': 'East Village',
  'wv': 'West Village',
  'w village': 'West Village',
  'west vil': 'West Village',
  'the village': 'Greenwich Village',
  'gv': 'Greenwich Village',
  'g village': 'Greenwich Village',
  'greenich village': 'Greenwich Village',
  'greenwich': 'Greenwich Village',
  'bpc': 'Battery Park City',
  'battery park': 'Battery Park City',
  'hy': 'Hudson Yards',
  'muhi': 'Murray Hill',
  'mu hi': 'Murray Hill',
  'gram': 'Gramercy',
  'gramercy park': 'Gramercy',
  'flatiron district': 'Flatiron',
  'nomad': 'NoMad',
  'no mad': 'NoMad',
  'noho': 'NoHo',
  'no ho': 'NoHo',
  'nolita': 'Nolita',
  'no li ta': 'Nolita',
  'soho': 'SoHo',
  'so ho': 'SoHo',
  'tribeca': 'Tribeca',
  'tribecca': 'Tribeca',
  'tri beca': 'Tribeca',
  'tribbeca': 'Tribeca',
  'midtown e': 'Midtown East',
  'midtown w': 'Midtown West',
  'east midtown': 'Midtown East',
  'west midtown': 'Midtown West',
  'little italy': 'Little Italy',
  'little italy nyc': 'Little Italy',
  'chinatown': 'Chinatown',
  'c-town': 'Chinatown',
  'wash heights': 'Washington Heights',
  'wahi': 'Washington Heights',
  'wa hi': 'Washington Heights',
  'washington hts': 'Washington Heights',
  'the heights': 'Washington Heights',
  'kips': 'Kips Bay',
  'kipsbay': 'Kips Bay',
  'sutton': 'Sutton Place',
  'morningside': 'Morningside Heights',
  'mhts': 'Morningside Heights',
  'el barrio': 'East Harlem',
  'spanish harlem': 'East Harlem',
  'east harlem': 'East Harlem',
  'e harlem': 'East Harlem',
  'ri': 'Roosevelt Island',
  'roosevelt': 'Roosevelt Island',
  'yorkville': 'Yorkville',
  'two bridges': 'Two Bridges',
  '2 bridges': 'Two Bridges',

  // ── Brooklyn ──
  'wburg': 'Williamsburg',
  'wbg': 'Williamsburg',
  'billyburg': 'Williamsburg',
  'w-burg': 'Williamsburg',
  'williamsburg': 'Williamsburg',
  'willamsburg': 'Williamsburg',
  'williamsburgh': 'Williamsburg',
  'bk heights': 'Brooklyn Heights',
  'bklyn heights': 'Brooklyn Heights',
  'brooklyn hts': 'Brooklyn Heights',
  'dumbo': 'DUMBO',
  'park slope': 'Park Slope',
  'the slope': 'Park Slope',
  'south slope': 'Park Slope',
  'cobble': 'Cobble Hill',
  'bococa': 'Cobble Hill',
  'bococar': 'Cobble Hill',
  'carroll gdns': 'Carroll Gardens',
  'carroll': 'Carroll Gardens',
  'fort greene': 'Fort Greene',
  'ft greene': 'Fort Greene',
  'prospect hts': 'Prospect Heights',
  'prospect heights': 'Prospect Heights',
  'procro': 'Prospect Heights',
  'gpoint': 'Greenpoint',
  'g point': 'Greenpoint',
  'greenpt': 'Greenpoint',
  'bedstuy': 'Bed-Stuy',
  'bed stuy': 'Bed-Stuy',
  'bed-stuy': 'Bed-Stuy',
  'bed-stuyvesant': 'Bed-Stuy',
  'bedford stuyvesant': 'Bed-Stuy',
  'bedford-stuyvesant': 'Bed-Stuy',

  // ── Queens ──
  'lic': 'Long Island City',
  'l.i.c.': 'Long Island City',
  'long island city': 'Long Island City',
  'astoria': 'Astoria',
  'ditmars': 'Astoria',
  'steinway': 'Astoria',
  'jax heights': 'Jackson Heights',
  'jackson hts': 'Jackson Heights',
  'forest hills': 'Forest Hills',
  'fh': 'Forest Hills',
  'flushing': 'Flushing',
  'sunnyside': 'Sunnyside',

  // ── Bronx ──
  'sobronya': 'Mott Haven',
  'south bronx': 'Mott Haven',
  'sobro': 'Mott Haven',
  'mott haven': 'Mott Haven',
  'riverdale': 'Riverdale',
  'city island': 'City Island',
  'ci': 'City Island',
  'pelham': 'Pelham Bay',
  'pelham bay': 'Pelham Bay',

  // ── Staten Island ──
  'st george': 'St. George',
  'st. george': 'St. George',
  'saint george': 'St. George',
  'todt hill': 'Todt Hill',
  'great kills': 'Great Kills',
  'new brighton': 'New Brighton',
};

/** Lowercased alias lookup */
const ALIAS_LOOKUP = new Map<string, string>();
for (const [alias, canonical] of Object.entries(NEIGHBORHOOD_ALIASES)) {
  ALIAS_LOOKUP.set(alias.toLowerCase(), canonical);
}

// ─── Borough Alias Map ───────────────────────────────────────────────────────

const BOROUGH_ALIASES: Record<string, string> = {
  'manhattan': 'Manhattan',
  'bk': 'Brooklyn',
  'bklyn': 'Brooklyn',
  'brooklyn': 'Brooklyn',
  'queens': 'Queens',
  'qns': 'Queens',
  'bronx': 'Bronx',
  'bx': 'Bronx',
  'the bronx': 'Bronx',
  'si': 'Staten Island',
  'staten island': 'Staten Island',
  'staten': 'Staten Island',
};

// ─── NYC Property Lingo Map ──────────────────────────────────────────────────

interface LingoEntry {
  type: LingoMatch['type'];
  filterKey: string;
  filterValue: string | boolean | number;
  label: string;
}

/**
 * NYC property lingo. Keys are lowercased, sorted longest-first during matching.
 */
const LINGO_MAP: Record<string, LingoEntry> = {
  // ── Layout ──
  'junior 4': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Jr. 4', label: 'Junior 4' },
  'jr4': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Jr. 4', label: 'Junior 4' },
  'jr 4': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Jr. 4', label: 'Junior 4' },
  'junior four': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Jr. 4', label: 'Junior 4' },
  'flex 2': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Flex 2', label: 'Flex 2' },
  'flex 3': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Flex 3', label: 'Flex 3' },
  'flex two': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Flex 2', label: 'Flex 2' },
  'flex three': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Flex 3', label: 'Flex 3' },
  'alcove studio': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Alcove Studio', label: 'Alcove Studio' },
  'railroad': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Railroad', label: 'Railroad' },
  'railroad apartment': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Railroad', label: 'Railroad' },
  'penthouse': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Penthouse', label: 'Penthouse' },
  'ph': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Penthouse', label: 'Penthouse' },
  'garden apartment': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Garden', label: 'Garden Apartment' },
  'garden apt': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Garden', label: 'Garden Apartment' },
  'maisonette': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Maisonette', label: 'Maisonette' },
  'convertible': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Convertible', label: 'Convertible' },
  'loft': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Loft', label: 'Loft' },
  'duplex': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Duplex', label: 'Duplex' },
  'triplex': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Triplex', label: 'Triplex' },

  // ── Ownership ──
  'sponsor unit': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Sponsor Unit', label: 'Sponsor Unit (No Board Approval)' },
  'no board approval': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Sponsor Unit', label: 'Sponsor Unit (No Board Approval)' },
  'no board': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Sponsor Unit', label: 'Sponsor Unit (No Board Approval)' },
  'condo': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Condo', label: 'Condo' },
  'condominium': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Condo', label: 'Condo' },
  'coop': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Co-op', label: 'Co-op' },
  'co-op': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Co-op', label: 'Co-op' },
  'co op': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Co-op', label: 'Co-op' },
  'condop': { type: 'ownership', filterKey: 'ownershipTypes', filterValue: 'Condop', label: 'Condop' },
  'townhouse': { type: 'ownership', filterKey: 'propertySubTypes', filterValue: 'Townhouse', label: 'Townhouse' },
  'brownstone': { type: 'ownership', filterKey: 'propertySubTypes', filterValue: 'Townhouse', label: 'Townhouse' },
  'new development': { type: 'ownership', filterKey: 'propertySubTypes', filterValue: 'New Development', label: 'New Development' },
  'new construction': { type: 'ownership', filterKey: 'propertySubTypes', filterValue: 'New Development', label: 'New Development' },
  'new dev': { type: 'ownership', filterKey: 'propertySubTypes', filterValue: 'New Development', label: 'New Development' },
  'multi-family': { type: 'ownership', filterKey: 'propertySubTypes', filterValue: 'Multi-Family', label: 'Multi-Family' },
  'multifamily': { type: 'ownership', filterKey: 'propertySubTypes', filterValue: 'Multi-Family', label: 'Multi-Family' },

  // ── Year Built ──
  'prewar': { type: 'year-built', filterKey: 'yearBuilt', filterValue: 'pre-war', label: 'Pre-War' },
  'pre-war': { type: 'year-built', filterKey: 'yearBuilt', filterValue: 'pre-war', label: 'Pre-War' },
  'pre war': { type: 'year-built', filterKey: 'yearBuilt', filterValue: 'pre-war', label: 'Pre-War' },
  'postwar': { type: 'year-built', filterKey: 'yearBuilt', filterValue: 'post-war', label: 'Post-War' },
  'post-war': { type: 'year-built', filterKey: 'yearBuilt', filterValue: 'post-war', label: 'Post-War' },
  'post war': { type: 'year-built', filterKey: 'yearBuilt', filterValue: 'post-war', label: 'Post-War' },

  // ── Rental ──
  'no fee': { type: 'rental', filterKey: 'amenities', filterValue: 'no-fee', label: 'No Fee' },
  'no broker fee': { type: 'rental', filterKey: 'amenities', filterValue: 'no-fee', label: 'No Fee' },
  'owner pays': { type: 'rental', filterKey: 'amenities', filterValue: 'no-fee', label: 'No Fee' },
  'furnished': { type: 'rental', filterKey: 'furnished', filterValue: true, label: 'Furnished' },
  'walkup': { type: 'rental', filterKey: 'propertySubTypes', filterValue: 'Walk-Up', label: 'Walk-Up' },
  'walk-up': { type: 'rental', filterKey: 'propertySubTypes', filterValue: 'Walk-Up', label: 'Walk-Up' },
  'walk up': { type: 'rental', filterKey: 'propertySubTypes', filterValue: 'Walk-Up', label: 'Walk-Up' },
};

/** Sorted keys longest-first for greedy matching */
const LINGO_KEYS_SORTED = Object.keys(LINGO_MAP).sort((a, b) => b.length - a.length);

// ─── Transit Patterns ────────────────────────────────────────────────────────

/** Individual subway lines */
const SUBWAY_LINES = ['1', '2', '3', '4', '5', '6', '7', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'L', 'M', 'N', 'Q', 'R', 'S', 'W', 'Z'];

/** Grouped subway services (common NYC shorthand) */
const SUBWAY_GROUPS: Record<string, string[]> = {
  'nqrw': ['N', 'Q', 'R', 'W'],
  'bdfm': ['B', 'D', 'F', 'M'],
  'ace': ['A', 'C', 'E'],
  '456': ['4', '5', '6'],
  '123': ['1', '2', '3'],
  'nqr': ['N', 'Q', 'R'],
  'bdf': ['B', 'D', 'F'],
};

/**
 * Transit matching uses a function rather than a single regex to avoid
 * false positives (e.g., "N" matching inside "nice", "S" inside "subway").
 *
 * Matching strategy (ordered by specificity):
 * 1. Grouped services: "NQRW", "ACE", "BDFM", etc.
 * 2. Individual lines with "train"/"line": "L train", "6 line"
 * 3. "the X" pattern: "the L", "the 6"
 * 4. "near the X" pattern
 * 5. Generic: "near subway", "near train", "subway", "metro"
 */

/** Regex for grouped subway services (e.g., NQRW, ACE, BDFM) */
const GROUP_REGEX = new RegExp(
  `(?:near\\s+)?\\b(${Object.keys(SUBWAY_GROUPS).join('|')})\\b(?:\\s*(?:train|line)s?)?`,
  'i',
);

/** Regex for individual line + required context (train/line, or preceded by "the"/"near the") */
const LINE_REGEX = new RegExp(
  `(?:near\\s+)?(?:the\\s+)(${SUBWAY_LINES.join('|')})(?:\\s*(?:train|line))?` +
  `|\\b(${SUBWAY_LINES.join('|')})\\s+(?:train|line)`,
  'i',
);

/** Regex for generic transit terms */
const GENERIC_TRANSIT_REGEX = /\b(?:near\s+)?(?:subway|metro)\b|\bnear\s+train\b/i;

// ─── Levenshtein Distance ────────────────────────────────────────────────────

/**
 * Compute Levenshtein distance between two strings.
 * Pure implementation, no external dependencies.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Short circuit
  if (m === 0) return n;
  if (n === 0) return m;

  // Use single-row optimization
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// ─── Exported Functions ──────────────────────────────────────────────────────

/**
 * Resolve a neighborhood input to a canonical name.
 *
 * Resolution order:
 * 1. Exact canonical match (case-insensitive)
 * 2. Alias match (case-insensitive)
 * 3. Fuzzy match via Levenshtein distance (<=2, input >= 4 chars, canonical names only)
 */
export function resolveNeighborhood(input: string): ResolvedNeighborhood | null {
  if (!input || typeof input !== 'string') return null;

  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  // 1. Exact canonical match
  const exact = CANONICAL_LOOKUP.get(normalized);
  if (exact) {
    return {
      canonical: exact.canonical,
      borough: exact.borough,
      matchType: 'exact',
      distance: 0,
    };
  }

  // 2. Alias match
  const aliasResult = ALIAS_LOOKUP.get(normalized);
  if (aliasResult) {
    // Find the borough for this canonical name
    const entry = CANONICAL_LOOKUP.get(aliasResult.toLowerCase());
    if (entry) {
      return {
        canonical: entry.canonical,
        borough: entry.borough,
        matchType: 'alias',
        distance: 0,
      };
    }
  }

  // 3. Fuzzy match (only for inputs >= 4 chars, only against canonical names)
  if (normalized.length >= 4) {
    let bestMatch: { canonical: string; borough: string } | null = null;
    let bestDistance = Infinity;

    for (const name of ALL_CANONICAL_NAMES) {
      const dist = levenshtein(normalized, name.toLowerCase());
      if (dist <= 2 && dist < bestDistance) {
        bestDistance = dist;
        const entry = CANONICAL_LOOKUP.get(name.toLowerCase());
        if (entry) {
          bestMatch = entry;
        }
      }
    }

    if (bestMatch) {
      return {
        canonical: bestMatch.canonical,
        borough: bestMatch.borough,
        matchType: 'fuzzy',
        distance: bestDistance,
      };
    }
  }

  return null;
}

/**
 * Resolve a borough input to a canonical borough name.
 */
export function resolveBorough(input: string): string | null {
  if (!input || typeof input !== 'string') return null;

  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  return BOROUGH_ALIASES[normalized] ?? null;
}

/**
 * Match NYC property lingo terms in text.
 *
 * Uses greedy longest-first matching. Returns all matches and the
 * remainder text with matched terms removed.
 */
export function matchLingo(text: string): { matches: LingoMatch[]; remainder: string } {
  if (!text || typeof text !== 'string') {
    return { matches: [], remainder: text ?? '' };
  }

  const matches: LingoMatch[] = [];
  let remaining = text;

  for (const key of LINGO_KEYS_SORTED) {
    // Build a regex that matches the key as a word boundary
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    const match = remaining.match(regex);

    if (match) {
      const entry = LINGO_MAP[key];
      // Avoid duplicates (e.g., "coop" and "co-op" both matching)
      const isDuplicate = matches.some(
        m => m.filterKey === entry.filterKey && m.filterValue === entry.filterValue,
      );
      if (!isDuplicate) {
        matches.push({
          matched: match[0],
          type: entry.type,
          filterKey: entry.filterKey,
          filterValue: entry.filterValue,
          label: entry.label,
        });
      }
      remaining = remaining.replace(regex, '').replace(/\s+/g, ' ').trim();
    }
  }

  return { matches, remainder: remaining };
}

/**
 * Match transit/subway patterns in text.
 *
 * Detects individual lines (L train), grouped services (NQRW),
 * and generic transit terms (near subway).
 *
 * Uses separate regexes tested in priority order to avoid false positives
 * (e.g., the letter "N" matching inside "nice apartment").
 */
export function matchTransit(text: string): { match: TransitMatch | null; remainder: string } {
  if (!text || typeof text !== 'string') {
    return { match: null, remainder: text ?? '' };
  }

  // 1. Try grouped services first (NQRW, ACE, BDFM, etc.)
  const groupM = text.match(GROUP_REGEX);
  if (groupM) {
    const groupKey = groupM[1].toLowerCase();
    const lines = SUBWAY_GROUPS[groupKey] ?? [];
    return {
      match: {
        matched: groupM[0],
        lines,
        label: `Near ${lines.join('/')} trains`,
      },
      remainder: text.replace(groupM[0], '').replace(/\s+/g, ' ').trim(),
    };
  }

  // 2. Try individual line with context ("the L", "L train", "near the 6 train")
  const lineM = text.match(LINE_REGEX);
  if (lineM) {
    // Match groups: [1] = line from "the X" pattern, [2] = line from "X train" pattern
    const line = (lineM[1] || lineM[2]).toUpperCase();
    return {
      match: {
        matched: lineM[0],
        lines: [line],
        label: `Near ${line} train`,
      },
      remainder: text.replace(lineM[0], '').replace(/\s+/g, ' ').trim(),
    };
  }

  // 3. Try generic transit terms ("near subway", "subway", "metro", "near train")
  const genericM = text.match(GENERIC_TRANSIT_REGEX);
  if (genericM) {
    return {
      match: {
        matched: genericM[0],
        lines: [],
        label: 'Near subway',
      },
      remainder: text.replace(genericM[0], '').replace(/\s+/g, ' ').trim(),
    };
  }

  return { match: null, remainder: text };
}

/**
 * Get autocomplete suggestions for partial input.
 *
 * Searches neighborhoods, boroughs, lingo terms, and transit patterns.
 * Results are ordered: exact prefix matches first, then contains matches.
 */
export function getSuggestions(input: string, limit: number = 10): DictionarySuggestion[] {
  if (!input || typeof input !== 'string') return [];

  const normalized = input.trim().toLowerCase();
  if (!normalized) return [];

  const suggestions: DictionarySuggestion[] = [];
  const seen = new Set<string>();

  // Helper to add without duplicates
  function add(suggestion: DictionarySuggestion): void {
    const key = `${suggestion.type}:${suggestion.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      suggestions.push(suggestion);
    }
  }

  // ── Neighborhoods: canonical names ──
  for (const [borough, neighborhoods] of Object.entries(BOROUGH_NEIGHBORHOODS)) {
    for (const name of neighborhoods) {
      const lower = name.toLowerCase();
      if (lower.startsWith(normalized) || lower.includes(normalized)) {
        add({
          type: 'neighborhood',
          label: name,
          value: name,
          context: borough,
        });
      }
    }
  }

  // ── Neighborhoods: aliases ──
  for (const [alias, canonical] of Object.entries(NEIGHBORHOOD_ALIASES)) {
    if (alias.startsWith(normalized) || alias.includes(normalized)) {
      const entry = CANONICAL_LOOKUP.get(canonical.toLowerCase());
      if (entry) {
        add({
          type: 'neighborhood',
          label: entry.canonical,
          value: entry.canonical,
          context: entry.borough,
        });
      }
    }
  }

  // ── Boroughs ──
  for (const [alias, canonical] of Object.entries(BOROUGH_ALIASES)) {
    if (alias.startsWith(normalized) || alias.includes(normalized)) {
      add({
        type: 'borough',
        label: canonical,
        value: canonical,
      });
    }
  }

  // ── Lingo terms ──
  for (const [key, entry] of Object.entries(LINGO_MAP)) {
    if (key.startsWith(normalized) || key.includes(normalized) || entry.label.toLowerCase().includes(normalized)) {
      add({
        type: 'lingo',
        label: entry.label,
        value: key,
        context: entry.type,
      });
    }
  }

  // ── Transit ──
  for (const line of SUBWAY_LINES) {
    const patterns = [
      `${line.toLowerCase()} train`,
      `the ${line.toLowerCase()}`,
      line.toLowerCase(),
    ];
    for (const p of patterns) {
      if (p.startsWith(normalized) || p.includes(normalized)) {
        add({
          type: 'transit',
          label: `${line} train`,
          value: line,
          context: 'Subway',
        });
        break; // Only add once per line
      }
    }
  }

  if (
    'subway'.startsWith(normalized) ||
    'near subway'.startsWith(normalized) ||
    'train'.startsWith(normalized) ||
    'near train'.startsWith(normalized)
  ) {
    add({
      type: 'transit',
      label: 'Near subway',
      value: 'subway',
      context: 'Transit',
    });
  }

  // Sort: prefix matches first, then alphabetical
  suggestions.sort((a, b) => {
    const aPrefix = a.label.toLowerCase().startsWith(normalized) ? 0 : 1;
    const bPrefix = b.label.toLowerCase().startsWith(normalized) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    // Neighborhoods before boroughs before lingo before transit
    const typeOrder: Record<SuggestionType, number> = {
      neighborhood: 0,
      borough: 1,
      lingo: 2,
      transit: 3,
    };
    if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
    return a.label.localeCompare(b.label);
  });

  return suggestions.slice(0, limit);
}

// ─── Utility Exports (for use by other modules) ─────────────────────────────

/** Get all canonical neighborhoods for a borough */
export function getNeighborhoodsForBorough(borough: string): string[] {
  return BOROUGH_NEIGHBORHOODS[borough] ?? [];
}

/** Get all borough names */
export function getAllBoroughs(): string[] {
  return Object.keys(BOROUGH_NEIGHBORHOODS);
}

/** Get all canonical neighborhood names */
export function getAllNeighborhoods(): string[] {
  return ALL_CANONICAL_NAMES;
}
