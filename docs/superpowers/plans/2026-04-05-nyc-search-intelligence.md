# NYC Search Intelligence Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the search bar understand NYC the way a local does — abbreviations, lingo, fuzzy matching, filter chips — so that queries like "sunny 2br UES doorman under 3M" or "wburg flex 2 w/d no fee" just work.

**Architecture:** Expand the existing client-side NL parser (`lib/search/natural-language-parser.ts`) with a massive NYC dictionary, fuzzy neighborhood matching, and new lingo categories. Add a filter chip system to the search page that visually shows parsed filters. Enhance the homepage HeroSearch and search page SearchAutocomplete to show filter-intent suggestions alongside entity suggestions. No new API endpoints needed — the intelligence is all client-side for speed.

**Tech Stack:** TypeScript, React, Tailwind CSS, existing Next.js App Router

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/search/nyc-dictionary.ts` | **Create** | NYC abbreviations, lingo, transit lines, fuzzy matchers — the knowledge base |
| `lib/search/natural-language-parser.ts` | **Modify** | Wire dictionary into parser, add fuzzy matching, transit, new lingo categories |
| `lib/search/types.ts` | **Modify** | Add new filter types (transit, noFee, flexLayout, sponsorUnit) and chip types |
| `app/components/SearchChips.tsx` | **Create** | Filter chip bar — color-coded, removable, appears between search bar and results |
| `app/components/SearchAutocomplete.tsx` | **Modify** | Add filter-intent suggestions from NL parser alongside entity suggestions |
| `app/components/HeroSearch.tsx` | **Modify** | Wire NL parser into autocomplete dropdown for filter suggestions |
| `app/search/page.tsx` | **Modify** | Integrate chips, sync with filter dropdowns, show parsed state |
| `lib/search/__tests__/nyc-dictionary.test.ts` | **Create** | Dictionary lookup + fuzzy matching tests |
| `lib/search/__tests__/natural-language-parser.test.ts` | **Create** | End-to-end parser tests with real NYC queries |

---

### Task 1: NYC Dictionary — Knowledge Base

**Files:**
- Create: `lib/search/nyc-dictionary.ts`
- Create: `lib/search/__tests__/nyc-dictionary.test.ts`

This is the brain. A pure data + lookup module with zero UI dependencies.

- [ ] **Step 1: Write the failing test for neighborhood abbreviation lookup**

```typescript
// lib/search/__tests__/nyc-dictionary.test.ts
import { resolveNeighborhood, resolveBorough } from '../nyc-dictionary';

describe('NYC Dictionary — Neighborhood Resolution', () => {
  // Standard abbreviations
  test('UES → Upper East Side', () => {
    expect(resolveNeighborhood('UES')).toEqual({ name: 'Upper East Side', borough: 'Manhattan' });
  });
  test('uws → Upper West Side (case-insensitive)', () => {
    expect(resolveNeighborhood('uws')).toEqual({ name: 'Upper West Side', borough: 'Manhattan' });
  });
  test('wburg → Williamsburg', () => {
    expect(resolveNeighborhood('wburg')).toEqual({ name: 'Williamsburg', borough: 'Brooklyn' });
  });
  test('fidi → Financial District', () => {
    expect(resolveNeighborhood('fidi')).toEqual({ name: 'Financial District', borough: 'Manhattan' });
  });
  test('LIC → Long Island City', () => {
    expect(resolveNeighborhood('LIC')).toEqual({ name: 'Long Island City', borough: 'Queens' });
  });
  test('BoCoCa → Boerum Hill + Cobble Hill + Carroll Gardens area (→ Cobble Hill)', () => {
    expect(resolveNeighborhood('BoCoCa')).toEqual({ name: 'Cobble Hill', borough: 'Brooklyn' });
  });
  test('HK → Hell\'s Kitchen', () => {
    expect(resolveNeighborhood('HK')).toEqual({ name: "Hell's Kitchen", borough: 'Manhattan' });
  });
  test('BedStuy → Bed-Stuy', () => {
    expect(resolveNeighborhood('BedStuy')).toEqual({ name: 'Bed-Stuy', borough: 'Brooklyn' });
  });

  // Full names pass through
  test('Upper East Side → Upper East Side', () => {
    expect(resolveNeighborhood('Upper East Side')).toEqual({ name: 'Upper East Side', borough: 'Manhattan' });
  });

  // Unknown returns null
  test('unknown neighborhood → null', () => {
    expect(resolveNeighborhood('Narnia')).toBeNull();
  });
});

