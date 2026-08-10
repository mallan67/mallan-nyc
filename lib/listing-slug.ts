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
 * SEO-001 (2026-07-02) — the ONLY way to compose the street string for slug
 * generation. Used by BOTH the listing page and app/sitemap.ts so the sitemap
 * URL and the page canonical CANNOT diverge again.
 *
 * Why this exists: Cotality delivers the street in separate fields
 * (StreetDirPrefix "W" · StreetName "20th" · StreetSuffix "Street" — verified
 * live 2026-07-01). The sitemap previously passed StreetName ALONE into
 * generateListingSlug while the page composed all three, so 10,069 of 10,239
 * sitemap listing URLs (98.3%, full-population audit) omitted the street
 * type/direction and soft-redirected. One helper = one composition = parity,
 * locked by tests/runtime/sitemap-slug-canonical-parity.test.ts.
 *
 * Case-tolerant (PascalCase canonical first, camelCase legacy fallback) —
 * same precedent as the open-house pickAddressParts reader (#463).
 */
export function composeSlugStreetName(addr: Record<string, unknown>): string {
  const pick = (pascal: string, camel: string): string => {
    // Codex #468: a trimmed-BLANK PascalCase value must fall through to the
    // camelCase legacy key (`??` only skips null/undefined, which kept the
    // empty string and dropped the street on mixed legacy JSON — the old
    // sitemap `||` behavior and the pickAddressParts precedent both skip
    // blanks). PascalCase wins only when it has real content.
    const pv = typeof addr[pascal] === 'string' ? (addr[pascal] as string).trim() : '';
    if (pv) return pv;
    const cv = typeof addr[camel] === 'string' ? (addr[camel] as string).trim() : '';
    return cv;
  };
  return [
    pick('StreetDirPrefix', 'streetDirPrefix'),
    pick('StreetName', 'streetName'),
    pick('StreetSuffix', 'streetSuffix'),
    // StreetDirSuffix was missing here while the canonical DB DTO composed it
    // independently — so a "N Main Street NW" address produced DIFFERENT slugs
    // from the sitemap and the DTO. Included so this helper is the ONE street
    // composition, which is the whole reason it exists.
    pick('StreetDirSuffix', 'streetDirSuffix'),
  ].filter(Boolean).join(' ');
}

/**
 * Generate a URL-safe slug from listing address fields.
 * Returns an MLS-ID-based fallback when address must be suppressed.
 *
 * 2026-05-15 (Option D, PR-FE.2) — Address-based slugs now ALSO include
 * a `-{slugified-listing-id}` suffix when a listing id is provided AND
 * the address slug was successfully generated. This makes URLs unique per
 * distinct REBNY listing_id, fixing the NYC luxury new-development case
 * where 3 brokerages co-list the same physical apartment and all 3 cards
 * resolved to the same `/listing/{address-slug}` URL (so clicking any of
 * them landed on the same first-match detail page).
 *
 * Slug examples:
 *   address-only fallback (no id):
 *     400-east-90th-street-apt-17c-new-york-ny-10128
 *   address + id (new default for displayable listings):
 *     400-east-90th-street-apt-17c-new-york-ny-10128-rls20061539
 *   id-only (when address is suppressed by InternetAddressDisplayYN):
 *     listing-rls20061539
 *
 * Backward compatibility: address-only slugs (no `-rlsXXX` suffix)
 * generated BEFORE this change remain resolvable via `parseAddressSlug`
 * and the detail route's Strategy 2 (address lookup). Indexed URLs do
 * not 404 after the upgrade.
 */
export function generateListingSlug(listing: {
  address: {
    streetNumber?: string;
    streetDirPrefix?: string;
    streetName?: string;
    unitNumber?: string | null;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
  };
  /** MLS ListingId — used as fallback when address is suppressed AND
   *  as a uniqueness suffix on address-based slugs (Option D). */
  id?: string;
  mlsId?: string;
  /** If false, address MUST NOT appear in the URL (REBNY compliance). */
  internetAddressDisplayYN?: boolean;
}): string {
  // COMPLIANCE GATE: InternetAddressDisplayYN
  // If seller opted out of address display, the address CANNOT appear in the URL.
  // This prevents address leakage via the URL path. Violation = incurable UCBA penalty.
  if (listing.internetAddressDisplayYN === false) {
    return publicIdSlug(listing.id || listing.mlsId || 'unknown');
  }

  const { streetNumber, streetDirPrefix, streetName, unitNumber, city, stateOrProvince, postalCode } = listing.address;

  // SEO guard: Mallan exclusives (SL-/RL- listing IDs) should NEVER fall
  // back to the generic `listing-XXX` slug because that URL pattern destroys
  // search-engine value. If a CRM exclusive somehow reaches this code path
  // with empty streetName, log to the console (visible in Vercel logs) and
  // try one more time to compose ANY address-derived slug from whatever
  // fields are present. Only fall back to generic for non-CRM listings.
  const idStr = String(listing.id || listing.mlsId || '');
  const isCrmExclusive = /^(SL|RL)-/i.test(idStr);

  // If no meaningful address data, fall back to MLS ID (except CRM exclusives)
  if (!streetName || streetName === 'Address Undisclosed') {
    if (isCrmExclusive) {
      // eslint-disable-next-line no-console
      console.warn(`[listing-slug] CRM exclusive ${idStr} has empty streetName — attempting best-effort slug from other fields`);
      const altParts = [streetNumber, streetDirPrefix, city, stateOrProvince, postalCode].filter(Boolean);
      if (altParts.length >= 2) {
        const altSlug = slugify(altParts.join(' '));
        const idSuffix = listing.id ? `-${slugify(listing.id)}` : '';
        if (altSlug) return `${altSlug}${idSuffix}`;
      }
    }
    return publicIdSlug(listing.id || listing.mlsId || 'unknown');
  }

  const parts: string[] = [];

  if (streetNumber) parts.push(streetNumber);
  // StreetDirPrefix (E, W, N, S) is a separate RESO field; include it
  // explicitly so "333 E 46th St" doesn't lose the direction in the slug.
  if (streetDirPrefix) parts.push(streetDirPrefix);
  if (streetName) parts.push(streetName);
  if (unitNumber) {
    // Collapse spaces/hyphens in unit numbers (e.g., "8 H" → "8h", "17-C" → "17c")
    // so the slug token stays as a single part after slugify splits on hyphens.
    const normalizedUnit = unitNumber.replace(/[\s-]+/g, '');
    parts.push(`apt-${normalizedUnit}`);
  }
  if (city) parts.push(city);
  if (stateOrProvince) parts.push(stateOrProvince);
  if (postalCode) parts.push(postalCode);

  const addressSlug = slugify(parts.join(' '));

  // Append `-{slugified-id}` when an id is available. The slugified id is
  // lowercased and stripped of any non-alphanumerics, so `RLS20061539`
  // becomes `rls20061539`. `extractListingIdFromSlug` recognizes this
  // pattern (`/-rls\d+$/i`) to round-trip the listing_id.
  const idSuffix = listing.id ? `-${slugify(listing.id)}` : '';

  // Ensure slug is non-empty after sanitization. For CRM exclusives, never
  // fall back to the generic `listing-XXX` slug — log a warning instead.
  if (addressSlug) return `${addressSlug}${idSuffix}`;
  if (isCrmExclusive) {
    // eslint-disable-next-line no-console
    console.warn(`[listing-slug] CRM exclusive ${idStr} produced empty address slug after sanitization — falling back to MLS-ID slug (BAD for SEO)`);
  }
  return publicIdSlug(listing.id || listing.mlsId || 'unknown');
}

/**
 * Extract the listing_id from an address-based slug that was generated
 * with the Option D suffix. Returns null if the slug is the legacy
 * address-only format (no `-rlsXXX` suffix) so callers can fall back to
 * `parseAddressSlug` + address-component lookup.
 *
 * Recognized id patterns (case-insensitive on the slug, returned upper-
 * cased to match Prisma's stored listing_id verbatim — the original
 * hyphen, if any, is preserved):
 *   - `-rls{digits}`       e.g. `-rls20061539`   → `RLS20061539`
 *   - `-rbny{digits}`      e.g. `-rbny12345678`  → `RBNY12345678`
 *   - `-rls-{digits}`      e.g. `-rls-20061539`  → `RLS-20061539`
 *   - `-rbny-{digits}`     e.g. `-rbny-12345678` → `RBNY-12345678`
 *
 * The hyphenated forms exist because `slugify()` collapses any
 * non-alphanumeric character (including the original hyphen in a
 * legacy listing_id like `RBNY-12345678`) into a `-` separator. After
 * slugification:
 *   slugify('RBNY-12345678') → 'rbny-12345678'
 *   slugify('RLS20061539')   → 'rls20061539'
 * Without supporting BOTH forms in the extractor regex, the detail
 * route's Strategy 1b would miss legacy hyphenated listing_ids and
 * fall through to the address-only lookup — which on a co-listed
 * physical address could return the wrong specific listing.
 *
 * The function does NOT match the MLS-ID fallback slug `listing-rlsXXX`
 * (that is handled by `extractMlsIdFromSlug` instead — keep the two code
 * paths separate to avoid silent cross-format leakage).
 */
export function extractListingIdFromSlug(slug: string): string | null {
  // MLS-ID fallback slug handled by a different helper.
  if (isMlsIdSlug(slug)) return null;

  const match = slug.match(/-(rls-?\d+|rbny-?\d+|sl-?\d+|rl-?\d+)$/i);
  if (!match) return null;
  return match[1].toUpperCase();
}

/**
 * Strip the Option D listing_id suffix off an address-based slug.
 * Returns the slug unchanged when no suffix is present.
 *
 * Matches the same set of patterns as `extractListingIdFromSlug` —
 * both the digits-immediately-after-prefix form (`-rls20061539`) and
 * the hyphenated form (`-rbny-12345678`) produced when `slugify()`
 * splits a hyphenated listing_id.
 *
 * Used by the search-result post-processor to compute co-listed counts:
 * we group listings by the address-portion of the slug so distinct
 * listing_ids at the same address surface as siblings.
 */
export function stripListingIdSuffix(slug: string): string {
  if (isMlsIdSlug(slug)) return slug;
  return slug.replace(/-(?:rls-?\d+|rbny-?\d+|sl-?\d+|rl-?\d+)$/i, '');
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

/**
 * The address-suppressed PUBLIC fallback slug.
 *
 * OWNERSHIP RULE: the suffix is the CANONICAL PUBLIC ROUTE KEY (`listing.id` /
 * `listing_id`, e.g. `RLS20105333`) — never the provider key.
 *
 * This was `mlsId || id`. But `mlsId` legitimately carries the NUMERIC PROVIDER
 * ListingKey (`mapTrestleToPrisma` sets `mls_id = ListingKey`; on RLS20105333
 * that is `1178013994`). The old order therefore emitted `listing-1178013994`,
 * while the detail page resolves a `listing-*` suffix as a DB `listing_id` —
 * so the canonical URL could never resolve its own row, and the compliance
 * fallback silently became a dead link.
 *
 * Provider ListingKey is media-lookup identity and display metadata. It is NOT
 * a route key. The parameter is named for what it must be.
 */
function publicIdSlug(publicId: string): string {
  return `listing-${slugify(publicId)}`;
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
  streetDirPrefix?: string;
  streetName: string;
  city: string;
  postalCode: string;
  unitNumber?: string;
} | null {
  if (isMlsIdSlug(slug)) return null;

  // Strip any Option D `-rlsXXX` listing-id suffix before parsing so
  // address components remain recoverable from the slug's leading parts.
  // Without this, the trailing `rls20061539` token leaks into the city /
  // street parse loop and produces wrong addresses on new-style slugs.
  const addressOnly = stripListingIdSuffix(slug);
  const parts = addressOnly.split('-');
  if (parts.length < 4) return null;

  // Extract postal code (last part, 5 digits)
  let postalCode = '';
  if (/^\d{5}$/.test(parts[parts.length - 1])) {
    postalCode = parts.pop()!;
  }

  // Extract state (last remaining part, typically 2 chars) — consumed but not used in lookup
  if (parts.length > 0 && /^[a-z]{2}$/.test(parts[parts.length - 1])) {
    parts.pop();
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
    const afterApt = parts.splice(aptIndex);
    afterApt.shift(); // remove "apt"
    if (afterApt.length > 0) {
      // Collect all unit-number tokens: short alphanumeric parts that aren't city words.
      // Handles multi-token units like "8-h" (from "8 H") or "17-c" (from "17-C").
      const unitParts: string[] = [];
      while (
        afterApt.length > 0 &&
        afterApt[0].length <= 4 &&
        /^[a-z0-9]+$/.test(afterApt[0]) &&
        !['new', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten', 'long'].includes(afterApt[0])
      ) {
        unitParts.push(afterApt.shift()!);
      }
      if (unitParts.length > 0) {
        unitNumber = unitParts.join('');
      }
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

  // Extract direction prefix from composite street name.
  // Slug "333-e-46th-st-..." parses streetName as "e 46th st". The DB may
  // store StreetDirPrefix=E separately from StreetName=46th, so we split
  // them here for accurate lookup.
  let streetDirPrefix: string | undefined;
  const trimmedStreet = streetName.trim();
  const dirMatch = trimmedStreet.match(/^(e|w|n|s)\b\s*/i);
  if (dirMatch) {
    streetDirPrefix = dirMatch[1].toUpperCase();
    streetName = trimmedStreet.slice(dirMatch[0].length).trim();
  }

  return {
    streetNumber,
    streetDirPrefix,
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

/**
 * THE canonical slug for a raw Prisma `Listing` row.
 *
 * Extracted 2026-08-09 from `dbListingToPublicDTO`, which was the only place
 * that knew how to turn a DB row into the public slug. The RLS return-copy
 * canonicalization needs the SAME slug for a local twin, and re-deriving it
 * would have created a second URL formula — the exact divergence the
 * `composeSlugStreetName` extraction (SEO-001) existed to prevent.
 *
 * Compliance is preserved verbatim: the address may appear in the URL only when
 * the row is outside RLS (`rls_eligible === false`) or passes
 * `isAddressDisplayable`. An RLS-backed opt-out row still gets the
 * `listing-XXX` fallback.
 */
export function buildListingSlugFromDbRow(row: {
  listing_id: string;
  rls_eligible?: boolean | null;
  address?: unknown;
  borough?: string | null;
  [key: string]: unknown;
}): string {
  // Imported lazily-by-reference at module scope would create a cycle
  // (gates -> ... -> slug), so the gate is required here where it is used.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isAddressDisplayable } = require('@/lib/compliance/gates') as {
    isAddressDisplayable: (input: unknown) => boolean;
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { normalizeStreetCase } = require('@/lib/idx/normalize-street-case') as {
    normalizeStreetCase: (s: string) => string;
  };

  const addr = (row.address || {}) as Record<string, unknown>;
  const str = (key: string): string =>
    typeof addr[key] === 'string' ? (addr[key] as string).trim() : '';

  const isRlsBacked = row.rls_eligible !== false;
  const suppressAddress = isRlsBacked && !isAddressDisplayable(row);

  return generateListingSlug({
    address: {
      streetNumber: str('StreetNumber') || str('streetNumber'),
      streetName: normalizeStreetCase(composeSlugStreetName(addr)),
      unitNumber: str('UnitNumber') || str('unitNumber') || null,
      city: str('City') || str('city') || row.borough || 'New York',
      stateOrProvince: 'NY',
      postalCode: str('PostalCode') || str('postalCode'),
    },
    id: row.listing_id,
    mlsId: row.listing_id,
    internetAddressDisplayYN: !suppressAddress,
  });
}
