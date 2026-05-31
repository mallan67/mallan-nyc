/**
 * NYC address normalizer — parses free-form NYC address strings into
 * canonical RESO/Trestle address components.
 *
 * @module lib/address/nyc-address-normalizer
 */

export interface NormalizedAddress {
  StreetNumber: string;
  StreetDirPrefix: string;
  StreetName: string;
  StreetSuffix: string;
  UnitNumber: string;
  City: string;
  StateOrProvince: string;
  PostalCode: string;
}

const DIRECTION_MAP: Record<string, string> = {
  east: 'E',
  west: 'W',
  north: 'N',
  south: 'S',
  'e.': 'E',
  'w.': 'W',
  'n.': 'N',
  's.': 'S',
  e: 'E',
  w: 'W',
  n: 'N',
  s: 'S',
};

const SUFFIX_MAP: Record<string, string> = {
  street: 'St',
  'st.': 'St',
  st: 'St',
  avenue: 'Ave',
  'ave.': 'Ave',
  ave: 'Ave',
  boulevard: 'Blvd',
  'blvd.': 'Blvd',
  blvd: 'Blvd',
  place: 'Pl',
  'pl.': 'Pl',
  pl: 'Pl',
  drive: 'Dr',
  'dr.': 'Dr',
  dr: 'Dr',
  road: 'Rd',
  'rd.': 'Rd',
  rd: 'Rd',
  lane: 'Ln',
  'ln.': 'Ln',
  ln: 'Ln',
  way: 'Way',
  court: 'Ct',
  'ct.': 'Ct',
  ct: 'Ct',
  terrace: 'Ter',
  'ter.': 'Ter',
  ter: 'Ter',
  parkway: 'Pkwy',
  'pkwy.': 'Pkwy',
  pkwy: 'Pkwy',
};

const UNIT_PREFIXES = new Set(['apt', 'apt.', 'unit', 'suite', 'ste', 'ste.', '#', 'no', 'no.', 'fl', 'fl.', 'floor', 'ph', 'penthouse']);

const NYC_ZIPS: Record<string, string> = {};

/**
 * Normalize an ordinal street name to consistent form.
 * "46" → "46th", "1" → "1st", "2" → "2nd", "3" → "3rd", "42" → "42nd"
 */