describe('NYC Dictionary — Borough Resolution', () => {
  test('BK → Brooklyn', () => {
    expect(resolveBorough('BK')).toBe('Brooklyn');
  });
  test('SI → Staten Island', () => {
    expect(resolveBorough('SI')).toBe('Staten Island');
  });
  test('manha → Manhattan (prefix)', () => {
    expect(resolveBorough('manhattan')).toBe('Manhattan');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/search/__tests__/nyc-dictionary.test.ts --no-coverage 2>&1 | head -30`
Expected: FAIL — module not found

- [ ] **Step 3: Create the NYC dictionary with neighborhood aliases**

```typescript
// lib/search/nyc-dictionary.ts
/**
 * NYC Search Dictionary — neighborhood aliases, property lingo, transit lines.
 *
 * This is the knowledge base for the NL search parser.
 * Pure data + lookup functions. No UI dependencies.
 * All matching is case-insensitive.
 */

export interface ResolvedNeighborhood {
  name: string;   // Canonical name matching data/*.json
  borough: string;
}

// ── Neighborhood alias map ──
// Keys are lowercased. Values are canonical { name, borough } from data/*.json.
// Includes: abbreviations, slang, common misspellings, compound neighborhood names.
const NEIGHBORHOOD_ALIASES: Record<string, ResolvedNeighborhood> = {
  // ── Manhattan ──
  'ues': { name: 'Upper East Side', borough: 'Manhattan' },
  'upper east': { name: 'Upper East Side', borough: 'Manhattan' },
  'upper east side': { name: 'Upper East Side', borough: 'Manhattan' },
  'uws': { name: 'Upper West Side', borough: 'Manhattan' },
  'upper west': { name: 'Upper West Side', borough: 'Manhattan' },
  'upper west side': { name: 'Upper West Side', borough: 'Manhattan' },
  'les': { name: 'Lower East Side', borough: 'Manhattan' },
  'lower east': { name: 'Lower East Side', borough: 'Manhattan' },
  'lower east side': { name: 'Lower East Side', borough: 'Manhattan' },
  'fidi': { name: 'Financial District', borough: 'Manhattan' },
  'financial district': { name: 'Financial District', borough: 'Manhattan' },
  'soho': { name: 'SoHo', borough: 'Manhattan' },
  'noho': { name: 'NoHo', borough: 'Manhattan' },
  'nolita': { name: 'Nolita', borough: 'Manhattan' },
  'tribeca': { name: 'Tribeca', borough: 'Manhattan' },
  'tribecca': { name: 'Tribeca', borough: 'Manhattan' },  // common misspelling
  'chelsea': { name: 'Chelsea', borough: 'Manhattan' },
  'hk': { name: "Hell's Kitchen", borough: 'Manhattan' },
  'hells kitchen': { name: "Hell's Kitchen", borough: 'Manhattan' },
  "hell's kitchen": { name: "Hell's Kitchen", borough: 'Manhattan' },
  'midtown': { name: 'Midtown East', borough: 'Manhattan' },
  'midtown east': { name: 'Midtown East', borough: 'Manhattan' },
  'midtown west': { name: 'Midtown West', borough: 'Manhattan' },
  'east village': { name: 'East Village', borough: 'Manhattan' },
  'ev': { name: 'East Village', borough: 'Manhattan' },
  'west village': { name: 'West Village', borough: 'Manhattan' },
  'wv': { name: 'West Village', borough: 'Manhattan' },
  'greenwich village': { name: 'Greenwich Village', borough: 'Manhattan' },
  'greenwich': { name: 'Greenwich Village', borough: 'Manhattan' },
  'the village': { name: 'Greenwich Village', borough: 'Manhattan' },
  'gramercy': { name: 'Gramercy', borough: 'Manhattan' },
  'gramercy park': { name: 'Gramercy', borough: 'Manhattan' },
  'gram': { name: 'Gramercy', borough: 'Manhattan' },
  'flatiron': { name: 'Flatiron', borough: 'Manhattan' },
  'nomad': { name: 'NoMad', borough: 'Manhattan' },
  'murray hill': { name: 'Murray Hill', borough: 'Manhattan' },
  'muhi': { name: 'Murray Hill', borough: 'Manhattan' },
  'kips bay': { name: 'Kips Bay', borough: 'Manhattan' },
  'sutton place': { name: 'Sutton Place', borough: 'Manhattan' },
  'sutton': { name: 'Sutton Place', borough: 'Manhattan' },
  'yorkville': { name: 'Yorkville', borough: 'Manhattan' },
  'harlem': { name: 'Harlem', borough: 'Manhattan' },
  'east harlem': { name: 'East Harlem', borough: 'Manhattan' },
  'el barrio': { name: 'East Harlem', borough: 'Manhattan' },
  'spanish harlem': { name: 'East Harlem', borough: 'Manhattan' },
  'morningside heights': { name: 'Morningside Heights', borough: 'Manhattan' },
  'morningside': { name: 'Morningside Heights', borough: 'Manhattan' },
  'washington heights': { name: 'Washington Heights', borough: 'Manhattan' },
  'wash heights': { name: 'Washington Heights', borough: 'Manhattan' },
  'waheights': { name: 'Washington Heights', borough: 'Manhattan' },
  'inwood': { name: 'Inwood', borough: 'Manhattan' },
  'battery park city': { name: 'Battery Park City', borough: 'Manhattan' },
  'bpc': { name: 'Battery Park City', borough: 'Manhattan' },
  'battery park': { name: 'Battery Park City', borough: 'Manhattan' },
  'hudson yards': { name: 'Hudson Yards', borough: 'Manhattan' },
  'hy': { name: 'Hudson Yards', borough: 'Manhattan' },
  'little italy': { name: 'Little Italy', borough: 'Manhattan' },
  'chinatown': { name: 'Chinatown', borough: 'Manhattan' },
  'two bridges': { name: 'Two Bridges', borough: 'Manhattan' },
  'roosevelt island': { name: 'Roosevelt Island', borough: 'Manhattan' },
  'stuy town': { name: 'Sutton Place', borough: 'Manhattan' },
  'stuyvesant town': { name: 'Sutton Place', borough: 'Manhattan' },
  'lower manhattan': { name: 'Financial District', borough: 'Manhattan' },

  // ── Brooklyn ──
  'williamsburg': { name: 'Williamsburg', borough: 'Brooklyn' },
  'wburg': { name: 'Williamsburg', borough: 'Brooklyn' },
  'wbg': { name: 'Williamsburg', borough: 'Brooklyn' },
  'billyburg': { name: 'Williamsburg', borough: 'Brooklyn' },
  'dumbo': { name: 'DUMBO', borough: 'Brooklyn' },
  'park slope': { name: 'Park Slope', borough: 'Brooklyn' },
  'brooklyn heights': { name: 'Brooklyn Heights', borough: 'Brooklyn' },
  'bk heights': { name: 'Brooklyn Heights', borough: 'Brooklyn' },
  'cobble hill': { name: 'Cobble Hill', borough: 'Brooklyn' },
  'carroll gardens': { name: 'Carroll Gardens', borough: 'Brooklyn' },
  'bococa': { name: 'Cobble Hill', borough: 'Brooklyn' },  // Boerum/Cobble/Carroll area
  'fort greene': { name: 'Fort Greene', borough: 'Brooklyn' },
  'prospect heights': { name: 'Prospect Heights', borough: 'Brooklyn' },
  'greenpoint': { name: 'Greenpoint', borough: 'Brooklyn' },
  'gpoint': { name: 'Greenpoint', borough: 'Brooklyn' },
  'bed-stuy': { name: 'Bed-Stuy', borough: 'Brooklyn' },
  'bed stuy': { name: 'Bed-Stuy', borough: 'Brooklyn' },
  'bedstuy': { name: 'Bed-Stuy', borough: 'Brooklyn' },
  'bedford stuyvesant': { name: 'Bed-Stuy', borough: 'Brooklyn' },
  'bedford-stuyvesant': { name: 'Bed-Stuy', borough: 'Brooklyn' },
  'procro': { name: 'Prospect Heights', borough: 'Brooklyn' },  // Prospect/Crown area

  // ── Queens ──
  'astoria': { name: 'Astoria', borough: 'Queens' },
  'lic': { name: 'Long Island City', borough: 'Queens' },
  'long island city': { name: 'Long Island City', borough: 'Queens' },
  'jackson heights': { name: 'Jackson Heights', borough: 'Queens' },
  'jh': { name: 'Jackson Heights', borough: 'Queens' },
  'flushing': { name: 'Flushing', borough: 'Queens' },
  'forest hills': { name: 'Forest Hills', borough: 'Queens' },
  'sunnyside': { name: 'Sunnyside', borough: 'Queens' },
  'bayside': { name: 'Bayside', borough: 'Queens' },

  // ── Bronx ──
  'riverdale': { name: 'Riverdale', borough: 'Bronx' },
  'city island': { name: 'City Island', borough: 'Bronx' },
  'mott haven': { name: 'Mott Haven', borough: 'Bronx' },
  'sobronya': { name: 'Mott Haven', borough: 'Bronx' },  // South Bronx
  'south bronx': { name: 'Mott Haven', borough: 'Bronx' },
  'pelham bay': { name: 'Pelham Bay', borough: 'Bronx' },
  'fordham': { name: 'Fordham', borough: 'Bronx' },

  // ── Staten Island ──
  'st. george': { name: 'St. George', borough: 'Staten Island' },
  'st george': { name: 'St. George', borough: 'Staten Island' },
  'todt hill': { name: 'Todt Hill', borough: 'Staten Island' },
  'great kills': { name: 'Great Kills', borough: 'Staten Island' },
  'new brighton': { name: 'New Brighton', borough: 'Staten Island' },
};

// ── Borough alias map ──
const BOROUGH_ALIASES: Record<string, string> = {
  'manhattan': 'Manhattan',
  'bk': 'Brooklyn',
  'brooklyn': 'Brooklyn',
  'bklyn': 'Brooklyn',
  'queens': 'Queens',
  'qns': 'Queens',
  'bronx': 'Bronx',
  'the bronx': 'Bronx',
  'bx': 'Bronx',
  'staten island': 'Staten Island',
  'si': 'Staten Island',
};

// ── NYC Property Lingo ──
// Maps NYC-specific real estate terms to structured filter values.
export interface LingoMatch {
  type: 'propertyType' | 'ownershipType' | 'amenity' | 'yearBuilt' | 'rentalTerm' | 'layout';
  filterKey: string;
  filterValue: string | boolean;
  label: string;  // Human-readable for chips
}

const PROPERTY_LINGO: Record<string, LingoMatch> = {
  // Layout lingo
  'jr4': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Junior 4', label: 'Junior 4' },
  'junior 4': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Junior 4', label: 'Junior 4' },
  'junior four': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Junior 4', label: 'Junior 4' },
  'jr1': { type: 'layout', filterKey: 'propertySubTypes', filterValue: 'Junior 1', label: 'Junior 1 BR' },
  'flex 2': { type: 'layout', filterKey: 'keywords', filterValue: 'flex 2', label: 'Flex 2' },
  'flex 3': { type: 'layout', filterKey: 'keywords', filterValue: 'flex 3', label: 'Flex 3' },
  'flex two': { type: 'layout', filterKey: 'keywords', filterValue: 'flex 2', label: 'Flex 2' },
  'flex three': { type: 'layout', filterKey: 'keywords', filterValue: 'flex 3', label: 'Flex 3' },
  'convertible': { type: 'layout', filterKey: 'keywords', filterValue: 'convertible', label: 'Convertible' },
  'railroad': { type: 'layout', filterKey: 'keywords', filterValue: 'railroad', label: 'Railroad' },
  'railroad apt': { type: 'layout', filterKey: 'keywords', filterValue: 'railroad', label: 'Railroad' },
  'alcove studio': { type: 'layout', filterKey: 'keywords', filterValue: 'alcove studio', label: 'Alcove Studio' },
  'alcove': { type: 'layout', filterKey: 'keywords', filterValue: 'alcove', label: 'Alcove' },
  'loft': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'Loft', label: 'Loft' },
  'duplex': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'Duplex', label: 'Duplex' },
  'triplex': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'Triplex', label: 'Triplex' },
  'penthouse': { type: 'layout', filterKey: 'keywords', filterValue: 'penthouse', label: 'Penthouse' },
  'ph': { type: 'layout', filterKey: 'keywords', filterValue: 'penthouse', label: 'Penthouse' },
  'garden apt': { type: 'layout', filterKey: 'keywords', filterValue: 'garden apartment', label: 'Garden Apt' },
  'garden apartment': { type: 'layout', filterKey: 'keywords', filterValue: 'garden apartment', label: 'Garden Apt' },
  'maisonette': { type: 'layout', filterKey: 'keywords', filterValue: 'maisonette', label: 'Maisonette' },

  // Ownership lingo
  'sponsor unit': { type: 'ownershipType', filterKey: 'keywords', filterValue: 'sponsor unit', label: 'Sponsor Unit' },
  'sponsor': { type: 'ownershipType', filterKey: 'keywords', filterValue: 'sponsor unit', label: 'Sponsor Unit' },
  'no board approval': { type: 'ownershipType', filterKey: 'keywords', filterValue: 'sponsor unit', label: 'No Board Approval' },
  'condo': { type: 'ownershipType', filterKey: 'propertySubTypes', filterValue: 'Condo', label: 'Condo' },
  'coop': { type: 'ownershipType', filterKey: 'propertySubTypes', filterValue: 'Co-op', label: 'Co-op' },
  'co-op': { type: 'ownershipType', filterKey: 'propertySubTypes', filterValue: 'Co-op', label: 'Co-op' },
  'co op': { type: 'ownershipType', filterKey: 'propertySubTypes', filterValue: 'Co-op', label: 'Co-op' },
  'condop': { type: 'ownershipType', filterKey: 'propertySubTypes', filterValue: 'Condop', label: 'Condop' },
  'townhouse': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'Townhouse', label: 'Townhouse' },
  'brownstone': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'Townhouse', label: 'Brownstone' },
  'new dev': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'New Development', label: 'New Development' },
  'new development': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'New Development', label: 'New Development' },
  'new construction': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'New Development', label: 'New Construction' },
  'multi-family': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'Multi-Family', label: 'Multi-Family' },
  'multifamily': { type: 'propertyType', filterKey: 'propertySubTypes', filterValue: 'Multi-Family', label: 'Multi-Family' },

  // Year built
  'prewar': { type: 'yearBuilt', filterKey: 'yearBuilt', filterValue: 'pre-war', label: 'Pre-War' },
  'pre-war': { type: 'yearBuilt', filterKey: 'yearBuilt', filterValue: 'pre-war', label: 'Pre-War' },
  'pre war': { type: 'yearBuilt', filterKey: 'yearBuilt', filterValue: 'pre-war', label: 'Pre-War' },
  'postwar': { type: 'yearBuilt', filterKey: 'yearBuilt', filterValue: 'post-war', label: 'Post-War' },
  'post-war': { type: 'yearBuilt', filterKey: 'yearBuilt', filterValue: 'post-war', label: 'Post-War' },
  'post war': { type: 'yearBuilt', filterKey: 'yearBuilt', filterValue: 'post-war', label: 'Post-War' },

  // Rental terms
  'no fee': { type: 'rentalTerm', filterKey: 'noFee', filterValue: true, label: 'No Fee' },
  'no broker fee': { type: 'rentalTerm', filterKey: 'noFee', filterValue: true, label: 'No Fee' },
  'owner pays': { type: 'rentalTerm', filterKey: 'noFee', filterValue: true, label: 'No Fee' },
  'walkup': { type: 'amenity', filterKey: 'keywords', filterValue: 'walkup', label: 'Walk-Up' },
  'walk-up': { type: 'amenity', filterKey: 'keywords', filterValue: 'walkup', label: 'Walk-Up' },
  'walk up': { type: 'amenity', filterKey: 'keywords', filterValue: 'walkup', label: 'Walk-Up' },
  'furnished': { type: 'rentalTerm', filterKey: 'furnished', filterValue: true, label: 'Furnished' },
};

