/**
 * Canonical building-address → Trestle OData filter.
 *
 * Single source of truth for matching a building's unit records in the live
 * REBNY IDX Plus (Cotality/Trestle) Property resource. Both the public building
 * profile (`/api/buildings`) and the listing-detail building-units panel
 * (`/api/listings/building`) MUST use this so they resolve the same buildings.
 *
 * COTALITY FACTS this encodes (verified against the live feed, 2026-07-08):
 *  - Trestle stores `StreetName` in UPPERCASE, and OData `contains()` is
 *    CASE-SENSITIVE. Matching a raw mixed-case name (e.g. `contains(StreetName,
 *    'Park')`) returns ZERO rows. We must uppercase.
 *  - Trestle decomposes the direction into `StreetDirPrefix`, so we strip a
 *    LEADING direction from the core (and expose it for an optional
 *    `StreetDirPrefix eq` clause) to avoid "W" vs "West" mismatches.
 *  - Stripping a leading direction + trailing suffix can EMPTY the core
 *    (e.g. "West Street" → strip "West" → " Street" → strip "Street" → ""),
 *    and `contains(StreetName, '')` matches EVERYTHING. We guard against that
 *    by falling back to the full uppercased street name.
 */
import { sanitizeOData } from '@/lib/sanitize';

const DIR_PREFIXES = /^(N|S|E|W|North|South|East|West)\b\s*/i;
const SUFFIXES =
  /\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Pl|Place|Ct|Court|Ln|Lane|Way|Terrace|Ter|Sq|Square)\.?$/i;

export interface BuildingAddressParts {
  /** Sanitized street number, e.g. "432". */
  streetNumber: string;
  /** UPPERCASE core street name for `contains(StreetName, …)` — never empty. */
  coreStreetNameUpper: string;
  /** Single-letter direction for an optional `StreetDirPrefix eq` clause, or null. */
  dirPrefix: 'N' | 'S' | 'E' | 'W' | null;
  /** Sanitized 5-digit postal code, or "" when absent. */
  postalCode: string;
}

/**
 * Parse a building street address into Trestle-matchable, UPPERCASE parts.
 * Pure + deterministic; safe to unit-test.
 */
export function parseBuildingAddress(
  streetNumber: string,
  streetName: string,
  postalCode?: string,
): BuildingAddressParts {
  const cleanNumber = sanitizeOData(streetNumber);
  const cleanPostal = postalCode ? sanitizeOData(postalCode) : '';

  const fullUpper = sanitizeOData(streetName).toUpperCase().trim();

  const dirMatch = fullUpper.match(DIR_PREFIXES);
  const dirLetter = dirMatch ? (dirMatch[1].toUpperCase().charAt(0) as 'N' | 'S' | 'E' | 'W') : null;

  let core = fullUpper;
  if (dirMatch) core = core.replace(DIR_PREFIXES, '');
  core = core.replace(SUFFIXES, '').trim();

  // Guard: never match on an empty core (contains('') matches every listing) OR
  // on a bare generic token — a lone direction ("WEST") or a lone suffix word
  // ("STREET"/"AVENUE"). Both happen when the WHOLE name is direction+suffix
  // (e.g. "West Street" strips to "STREET"). Fall back to the full uppercased
  // name so the distinctive street ("WEST STREET") is what we match on.
  const BARE_GENERIC =
    /^(N|S|E|W|NORTH|SOUTH|EAST|WEST|ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE|PL|PLACE|CT|COURT|LN|LANE|WAY|TERRACE|TER|SQ|SQUARE)$/;
  if (core.length === 0 || BARE_GENERIC.test(core)) core = fullUpper;

  return {
    streetNumber: cleanNumber,
    coreStreetNameUpper: core,
    dirPrefix: dirLetter,
    postalCode: cleanPostal,
  };
}

/**
 * Build the OData `$filter` address fragment for a building's unit records.
 * @param opts.includeDirPrefix add `StreetDirPrefix eq '<D>'` when a direction
 *   was detected (more precise, but Trestle sometimes leaves it null — callers
 *   that need resilient matching should omit it and rely on number+core+zip).
 */
export function buildBuildingAddressFilter(
  parts: BuildingAddressParts,
  opts?: { includeDirPrefix?: boolean },
): string {
  const dir =
    opts?.includeDirPrefix && parts.dirPrefix ? ` and StreetDirPrefix eq '${parts.dirPrefix}'` : '';
  const zip = parts.postalCode ? ` and PostalCode eq '${parts.postalCode}'` : '';
  return `StreetNumber eq '${parts.streetNumber}' and contains(StreetName,'${parts.coreStreetNameUpper}')${dir}${zip}`;
}
