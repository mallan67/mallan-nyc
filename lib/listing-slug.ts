/**
 * Address-based listing slug generation.
 *
 * COMPLIANCE:
 * - InternetAddressDisplayYN gate: if false, slug MUST NOT contain the address.
 *   Falls back to MLS ID slug to prevent address leakage via URL.
 * - REBNY RLS / UCBA 2026: no rule mandates MLS-ID-based URLs.
 *   Address slugs are standard practice (Compass, Corcoran, StreetEasy).
 *
 * Slug format:  400-east-90th-street-apt-17c-new-york-ny-10128
 * Fallback:     listing-RBNY-12345678  (when address is suppressed)
 *
 * @module lib/listing-slug
 */

/**
 * Generate a URL-safe slug from listing address fields.
 * Returns an MLS-ID-based fallback when address must be suppressed.
 */
export function generateListingSlug(listing: {
  address: {
    streetNumber?: string;
    streetName?: string;
    unitNumber?: string | null;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
  };
  /** MLS ListingId — used as fallback when address is suppressed */
  id?: string;
  mlsId?: string;
  /** If false, address MUST NOT appear in the URL (REBNY compliance). */
  internetAddressDisplayYN?: boolean;
}): string {
  // COMPLIANCE GATE: InternetAddressDisplayYN
  // If seller opted out of address display, the address CANNOT appear in the URL.
  // This prevents address leakage via the URL path. Violation = incurable UCBA penalty.
  if (listing.internetAddressDisplayYN === false) {
    return mlsIdSlug(listing.mlsId || listing.id || 'unknown');
  }

  const { streetNumber, streetName, unitNumber, city, stateOrProvince, postalCode } = listing.address;

  // If no meaningful address data, fall back to MLS ID
  if (!streetName || streetName === 'Address Undisclosed') {
    return mlsIdSlug(listing.mlsId || listing.id || 'unknown');
  }

  const parts: string[] = [];

  if (streetNumber) parts.push(streetNumber);
  if (streetName) parts.push(streetName);
  if (unitNumber) parts.push(`apt-${unitNumber}`);
  if (city) parts.push(city);
  if (stateOrProvince) parts.push(stateOrProvince);
  if (postalCode) parts.push(postalCode);

  const slug = slugify(parts.join(' '));

  // Ensure slug is non-empty after sanitization
  return slug || mlsIdSlug(listing.mlsId || listing.id || 'unknown');
}

/**
 * Check if a slug is an MLS-ID-based fallback (no address content).
 */
export function isMlsIdSlug(slug: string): boolean {
  return slug.startsWith('listing-');
}

/**
 * Extract MLS ID from a fallback slug.
 * Returns null if the slug is address-based.
 */
export function extractMlsIdFromSlug(slug: string): string | null {
  if (!isMlsIdSlug(slug)) return null;
  return slug.replace(/^listing-/, '');
}

/** Convert MLS ID to fallback slug */
function mlsIdSlug(mlsId: string): string {
  return `listing-${slugify(mlsId)}`;
}

/**
 * Parse an address slug back into approximate address components for Trestle lookup.
 * Returns null if the slug is MLS-ID-based or unparseable.
 *
 * Slug format: 400-east-90th-street-apt-17c-new-york-ny-10128
 * Parses:      streetNumber=400, streetName=east 90th street, unitNumber=17c,
 *              city=new york, stateOrProvince=ny, postalCode=10128
 */
export function parseAddressSlug(slug: string): {
  streetNumber: string;
  streetName: string;
  city: string;
  postalCode: string;
  unitNumber?: string;
} | null {
  if (isMlsIdSlug(slug)) return null;

  const parts = slug.split('-');
  if (parts.length < 4) return null;

  // Extract postal code (last part, 5 digits)
  let postalCode = '';
  if (/^\d{5}$/.test(parts[parts.length - 1])) {
    postalCode = parts.pop()!;
  }

  // Extract state (last remaining part, typically 2 chars)
  let state = '';
  if (parts.length > 0 && /^[a-z]{2}$/.test(parts[parts.length - 1])) {
    state = parts.pop()!;
  }

  // Extract street number (first part, numeric)
  let streetNumber = '';
  if (/^\d+$/.test(parts[0])) {
    streetNumber = parts.shift()!;
  }

  // Find "apt" marker to split unit from street/city
  let unitNumber: string | undefined;
  const aptIndex = parts.indexOf('apt');
  if (aptIndex !== -1) {
    // Everything after "apt" up to the city boundary is the unit number
    // Unit is typically the next token after "apt"
    const afterApt = parts.splice(aptIndex);
    afterApt.shift(); // remove "apt"
    if (afterApt.length > 0) {
      unitNumber = afterApt.shift()!;
      // Remaining after unit goes back (city tokens)
      parts.push(...afterApt);
    }
  }

  // Remaining parts = street name + city
  // Heuristic: try to identify NYC city names at the end
  // Trestle returns City as "New York City", "New York", borough names, or neighborhood names.
  // Longer names MUST come first so "new-york-city" matches before "new-york".
  const NYC_CITIES = [
    'new-york-city', 'long-island-city', 'staten-island',
    'new-york', 'manhattan', 'brooklyn', 'queens', 'bronx',
    // Common Trestle city values for outer boroughs / sub-areas
    'forest-hills', 'jamaica', 'flushing', 'astoria', 'bayside',
    'rego-park', 'jackson-heights', 'woodside', 'sunnyside',
    'kew-gardens', 'fresh-meadows', 'bay-ridge', 'park-slope',
    'williamsburg', 'greenpoint', 'bushwick', 'bed-stuy',
    'crown-heights', 'flatbush', 'bensonhurst', 'sunset-park',
    'riverdale', 'pelham-bay', 'throggs-neck', 'morris-park',
  ];
  const remaining = parts.join('-');

  let streetName = '';
  let city = '';

  // Try to match a known city at the end of the remaining string
  for (const nycCity of NYC_CITIES) {
    if (remaining.endsWith(nycCity)) {
      city = remaining.slice(0, -(nycCity.length)).replace(/-$/, '').replace(/-/g, ' ');
      city = nycCity.replace(/-/g, ' ');
      streetName = remaining.slice(0, remaining.length - nycCity.length).replace(/-$/, '').replace(/-/g, ' ');
      break;
    }
  }

  // If no known city found, try splitting on common patterns
  if (!city && remaining.length > 0) {
    // Take everything as street name, city unknown
    streetName = remaining.replace(/-/g, ' ');
  }

  if (!streetNumber && !streetName) return null;

  return {
    streetNumber,
    streetName: streetName.trim(),
    city: city.trim(),
    postalCode,
    unitNumber,
  };
}

/** Sanitize text into a URL-safe slug */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Replace common abbreviations
    .replace(/\bapt\.?\b/g, 'apt')
    .replace(/\bste\.?\b/g, 'ste')
    .replace(/\bfl\.?\b/g, 'fl')
    // Replace non-alphanumeric with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse multiple hyphens
    .replace(/-{2,}/g, '-')
    // Trim leading/trailing hyphens
    .replace(/^-|-$/g, '');
}