// ── NYC Transit Lines ──
// Subway line → neighborhoods it serves (approximate, for "near the L" type queries)
export interface TransitMatch {
  line: string;
  label: string;
}

const TRANSIT_PATTERNS: Record<string, TransitMatch> = {
  // Subway lines
  '1 train': { line: '1', label: 'Near 1 Train' },
  '2 train': { line: '2', label: 'Near 2 Train' },
  '3 train': { line: '3', label: 'Near 3 Train' },
  '4 train': { line: '4', label: 'Near 4 Train' },
  '5 train': { line: '5', label: 'Near 5 Train' },
  '6 train': { line: '6', label: 'Near 6 Train' },
  '7 train': { line: '7', label: 'Near 7 Train' },
  'a train': { line: 'A', label: 'Near A Train' },
  'b train': { line: 'B', label: 'Near B Train' },
  'c train': { line: 'C', label: 'Near C Train' },
  'd train': { line: 'D', label: 'Near D Train' },
  'e train': { line: 'E', label: 'Near E Train' },
  'f train': { line: 'F', label: 'Near F Train' },
  'g train': { line: 'G', label: 'Near G Train' },
  'j train': { line: 'J', label: 'Near J Train' },
  'l train': { line: 'L', label: 'Near L Train' },
  'm train': { line: 'M', label: 'Near M Train' },
  'n train': { line: 'N', label: 'Near N Train' },
  'q train': { line: 'Q', label: 'Near Q Train' },
  'r train': { line: 'R', label: 'Near R Train' },
  's train': { line: 'S', label: 'Near S Shuttle' },
  'w train': { line: 'W', label: 'Near W Train' },
  'z train': { line: 'Z', label: 'Near Z Train' },
  // Common shorthand: "near the L", "near the 6"
  'the l': { line: 'L', label: 'Near L Train' },
  'the 1': { line: '1', label: 'Near 1 Train' },
  'the 2': { line: '2', label: 'Near 2 Train' },
  'the 3': { line: '3', label: 'Near 3 Train' },
  'the 4': { line: '4', label: 'Near 4 Train' },
  'the 5': { line: '5', label: 'Near 5 Train' },
  'the 6': { line: '6', label: 'Near 6 Train' },
  'the 7': { line: '7', label: 'Near 7 Train' },
  // Named services
  'nqrw': { line: 'NQRW', label: 'Near N/Q/R/W' },
  'bdfm': { line: 'BDFM', label: 'Near B/D/F/M' },
  'ace': { line: 'ACE', label: 'Near A/C/E' },
  '456': { line: '456', label: 'Near 4/5/6' },
  // General
  'near subway': { line: 'any', label: 'Near Subway' },
  'near train': { line: 'any', label: 'Near Subway' },
  'subway': { line: 'any', label: 'Near Subway' },
};

// ── Fuzzy matching ──
// Simple Levenshtein distance for typo correction on neighborhood names.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Public API ──

/**
 * Resolve a neighborhood name, abbreviation, or slang term to canonical form.
 * Returns null if no match. Tries exact match first, then fuzzy (distance ≤ 2).
 */
export function resolveNeighborhood(input: string): ResolvedNeighborhood | null {
  const key = input.toLowerCase().trim();

  // Exact match
  if (NEIGHBORHOOD_ALIASES[key]) return NEIGHBORHOOD_ALIASES[key];

  // Fuzzy match — only against canonical neighborhood names (not aliases)
  // to avoid matching "UES" to "UWS" etc.
  const canonicalNames = new Map<string, ResolvedNeighborhood>();
  for (const entry of Object.values(NEIGHBORHOOD_ALIASES)) {
    canonicalNames.set(entry.name.toLowerCase(), entry);
  }

  let bestMatch: ResolvedNeighborhood | null = null;
  let bestDistance = Infinity;

  for (const [canonical, resolved] of canonicalNames) {
    const dist = levenshtein(key, canonical);
    // Only fuzzy match if input is at least 4 chars and distance ≤ 2
    if (key.length >= 4 && dist <= 2 && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = resolved;
    }
  }

  return bestMatch;
}

/**
 * Resolve a borough name or abbreviation to canonical form.
 */
export function resolveBorough(input: string): string | null {
  const key = input.toLowerCase().trim();
  return BOROUGH_ALIASES[key] || null;
}