function normalizeOrdinal(num: string): string {
  const n = parseInt(num, 10);
  if (isNaN(n)) return num;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Canonicalize an already-parsed street DIRECTION token to its RESO/Trestle
 * abbreviation: "East"/"e."/"E" → "E". Returns '' for blank; returns the
 * trimmed input unchanged when it is not a recognized direction (so it never
 * destroys data). Used by callers that compare RESO address COMPONENTS (not a
 * free-form string) — e.g. building-identity matching, where one source may
 * carry "East" and another "E" for the same building.
 */
export function canonicalizeDirection(token: string): string {
  const t = (token ?? '').trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  return DIRECTION_MAP[lower] || DIRECTION_MAP[lower.replace(/\.$/, '')] || t;
}

/**
 * Canonicalize an already-parsed street SUFFIX token to its RESO/Trestle
 * abbreviation: "Street"/"st." → "St", "Avenue" → "Ave". Returns '' for blank;
 * returns the trimmed input unchanged when not a recognized suffix.
 */
export function canonicalizeSuffix(token: string): string {
  const t = (token ?? '').trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  return SUFFIX_MAP[lower] || SUFFIX_MAP[lower.replace(/\.$/, '')] || t;
}

/**
 * Canonicalize ordinals inside an already-parsed street NAME so "46" and "46TH"
 * resolve to the same token ("46th"). Leaves non-ordinal name tokens untouched.
 */
export function canonicalizeStreetName(name: string): string {
  const t = (name ?? '').trim();
  if (!t) return '';
  return t
    .split(/\s+/)
    .map((part) => {
      const m = part.match(/^(\d+)(?:st|nd|rd|th)?$/i);
      return m ? normalizeOrdinal(m[1]) : part;
    })
    .join(' ');
}

/**
 * Parse a free-form NYC address string into canonical RESO components.
 *
 * Handles:
 *   "333 E 46th St Apt 2G"
 *   "333 East 46th Street Apt 2G"
 *   "333 E. 46 St #2G"
 *   "333 E 46th St, Apt. 2G, New York, NY 10017"
 */
export function normalizeNycAddress(input: string): NormalizedAddress {
  const result: NormalizedAddress = {
    StreetNumber: '',
    StreetDirPrefix: '',
    StreetName: '',
    StreetSuffix: '',
    UnitNumber: '',
    City: '',
    StateOrProvince: '',
    PostalCode: '',
  };

  if (!input || !input.trim()) return result;

  // Split on commas first to separate address, city, state, zip
  const segments = input.split(',').map(s => s.trim()).filter(Boolean);

  // Re-attach any comma-separated segment that starts with a unit prefix
  // back to the street segment (handles "333 E 46th St, Apt. 2G, ...")
  let streetParts = [segments[0] || ''];
  let remainingSegments: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    const firstWord = segments[i].split(/\s+/)[0].toLowerCase().replace(/\.$/, '');
    if (UNIT_PREFIXES.has(firstWord)) {
      streetParts.push(segments[i]);
    } else {
      remainingSegments.push(segments[i]);
    }
  }

  let streetSegment = streetParts.join(' ');
  let cityStateZip = remainingSegments.join(', ');

  // Extract zip code from anywhere
  const zipMatch = cityStateZip.match(/\b(\d{5})(?:-\d{4})?\b/) || streetSegment.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    result.PostalCode = zipMatch[1];
    cityStateZip = cityStateZip.replace(zipMatch[0], '').trim();
  }

  // Parse remaining segments for city, state, zip
  // Split back into segments for precise handling
  const cszParts = cityStateZip.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of cszParts) {
    // Pure state abbreviation (2-letter)
    if (/^NY$/i.test(part.trim())) {
      result.StateOrProvince = 'NY';
      continue;
    }
    // State + zip: "NY 10017"
    const stateZip = part.match(/^(NY)\s+(\d{5})(?:-\d{4})?$/i);
    if (stateZip) {
      result.StateOrProvince = 'NY';
      if (!result.PostalCode) result.PostalCode = stateZip[2];
      continue;
    }
    // Zip only
    const zipOnly = part.match(/^(\d{5})(?:-\d{4})?$/);
    if (zipOnly) {
      result.PostalCode = zipOnly[1];
      continue;
    }
    // Everything else → city
    if (!result.City) {
      result.City = part;
    }
  }

  if (!result.City) result.City = 'New York';
  if (!result.StateOrProvince) result.StateOrProvince = 'NY';

  // Now parse the street segment: "333 E 46th St Apt 2G"
  // Normalize # prefix for unit: "333 E 46th St #2G" → "333 E 46th St Apt 2G"
  streetSegment = streetSegment.replace(/#(\w+)/g, 'Apt $1');

  const tokens = streetSegment.split(/\s+/).filter(Boolean);
  let idx = 0;

  // Street number (first token if numeric, possibly with letter suffix like "333A")
  if (idx < tokens.length && /^\d+[a-zA-Z]?$/.test(tokens[idx])) {
    result.StreetNumber = tokens[idx];
    idx++;
  }

  // Direction prefix
  if (idx < tokens.length) {
    const dirKey = tokens[idx].toLowerCase().replace(/\.$/, '') + (tokens[idx].endsWith('.') ? '.' : '');
    const dirLower = tokens[idx].toLowerCase();
    if (DIRECTION_MAP[dirLower] || DIRECTION_MAP[dirKey]) {
      result.StreetDirPrefix = DIRECTION_MAP[dirLower] || DIRECTION_MAP[dirKey];
      idx++;
    }
  }

  // Collect street name tokens until we hit a suffix, unit prefix, or end
  const streetNameParts: string[] = [];
  let suffix = '';

  while (idx < tokens.length) {
    const lower = tokens[idx].toLowerCase().replace(/\.$/, '');
    const lowerWithDot = tokens[idx].toLowerCase();

    // Check for unit prefix
    if (UNIT_PREFIXES.has(lower) || UNIT_PREFIXES.has(lowerWithDot)) {
      idx++;
      // Collect unit number tokens
      const unitParts: string[] = [];
      while (idx < tokens.length) {
        const ul = tokens[idx].toLowerCase();
        if (ul === ',' || SUFFIX_MAP[ul]) break;
        unitParts.push(tokens[idx]);
        idx++;
      }
      if (unitParts.length > 0) {
        result.UnitNumber = unitParts.join('').replace(/[-\s]/g, '').toUpperCase();
      }
      continue;
    }

    // Check for street suffix
    if (SUFFIX_MAP[lower] || SUFFIX_MAP[lowerWithDot]) {
      suffix = SUFFIX_MAP[lower] || SUFFIX_MAP[lowerWithDot];
      idx++;
      continue;
    }

    // Regular street name token
    streetNameParts.push(tokens[idx]);
    idx++;
  }

  // Normalize the street name — handle ordinals
  if (streetNameParts.length > 0) {
    const normalized = streetNameParts.map(part => {
      // If it's a bare number or has ordinal suffix, normalize the ordinal
      const ordinalMatch = part.match(/^(\d+)(?:st|nd|rd|th)?$/i);
      if (ordinalMatch) {
        return normalizeOrdinal(ordinalMatch[1]);
      }
      return part;
    });
    result.StreetName = normalized.join(' ');
  }

  if (suffix) {
    result.StreetSuffix = suffix;
  }

  return result;
}