/**
 * Match NYC property lingo in text. Returns all matches found.
 * Matches longest phrases first to avoid partial matches.
 */
export function matchLingo(text: string): { matches: LingoMatch[]; remainder: string } {
  let remaining = text;
  const matches: LingoMatch[] = [];
  const seen = new Set<string>();

  // Sort keys longest-first for greedy matching
  const keys = Object.keys(PROPERTY_LINGO).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(remaining)) {
      const lingo = PROPERTY_LINGO[key];
      const dedupKey = `${lingo.filterKey}:${lingo.filterValue}`;
      if (!seen.has(dedupKey)) {
        matches.push(lingo);
        seen.add(dedupKey);
      }
      remaining = remaining.replace(regex, ' ');
    }
  }

  return { matches, remainder: remaining.replace(/\s+/g, ' ').trim() };
}

/**
 * Match transit references in text.
 */
export function matchTransit(text: string): { match: TransitMatch | null; remainder: string } {
  const lower = text.toLowerCase();

  // Sort keys longest-first
  const keys = Object.keys(TRANSIT_PATTERNS).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const regex = new RegExp(`\\b(?:near\\s+)?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      // Remove the matched text from the original (preserving case of rest)
      const cleanedRemainder = text.replace(
        new RegExp(`\\b(?:near\\s+)?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
        ' '
      ).replace(/\s+/g, ' ').trim();
      return { match: TRANSIT_PATTERNS[key], remainder: cleanedRemainder };
    }
  }

  return { match: null, remainder: text };
}

/**
 * Get autocomplete suggestions for a partial input.
 * Returns matched neighborhoods, boroughs, and lingo terms.
 * Used for the dropdown as-you-type experience.
 */
export interface DictionarySuggestion {
  type: 'neighborhood' | 'borough' | 'filter' | 'transit';
  label: string;
  sublabel: string;
  value: string;
  filterKey?: string;
  filterValue?: string | boolean;
}

export function getSuggestions(input: string, limit = 6): DictionarySuggestion[] {
  const key = input.toLowerCase().trim();
  if (key.length < 2) return [];

  const results: DictionarySuggestion[] = [];
  const seen = new Set<string>();

  // Neighborhood matches (alias keys that start with or contain input)
  for (const [alias, resolved] of Object.entries(NEIGHBORHOOD_ALIASES)) {
    if (results.length >= limit) break;
    if (alias.startsWith(key) || alias.includes(key)) {
      const dedupKey = `n:${resolved.name}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        results.push({
          type: 'neighborhood',
          label: resolved.name,
          sublabel: resolved.borough,
          value: resolved.name,
        });
      }
    }
  }

  // Borough matches
  for (const [alias, borough] of Object.entries(BOROUGH_ALIASES)) {
    if (results.length >= limit) break;
    if (alias.startsWith(key) || alias.includes(key)) {
      const dedupKey = `b:${borough}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        results.push({
          type: 'borough',
          label: borough,
          sublabel: 'Borough',
          value: borough,
        });
      }
    }
  }

  // Lingo matches
  for (const [term, lingo] of Object.entries(PROPERTY_LINGO)) {
    if (results.length >= limit) break;
    if (term.startsWith(key) || term.includes(key)) {
      const dedupKey = `l:${lingo.label}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        results.push({
          type: 'filter',
          label: lingo.label,
          sublabel: lingo.type.replace(/([A-Z])/g, ' $1').trim(),
          value: term,
          filterKey: lingo.filterKey,
          filterValue: lingo.filterValue,
        });
      }
    }
  }

  // Transit matches
  for (const [term, transit] of Object.entries(TRANSIT_PATTERNS)) {
    if (results.length >= limit) break;
    if (term.startsWith(key) || term.includes(key)) {
      const dedupKey = `t:${transit.line}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        results.push({
          type: 'transit',
          label: transit.label,
          sublabel: 'Transit',
          value: transit.line,
        });
      }
    }
  }

  return results.slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/search/__tests__/nyc-dictionary.test.ts --no-coverage`
Expected: All 10 tests PASS

- [ ] **Step 5: Write fuzzy matching tests**

Add to `lib/search/__tests__/nyc-dictionary.test.ts`:

```typescript
describe('NYC Dictionary — Fuzzy Matching', () => {
  test('willamsburg → Williamsburg (1 char off)', () => {
    expect(resolveNeighborhood('willamsburg')).toEqual({ name: 'Williamsburg', borough: 'Brooklyn' });
  });
  test('tribecca → Tribeca (common misspelling, exact alias)', () => {
    expect(resolveNeighborhood('tribecca')).toEqual({ name: 'Tribeca', borough: 'Manhattan' });
  });
  test('greenich village → Greenwich Village (1 char off)', () => {
    expect(resolveNeighborhood('greenich village')).toEqual({ name: 'Greenwich Village', borough: 'Manhattan' });
  });
  test('BK → not fuzzy matched (too short, but exact alias)', () => {
    expect(resolveBorough('BK')).toBe('Brooklyn');
  });
});

describe('NYC Dictionary — Lingo Matching', () => {
  test('parses jr4 from text', () => {
    const result = matchLingo('jr4 in UES');
    expect(result.matches).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Junior 4' })])
    );
  });
  test('parses sponsor unit from text', () => {
    const result = matchLingo('sponsor unit condo');
    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Sponsor Unit' }),
        expect.objectContaining({ label: 'Condo' }),
      ])
    );
  });
  test('parses no fee from text', () => {
    const result = matchLingo('no fee 2br');
    expect(result.matches).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'No Fee' })])
    );
  });
});

describe('NYC Dictionary — Transit Matching', () => {
  test('near the L → L train', () => {
    const result = matchTransit('near the L train');
    expect(result.match).toEqual({ line: 'L', label: 'Near L Train' });
  });
  test('near subway → any', () => {
    const result = matchTransit('near subway');
    expect(result.match).toEqual({ line: 'any', label: 'Near Subway' });
  });
});

describe('NYC Dictionary — Suggestions', () => {
  test('typing "ues" suggests Upper East Side', () => {
    const results = getSuggestions('ues');
    expect(results).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Upper East Side' })])
    );
  });
  test('typing "door" suggests Doorman', () => {
    const results = getSuggestions('door');
    expect(results).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'filter' })])
    );
  });
});
```

- [ ] **Step 6: Run all dictionary tests**

Run: `npx jest lib/search/__tests__/nyc-dictionary.test.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/search/nyc-dictionary.ts lib/search/__tests__/nyc-dictionary.test.ts
git commit -m "feat(search): add NYC dictionary — 120+ neighborhood aliases, property lingo, transit, fuzzy matching"
```

---

### Task 2: Expand Natural Language Parser

**Files:**
- Modify: `lib/search/natural-language-parser.ts`
- Modify: `lib/search/types.ts`
- Create: `lib/search/__tests__/natural-language-parser.test.ts`

Wire the NYC dictionary into the existing parser. Replace hardcoded neighborhood list with dictionary lookups. Add lingo and transit parsing.

- [ ] **Step 1: Write end-to-end parser tests with real NYC queries**

```typescript
// lib/search/__tests__/natural-language-parser.test.ts
import { parseNaturalLanguageSearch } from '../natural-language-parser';

describe('NL Parser — NYC Lingo Queries', () => {
  test('"sunny 2br UES doorman under 3M" → full parse', () => {
    const result = parseNaturalLanguageSearch('sunny 2br UES doorman under 3M');
    expect(result.filters.beds).toBe(2);
    expect(result.filters.maxPrice).toBe(3_000_000);
    expect(result.neighborhood).toBe('Upper East Side');
    expect(result.filters.amenities).toContain('doorman');
    expect(result.filters.amenities).toContain('natural-light');
  });

  test('"wburg flex 2 w/d no fee" → rental parse', () => {
    const result = parseNaturalLanguageSearch('wburg flex 2 w/d no fee');
    expect(result.neighborhood).toBe('Williamsburg');
    expect(result.filters.amenities).toContain('washer-dryer');
    expect(result.filters.amenities).toContain('no-fee');
    expect(result.filters.keywords).toContain('flex 2');
  });

  test('"prewar coop park slope 2-4M" → buy parse', () => {
    const result = parseNaturalLanguageSearch('prewar coop park slope 2-4M');
    expect(result.filters.yearBuilt).toBe('pre-war');
    expect(result.filters.propertySubTypes).toContain('Co-op');
    expect(result.neighborhood).toBe('Park Slope');
    expect(result.filters.minPrice).toBe(2_000_000);
    expect(result.filters.maxPrice).toBe(4_000_000);
  });

  test('"pet friendly 1bed near the L under 3k" → rental', () => {
    const result = parseNaturalLanguageSearch('pet friendly 1bed near the L under 3k');
    expect(result.filters.beds).toBe(1);
    expect(result.filters.maxPrice).toBe(3_000);
    expect(result.filters.amenities).toContain('pet-friendly');
    expect(result.filters.transit).toEqual({ line: 'L', label: 'Near L Train' });
  });

  test('"sponsor unit fidi" → no board approval lingo', () => {
    const result = parseNaturalLanguageSearch('sponsor unit fidi');
    expect(result.neighborhood).toBe('Financial District');
    expect(result.filters.keywords).toContain('sponsor unit');
  });

  test('"jr4 UES under 2M" → junior 4 layout', () => {
    const result = parseNaturalLanguageSearch('jr4 UES under 2M');
    expect(result.neighborhood).toBe('Upper East Side');
    expect(result.filters.maxPrice).toBe(2_000_000);
    // jr4 maps to keywords since it's a layout search
    expect(result.filters.keywords).toBeDefined();
  });

  test('"BK brownstone" → Brooklyn + townhouse', () => {
    const result = parseNaturalLanguageSearch('BK brownstone');
    expect(result.borough).toBe('Brooklyn');
    expect(result.filters.propertySubTypes).toContain('Townhouse');
  });

  test('"penthouse tribeca views" → keyword + neighborhood', () => {
    const result = parseNaturalLanguageSearch('penthouse tribeca views');
    expect(result.neighborhood).toBe('Tribeca');
    expect(result.filters.keywords).toContain('penthouse');
    expect(result.filters.amenities).toContain('views');
  });

  test('"2.5M" → $2,500,000 max price', () => {
    const result = parseNaturalLanguageSearch('under 2.5M');
    expect(result.filters.maxPrice).toBe(2_500_000);
  });

  test('"HK 1br rent under 4k doorman gym" → full rental parse', () => {
    const result = parseNaturalLanguageSearch('HK 1br rent under 4k doorman gym');
    expect(result.tab).toBe('rent-residential');
    expect(result.neighborhood).toBe("Hell's Kitchen");
    expect(result.filters.beds).toBe(1);
    expect(result.filters.maxPrice).toBe(4_000);
    expect(result.filters.amenities).toContain('doorman');
    expect(result.filters.amenities).toContain('gym');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/search/__tests__/natural-language-parser.test.ts --no-coverage 2>&1 | head -40`
Expected: FAIL — new features not implemented yet

- [ ] **Step 3: Add `keywords` and `transit` to SearchFilters type**

In `lib/search/types.ts`, add these fields to the `SearchFilters` interface:

```typescript
// Add after openHouseDate field (around line 37):
  // Keywords — NYC lingo terms that search PublicRemarks (flex 2, sponsor unit, penthouse, etc.)
  keywords?: string[];
  // Transit proximity
  transit?: { line: string; label: string };
```

Also add `'keywords'` to the `AmenityFilter` — actually no, keywords are separate from amenities. The type change is just in `SearchFilters`.

- [ ] **Step 4: Rewrite the parser to use NYC dictionary**

Replace the content of `lib/search/natural-language-parser.ts` with:

```typescript
/**
 * Natural language search parser — NYC Edition.
 *
 * Parses queries like "sunny 2br UES doorman under 3M" or "wburg flex 2 w/d no fee"
 * and maps them to SearchFilters + tab selection.
 *
 * Uses nyc-dictionary.ts for neighborhood aliases, property lingo, transit lines,
 * and fuzzy matching. Runs client-side — no API calls needed.
 */

import type { SearchFilters, SearchTab, AmenityFilter } from './types';
import {
  resolveNeighborhood,
  resolveBorough,
  matchLingo,
  matchTransit,
  type TransitMatch,
} from './nyc-dictionary';

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
  /\btrue\s+(\d)\b/i,  // "true 2" = actual 2 bedrooms (not flex)
];

// ── Bathroom patterns ──
const BATH_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|ba)\b/i,
];

// ── Price patterns ──
const PRICE_PATTERNS = [
  // Range: "$1M - $3M", "$500K-$1M", "1-3M", "2M to 4M"
  { regex: /\$?([\d,.]+)\s*(m(?:il(?:lion)?)?|k)?\s*[-–—to]+\s*\$?([\d,.]+)\s*(m(?:il(?:lion)?)?|k)?/i, type: 'range' as const },
  // Max: "under $2M", "below 2.5M", "max $3M", "<3M", "budget 2M"
  { regex: /(?:under|below|max|up\s*to|less\s*than|budget|<)\s*\$?([\d,.]+)\s*(m(?:il(?:lion)?)?|k)?/i, type: 'max' as const },
  // Min: "over $1M", "above $500K", "min $2M", "2M+"
  { regex: /(?:over|above|min(?:imum)?|at\s*least|more\s*than|from|starting\s*at|>)\s*\$?([\d,.]+)\s*(m(?:il(?:lion)?)?|k)?/i, type: 'min' as const },
  // Min with + suffix: "2M+", "$500K+"
  { regex: /\$?([\d,.]+)\s*(m(?:il(?:lion)?)?|k)\+/i, type: 'min' as const },
  // Standalone: "$2M", "$500K" (treated as maxPrice)
  { regex: /\$\s*([\d,.]+)\s*(m(?:il(?:lion)?)?|k)?/i, type: 'max' as const },
];

// ── Amenity patterns (same as before but kept in sync with types.ts AMENITY_FIELD_MAP) ──
const AMENITY_MAP: Record<string, AmenityFilter> = {
  'doorman': 'doorman',
  'concierge': 'doorman',
  'attended lobby': 'doorman',
  'dm': 'doorman',
  'gym': 'gym',
  'fitness': 'gym',
  'fitness center': 'gym',
  'pool': 'pool',
  'swimming': 'pool',
  'spa': 'spa',
  'sauna': 'sauna',
  'steam room': 'steam-room',
  'roof deck': 'roof-deck',
  'rooftop': 'roof-deck',
  'roof top': 'roof-deck',
  'roof': 'roof-deck',
  'playroom': 'playroom',
  "children's playroom": 'playroom',
  'laundry': 'laundry-room',
  'laundry room': 'laundry-room',
  'elevator': 'elevator',
  'elev': 'elevator',
  'lounge': 'lounge',
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
  'in unit laundry': 'washer-dryer',
  'outdoor space': 'outdoor-space',
  'outdoor': 'outdoor-space',
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
  'dogs ok': 'pet-friendly',
  'dogs': 'pet-friendly',
  'cats ok': 'pet-friendly',
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
  'walk-in closet': 'walk-in-closet',
  'walk in closet': 'walk-in-closet',
  'high ceilings': 'high-ceilings',
  'high ceiling': 'high-ceilings',
  'fireplace': 'fireplace',
  'light': 'natural-light',
  'sunny': 'natural-light',
  'bright': 'natural-light',
  'south facing': 'natural-light',
  'south-facing': 'natural-light',
  'views': 'views',
  'view': 'views',
  'quiet': 'quiet',
  'renovated': 'renovated',
  'new renovation': 'renovated',
  'gut renovated': 'renovated',
  'gut reno': 'renovated',
  'move-in ready': 'renovated',
  'move in ready': 'renovated',
  'no fee': 'no-fee',
  'no broker fee': 'no-fee',
};

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
  if (/\bstudio\b/i.test(remaining)) {
    filters.beds = 0;
    remaining = remaining.replace(/\bstudio\b/i, '');
  } else {
    // "true 2" = actual 2 bedrooms
    const trueMatch = remaining.match(/\btrue\s+(\d)\b/i);
    if (trueMatch) {
      filters.beds = parseInt(trueMatch[1]);
      remaining = remaining.replace(trueMatch[0], '');
    } else {
      const bedMatch = remaining.match(BED_PATTERNS[0]);
      if (bedMatch) {
        filters.beds = parseInt(bedMatch[1]);
        remaining = remaining.replace(bedMatch[0], '');
      }
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
      break;
    }
  }

  // ── NYC Property Lingo (jr4, flex 2, sponsor unit, prewar, etc.) ──
  const lingoResult = matchLingo(remaining);
  const keywords: string[] = [];
  const matchedSubTypes: string[] = [];

  for (const lingo of lingoResult.matches) {
    if (lingo.filterKey === 'propertySubTypes' && typeof lingo.filterValue === 'string') {
      matchedSubTypes.push(lingo.filterValue);
    } else if (lingo.filterKey === 'yearBuilt' && typeof lingo.filterValue === 'string') {
      filters.yearBuilt = lingo.filterValue as 'pre-war' | 'post-war';
    } else if (lingo.filterKey === 'noFee') {
      // Add no-fee to amenities for API compatibility
      if (!filters.amenities) filters.amenities = [];
      if (!filters.amenities.includes('no-fee')) filters.amenities.push('no-fee');
    } else if (lingo.filterKey === 'furnished') {
      filters.furnished = true;
    } else if (lingo.filterKey === 'keywords' && typeof lingo.filterValue === 'string') {
      keywords.push(lingo.filterValue);
    }
  }
  remaining = lingoResult.remainder;

  // ── Amenities (match longer phrases first) ──
  const matchedAmenities: AmenityFilter[] = filters.amenities || [];
  const sortedAmenityKeys = Object.keys(AMENITY_MAP).sort((a, b) => b.length - a.length);
  for (const pattern of sortedAmenityKeys) {
    const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(remaining)) {
      const amenity = AMENITY_MAP[pattern];
      if (!matchedAmenities.includes(amenity)) {
        matchedAmenities.push(amenity);
      }
      remaining = remaining.replace(regex, ' ');
    }
  }
  if (matchedAmenities.length > 0) {
    filters.amenities = matchedAmenities;
  }

  // ── Transit ──
  const transitResult = matchTransit(remaining);
  if (transitResult.match) {
    filters.transit = transitResult.match;
    remaining = transitResult.remainder;
  }

  // ── Neighborhoods (via NYC dictionary — handles aliases + fuzzy) ──
  let matchedNeighborhood: string | undefined;
  let matchedBorough: string | undefined;

  // Try multi-word neighborhood names first (longest match)
  // Split remaining into candidate phrases
  const words = remaining.split(/\s+/);
  for (let len = Math.min(words.length, 4); len >= 1; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      const phrase = words.slice(start, start + len).join(' ');
      const resolved = resolveNeighborhood(phrase);
      if (resolved) {
        matchedNeighborhood = resolved.name;
        matchedBorough = resolved.borough;
        // Remove matched words from remaining
        const phraseRegex = new RegExp(
          `\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i'
        );
        remaining = remaining.replace(phraseRegex, ' ');
        break;
      }
    }
    if (matchedNeighborhood) break;
  }

  // Try borough if no neighborhood matched
  if (!matchedNeighborhood) {
    for (let len = Math.min(words.length, 2); len >= 1; len--) {
      for (let start = 0; start <= words.length - len; start++) {
        const phrase = words.slice(start, start + len).join(' ');
        const borough = resolveBorough(phrase);
        if (borough) {
          matchedBorough = borough;
          const phraseRegex = new RegExp(
            `\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            'i'
          );
          remaining = remaining.replace(phraseRegex, ' ');
          break;
        }
      }
      if (matchedBorough && !matchedNeighborhood) break;
    }
  }

  // ── Property types not caught by lingo (backward compat) ──
  const EXTRA_PROPERTY_MAP: Record<string, string[]> = {
    'single family': ['Single Family'],
    'house': ['Single Family', 'Townhouse'],
    'land': ['Land'],
    'mixed use': ['Mixed Use'],
  };
  for (const [pattern, types] of Object.entries(EXTRA_PROPERTY_MAP)) {
    const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(remaining)) {
      matchedSubTypes.push(...types);
      remaining = remaining.replace(regex, '');
    }
  }

  if (matchedSubTypes.length > 0) {
    filters.propertySubTypes = [...new Set(matchedSubTypes)];
  }

  // ── Furnished (if not caught by lingo) ──
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

  // ── High floor ──
  if (/\bhigh\s*floor\b/i.test(remaining)) {
    keywords.push('high floor');
    remaining = remaining.replace(/\bhigh\s*floor\b/i, '');
  }

  // ── Exposure ──
  const exposureMatch = remaining.match(/\b(north|south|east|west)\s*(?:facing|exposure)\b/i);
  if (exposureMatch) {
    keywords.push(`${exposureMatch[1].toLowerCase()} facing`);
    remaining = remaining.replace(exposureMatch[0], '');
  }

  // ── Open kitchen ──
  if (/\bopen\s*kitchen\b/i.test(remaining)) {
    keywords.push('open kitchen');
    remaining = remaining.replace(/\bopen\s*kitchen\b/i, '');
  }

  // Store keywords if any were collected
  if (keywords.length > 0) {
    filters.keywords = keywords;
  }

  // Clean up remaining — strip filler words
  remaining = remaining
    .replace(/\b(?:in|with|and|near|on|at|the|a|an|for|that|has|have|having|looking|want|need|find|show|me|something|like)\b/gi, '')
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest lib/search/__tests__/natural-language-parser.test.ts --no-coverage`
Expected: All 10 tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/search/natural-language-parser.ts lib/search/types.ts lib/search/__tests__/natural-language-parser.test.ts
git commit -m "feat(search): wire NYC dictionary into NL parser — lingo, fuzzy, transit, keywords"
```

---

### Task 3: Filter Chips Component

**Files:**
- Create: `app/components/SearchChips.tsx`

Color-coded, removable filter chips that appear between search bar and results.

- [ ] **Step 1: Create SearchChips component**

```tsx
// app/components/SearchChips.tsx
'use client';

import type { SearchFilters } from '@/lib/search/types';
import type { TransitMatch } from '@/lib/search/nyc-dictionary';

export interface FilterChip {
  id: string;
  label: string;
  type: 'neighborhood' | 'borough' | 'beds' | 'baths' | 'price' | 'amenity' | 'property' | 'keyword' | 'transit' | 'yearBuilt' | 'other';
  filterKey: string;  // Which filter to clear when removed
  filterValue?: string | number | boolean;
}

// Color coding per chip type
const CHIP_COLORS: Record<FilterChip['type'], string> = {
  neighborhood: 'bg-brand-gold/15 text-brand-gold-deep border-brand-gold/30',
  borough: 'bg-brand-gold/15 text-brand-gold-deep border-brand-gold/30',
  beds: 'bg-blue-50 text-blue-700 border-blue-200',
  baths: 'bg-blue-50 text-blue-700 border-blue-200',
  price: 'bg-blue-50 text-blue-700 border-blue-200',
  amenity: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  property: 'bg-violet-50 text-violet-700 border-violet-200',
  keyword: 'bg-gray-100 text-gray-600 border-gray-200',
  transit: 'bg-orange-50 text-orange-700 border-orange-200',
  yearBuilt: 'bg-amber-50 text-amber-700 border-amber-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
};

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 1)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price.toLocaleString()}`;
}

const AMENITY_LABELS: Record<string, string> = {
  'doorman': 'Doorman', 'gym': 'Gym', 'pool': 'Pool', 'spa': 'Spa',
  'sauna': 'Sauna', 'steam-room': 'Steam Room', 'roof-deck': 'Roof Deck',
  'playroom': 'Playroom', 'laundry-room': 'Laundry', 'elevator': 'Elevator',
  'lounge': 'Lounge', 'bike-storage': 'Bike Storage', 'storage': 'Storage',
  'central-air': 'Central Air', 'dishwasher': 'Dishwasher',
  'washer-dryer': 'W/D', 'outdoor-space': 'Outdoor Space',
  'garage': 'Parking', 'pet-friendly': 'Pet Friendly',
  'park-views': 'Park Views', 'river-views': 'River Views',
  'skyline-views': 'Skyline Views', 'views': 'Views',
  'walk-in-closet': 'Walk-in Closet', 'high-ceilings': 'High Ceilings',
  'fireplace': 'Fireplace', 'natural-light': 'Sunny/Bright',
  'renovated': 'Renovated', 'quiet': 'Quiet', 'no-fee': 'No Fee',
};

/**
 * Build chip list from active filters.
 */
export function buildChips(
  filters: SearchFilters,
  neighborhoods: string[],
  borough?: string,
): FilterChip[] {
  const chips: FilterChip[] = [];

  // Neighborhoods
  for (const n of neighborhoods) {
    chips.push({ id: `n-${n}`, label: n, type: 'neighborhood', filterKey: 'neighborhood', filterValue: n });
  }

  // Borough
  if (borough) {
    chips.push({ id: `b-${borough}`, label: borough, type: 'borough', filterKey: 'borough', filterValue: borough });
  }

  // Beds
  if (filters.beds != null) {
    const label = filters.beds === 0 ? 'Studio' : `${filters.beds} Bed${filters.beds > 1 ? 's' : ''}`;
    chips.push({ id: 'beds', label, type: 'beds', filterKey: 'beds' });
  }

  // Baths
  if (filters.baths != null) {
    chips.push({ id: 'baths', label: `${filters.baths}+ Bath`, type: 'baths', filterKey: 'baths' });
  }

  // Price
  if (filters.minPrice && filters.maxPrice) {
    chips.push({ id: 'price', label: `${formatPrice(filters.minPrice)} – ${formatPrice(filters.maxPrice)}`, type: 'price', filterKey: 'price' });
  } else if (filters.maxPrice) {
    chips.push({ id: 'price', label: `Under ${formatPrice(filters.maxPrice)}`, type: 'price', filterKey: 'price' });
  } else if (filters.minPrice) {
    chips.push({ id: 'price', label: `${formatPrice(filters.minPrice)}+`, type: 'price', filterKey: 'price' });
  }

  // Property sub types
  if (filters.propertySubTypes?.length) {
    for (const t of filters.propertySubTypes) {
      chips.push({ id: `pt-${t}`, label: t, type: 'property', filterKey: 'propertySubTypes', filterValue: t });
    }
  }

  // Year built
  if (filters.yearBuilt && filters.yearBuilt !== 'any') {
    chips.push({ id: 'yearBuilt', label: filters.yearBuilt === 'pre-war' ? 'Pre-War' : 'Post-War', type: 'yearBuilt', filterKey: 'yearBuilt' });
  }

  // Amenities
  if (filters.amenities?.length) {
    for (const a of filters.amenities) {
      chips.push({ id: `a-${a}`, label: AMENITY_LABELS[a] || a, type: 'amenity', filterKey: 'amenities', filterValue: a });
    }
  }

  // Keywords
  if (filters.keywords?.length) {
    for (const k of filters.keywords) {
      const label = k.charAt(0).toUpperCase() + k.slice(1);
      chips.push({ id: `k-${k}`, label, type: 'keyword', filterKey: 'keywords', filterValue: k });
    }
  }

  // Transit
  if (filters.transit) {
    chips.push({ id: 'transit', label: filters.transit.label, type: 'transit', filterKey: 'transit' });
  }

  // Furnished
  if (filters.furnished) {
    chips.push({ id: 'furnished', label: 'Furnished', type: 'other', filterKey: 'furnished' });
  }

  // Open house
  if (filters.openHouse) {
    chips.push({ id: 'openHouse', label: 'Open House', type: 'other', filterKey: 'openHouse' });
  }

  return chips;
}

interface SearchChipsProps {
  chips: FilterChip[];
  onRemove: (chip: FilterChip) => void;
  onClearAll: () => void;
  total?: number;
}

export default function SearchChips({ chips, onRemove, onClearAll, total }: SearchChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${CHIP_COLORS[chip.type]}`}
        >
          {chip.label}
          <button
            onClick={() => onRemove(chip)}
            className="ml-0.5 hover:opacity-70 transition-opacity"
            aria-label={`Remove ${chip.label} filter`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-xs text-brand-dark/40 hover:text-brand-dark/70 transition-colors px-2 py-1"
        >
          Clear all
        </button>
      )}
      {total != null && (
        <span className="text-xs text-brand-dark/40 ml-auto">
          {total.toLocaleString()} result{total !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/SearchChips.tsx
git commit -m "feat(search): add filter chips component — color-coded, removable, with clear all"
```

---

### Task 4: Integrate Chips into Search Page

**Files:**
- Modify: `app/search/page.tsx` (lines ~7, ~270-330, ~490-530)

Wire the chip system into the search page. Chips appear from NL-parsed queries AND from manual filter changes. Removing a chip clears the corresponding filter.

- [ ] **Step 1: Add imports at top of search/page.tsx**

After line 7 (`import SearchAutocomplete...`), add:

```typescript
import SearchChips, { buildChips, type FilterChip } from '@/app/components/SearchChips';
```

- [ ] **Step 2: Build chips from active filters**

After the `sortedListings` useMemo (around line 374), add:

```typescript
  // ── Filter chips — built from active filters + NL-parsed state ──
  const activeChips = useMemo(() => {
    const mergedFilters: SearchFilters = {
      ...filters,
      // NL-parsed values fill in where toolbar filters are empty
      beds: filters.beds ?? nl?.beds,
      baths: filters.baths ?? nl?.baths,
      minPrice: filters.minPrice ?? nl?.minPrice,
      maxPrice: filters.maxPrice ?? nl?.maxPrice,
      propertySubTypes: filters.propertySubTypes?.length ? filters.propertySubTypes : nl?.propertySubTypes,
      yearBuilt: filters.yearBuilt ?? nl?.yearBuilt,
      amenities: filters.amenities?.length ? filters.amenities : nl?.amenities,
      keywords: nl?.keywords,
      transit: nl?.transit,
    };
    return buildChips(
      mergedFilters,
      selectedNeighborhoods,
      resolvedSearch.borough || boroughParam || undefined,
    );
  }, [filters, nl, selectedNeighborhoods, resolvedSearch.borough, boroughParam]);

  // ── Handle chip removal — clears the corresponding filter ──
  const handleChipRemove = useCallback((chip: FilterChip) => {
    switch (chip.filterKey) {
      case 'neighborhood':
        setSelectedNeighborhoods(prev => prev.filter(n => n !== chip.filterValue));
        break;
      case 'borough':
        // Clear borough from URL — set searchQuery to empty if it was borough-only
        setSearchQuery('');
        break;
      case 'beds':
        setFilters(prev => ({ ...prev, beds: null }));
        break;
      case 'baths':
        setFilters(prev => ({ ...prev, baths: null }));
        break;
      case 'price':
        setFilters(prev => ({ ...prev, minPrice: undefined, maxPrice: undefined }));
        break;
      case 'propertySubTypes':
        setFilters(prev => ({
          ...prev,
          propertySubTypes: prev.propertySubTypes?.filter(t => t !== chip.filterValue),
        }));
        break;
      case 'yearBuilt':
        setFilters(prev => ({ ...prev, yearBuilt: undefined }));
        break;
      case 'amenities':
        setFilters(prev => ({
          ...prev,
          amenities: prev.amenities?.filter(a => a !== chip.filterValue),
        }));
        break;
      case 'furnished':
        setFilters(prev => ({ ...prev, furnished: undefined }));
        break;
      case 'openHouse':
        setFilters(prev => ({ ...prev, openHouse: undefined }));
        break;
      case 'keywords':
      case 'transit':
        // These come from NL parse — clear the search query to remove
        setSearchQuery('');
        break;
    }
  }, []);

  const handleClearAllChips = useCallback(() => {
    setFilters({});
    setSelectedNeighborhoods([]);
    setSearchQuery('');
  }, []);
```

- [ ] **Step 3: Render chips between toolbar and results**

Find the results area in the JSX (the section after the toolbar row and before the listings grid). Insert the chips bar. This goes right before the listings/map container:

```tsx
      {/* Filter Chips */}
      <SearchChips
        chips={activeChips}
        onRemove={handleChipRemove}
        onClearAll={handleClearAllChips}
        total={total}
      />
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds (or only pre-existing warnings)

- [ ] **Step 5: Commit**

```bash
git add app/search/page.tsx
git commit -m "feat(search): integrate filter chips into search page — auto-generated from NL parse + manual filters"
```

---

### Task 5: Enhance HeroSearch with NYC Dictionary Suggestions

**Files:**
- Modify: `app/components/HeroSearch.tsx` (lines ~29-45, ~106-132, ~456-496)

Add NYC dictionary suggestions to the homepage hero search dropdown. When someone types "ues" or "door", show dictionary matches alongside API suggestions.

- [ ] **Step 1: Add dictionary import and merge into suggestions**

At top of `HeroSearch.tsx`, add import:

```typescript
import { getSuggestions as getDictionarySuggestions, type DictionarySuggestion } from '@/lib/search/nyc-dictionary';
```

- [ ] **Step 2: Merge dictionary suggestions into the fetch flow**

Replace the `fetchSuggestions` callback (lines ~107-132) to also include dictionary matches:

```typescript
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    // Instant: dictionary matches (neighborhoods, lingo, transit)
    const dictMatches = getDictionarySuggestions(searchQuery, 4);
    const dictSuggestions: SearchSuggestion[] = dictMatches
      .filter(d => d.type === 'neighborhood' || d.type === 'borough')
      .map(d => ({
        type: 'neighborhood' as const,
        label: d.label,
        sublabel: d.sublabel,
        value: d.value,
      }));

    // Set dictionary results immediately (no network wait)
    if (dictSuggestions.length > 0) {
      setSuggestions(dictSuggestions);
    }

    // Then fetch API results (addresses, listings, agents) and merge
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/listings/suggest?q=${encodeURIComponent(searchQuery)}`,
        { signal: controller.signal }
      );
      const data = await res.json();
      if (data.success && data.suggestions?.length > 0) {
        // Merge: dictionary first, then API results (deduplicated)
        const seen = new Set(dictSuggestions.map(s => `${s.type}-${s.value}`));
        const apiFiltered = (data.suggestions as SearchSuggestion[]).filter(s => {
          const key = `${s.type}-${s.value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSuggestions([...dictSuggestions, ...apiFiltered].slice(0, 6));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Keep dictionary results even if API fails
    }
  }, []);
```

- [ ] **Step 3: Update EXAMPLE_QUERIES to include NYC lingo**

Replace `EXAMPLE_QUERIES` (lines ~38-45):

```typescript
const EXAMPLE_QUERIES = [
  '2br UES doorman under 3M',
  'studio Chelsea no fee pet friendly',
  'prewar coop Park Slope',
  'wburg 1bed w/d near the L',
  'sunny loft Tribeca with views',
  'penthouse FiDi high floor',
  'brownstone Brooklyn 2-4M',
  'jr4 Gramercy elevator',
];
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/components/HeroSearch.tsx
git commit -m "feat(search): NYC dictionary suggestions in hero search — instant abbreviation matching"
```

---

### Task 6: Enhance SearchAutocomplete on Search Page

**Files:**
- Modify: `app/components/SearchAutocomplete.tsx` (lines ~26-33, ~65-99, ~206-211)

Same treatment as HeroSearch: add dictionary-powered filter suggestions to the search page autocomplete.

- [ ] **Step 1: Add dictionary import**

At top of `SearchAutocomplete.tsx`, add:

```typescript
import { getSuggestions as getDictionarySuggestions } from '@/lib/search/nyc-dictionary';
```

- [ ] **Step 2: Add 'filter' to Suggestion type and CATEGORY_ORDER**

Update the `Suggestion` interface (line 5) to include filter type:

```typescript
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
```

Add filter category to `CATEGORY_ORDER` (after 'LOCATIONS' entry):

```typescript
  { type: 'filter', header: 'FILTERS' },
```

Update `typeLabel` function to handle 'filter':

```typescript
    case 'filter': return 'FILTER';
```

- [ ] **Step 3: Merge dictionary results into fetch**

In the `fetchSuggestions` callback (lines ~65-99), add dictionary matching at the beginning:

```typescript
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Instant: dictionary suggestions (neighborhoods, lingo, transit)
    const dictMatches = getDictionarySuggestions(query, 4);
    const dictSuggestions: Suggestion[] = dictMatches.map(d => ({
      type: d.type === 'filter' || d.type === 'transit' ? 'filter' as const : 'neighborhood' as const,
      label: d.label,
      sublabel: d.sublabel,
      value: d.value,
    }));

    // Show dictionary results immediately
    if (dictSuggestions.length > 0) {
      setSuggestions(dictSuggestions);
      setIsOpen(true);
      setActiveIndex(-1);
    }

    // Then fetch API results and merge
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
        const seen = new Set(dictSuggestions.map(s => `${s.type}-${s.value}`));
        const apiFiltered = (data.suggestions as Suggestion[]).filter(s => {
          const key = `${s.type}-${s.value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const merged = [...dictSuggestions, ...apiFiltered].slice(0, 8);
        setSuggestions(merged);
        setIsOpen(true);
        setActiveIndex(-1);
      } else if (dictSuggestions.length === 0) {
        setSuggestions([]);
        setIsOpen(false);
      }
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
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/components/SearchAutocomplete.tsx
git commit -m "feat(search): NYC dictionary suggestions in search page autocomplete"
```

---

### Task 7: Wire Keywords to API & Clean Up Dead Code

**Files:**
- Modify: `app/api/listings/route.ts` (add keywords/remarks search)
- Modify: `app/search/page.tsx` (pass keywords to API)
- Delete: `app/components/PropertySearch.tsx`

- [ ] **Step 1: Add keywords query param to listings API**

In `app/api/listings/route.ts`, where query params are parsed (around line 124-165), add:

```typescript
    const keywords = searchParams.get('keywords')?.split(',').filter(Boolean) || [];
```

Then in the DB query `where` clause (around line 200-250), if keywords are present, add a PublicRemarks text search:

```typescript
    // Keywords search — matches against PublicRemarks (JSON field or text)
    if (keywords.length > 0) {
      for (const kw of keywords) {
        const safe = kw.replace(/[%_]/g, '').trim();
        if (safe) {
          where.public_remarks = { contains: safe, mode: 'insensitive' };
        }
      }
    }
```

- [ ] **Step 2: Pass keywords from search page to API**

In `app/search/page.tsx`, in the `useListings` hook call (around line 309-332), add keywords:

```typescript
    keywords: nl?.keywords?.join(',') || undefined,
```

And ensure `useListings` passes it through to the API URL.

- [ ] **Step 3: Delete dead PropertySearch.tsx**

```bash
rm app/components/PropertySearch.tsx
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds, no import errors

- [ ] **Step 5: Commit**

```bash
git add app/api/listings/route.ts app/search/page.tsx
git rm app/components/PropertySearch.tsx
git commit -m "feat(search): wire keywords to API remarks search + delete dead PropertySearch.tsx"
```

---

### Task 8: Remove Console Statements & Final Polish

**Files:**
- Modify: `app/search/page.tsx` (line 30)
- Modify: `app/listing/[id]/page.tsx` (lines 170, 215, 233)

- [ ] **Step 1: Remove console.warn from search map error boundary**

In `app/search/page.tsx` line 30, replace:
```typescript
    console.warn('[SearchMap] Map failed to load:', error.message, info.componentStack?.slice(0, 200));
```
with nothing (remove the line — the error boundary already handles the display).

- [ ] **Step 2: Remove console statements from listing page**

In `app/listing/[id]/page.tsx`:

Line 170 — replace `console.warn('[ACRIS fallback] Error:', err);` with nothing (the try/catch already returns null).

Line 215 — replace `console.error(...)` with nothing.

Line 233 — replace `console.warn(...)` with nothing.

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add app/search/page.tsx app/listing/[id]/page.tsx
git commit -m "fix: remove console.warn/error statements from production code"
```

---

## Summary

| Task | What it builds | Files |
|------|---------------|-------|
| 1 | NYC Dictionary (120+ aliases, lingo, transit, fuzzy) | `nyc-dictionary.ts` + tests |
| 2 | Expanded NL parser (wired to dictionary) | `natural-language-parser.ts` + tests |
| 3 | Filter chips component | `SearchChips.tsx` |
| 4 | Chips integrated into search page | `search/page.tsx` |
| 5 | Dictionary suggestions in hero search | `HeroSearch.tsx` |
| 6 | Dictionary suggestions in search autocomplete | `SearchAutocomplete.tsx` |
| 7 | Keywords API + dead code cleanup | `listings/route.ts` + delete `PropertySearch.tsx` |
| 8 | Console cleanup | `search/page.tsx` + `listing/[id]/page.tsx` |

Tasks 1-2 are the foundation (dictionary + parser). Tasks 3-6 are the UI. Tasks 7-8 are cleanup. Each task produces a working commit.
