/**
 * Generate default comp criteria from a listing's specs.
 * Agent can override any of these from the CRM.
 *
 * Owner ruling (Maya, 2026-09-08): the criteria vocabulary is the live Cotality StandardStatus TOKEN set —
 * Active / ActiveUnderContract / Pending / Closed / Expired — never a display name ("Under Contract") and
 * never broker language ("Sold", "Rented", "In Contract"), which is a per-transaction LABEL applied at
 * render time (lib/comps/status-criteria.ts). The defaults are transaction-agnostic because every token here
 * is a member of BOTH transactions' canonical sets.
 */

import type { CompCriteria, CompRange } from "./types";

interface ListingSpecs {
  beds: number | null;
  baths: number | null;
  sqft: number | null;       // living_area
  list_price: number;
  neighborhood: string | null;
  building_name: string | null;
}

/** A dimension the subject does not carry is disabled with null bounds; a real 0 is a real bound. */
function band(value: number | null, spread: number): { min: number | null; max: number | null; enabled: boolean } {
  if (value == null) return { min: null, max: null, enabled: false };
  return { min: Math.max(0, value - spread), max: value + spread, enabled: true };
}

export function buildDefaultCriteria(specs: ListingSpecs): CompCriteria {
  // `?? 0` here was the origin of the studio defect: it made "not recorded" indistinguishable from
  // "studio" before the criteria were ever stored, so the fabrication outlived the request.
  const bBeds = band(specs.beds, 0);
  const bBaths = band(specs.baths, 0);
  const aBeds = band(specs.beds, 1);
  const aBaths = band(specs.baths, 1);
  const hasSqft = specs.sqft != null && specs.sqft > 0;
  const sqft = specs.sqft ?? 0;
  const price = specs.list_price;

  return {
    building: {
      beds_min: bBeds.min,
      beds_max: bBeds.max,
      beds_enabled: bBeds.enabled,
      baths_min: bBaths.min,
      baths_max: bBaths.max,
      baths_enabled: bBaths.enabled,
      sqft_min: hasSqft ? Math.round(sqft * 0.85) : null,
      sqft_max: hasSqft ? Math.round(sqft * 1.15) : null,
      sqft_enabled: hasSqft,
      statuses: ["Active", "ActiveUnderContract", "Pending", "Closed"],
      months_back: 12,
    },
    area: {
      beds_min: aBeds.min,
      beds_max: aBeds.max,
      beds_enabled: aBeds.enabled,
      baths_min: aBaths.min,
      baths_max: aBaths.max,
      baths_enabled: aBaths.enabled,
      sqft_min: hasSqft ? Math.round(sqft * 0.80) : null,
      sqft_max: hasSqft ? Math.round(sqft * 1.20) : null,
      sqft_enabled: hasSqft,
      price_min: Math.round(price * 0.75),
      price_max: Math.round(price * 1.25),
      statuses: ["Active", "ActiveUnderContract", "Pending", "Closed", "Expired"],
      neighborhoods: specs.neighborhood ? [specs.neighborhood] : [],
      months_back: 12,
    },
  };
}

/**
 * Resolve criteria stored BEFORE the enabled flags existed.
 *
 * A missing flag must NOT be read as `true`. Rows written by the old code hold a fabricated 0/0 whenever
 * the subject's dimension was unknown, so trusting them would preserve the exact defect this replaces —
 * the bug would survive inside its own stored output. The current canonical subject value decides instead:
 *
 *   no flag + subject null     -> disabled  (the stored 0/0 was manufactured; drop the clause)
 *   no flag + subject numeric  -> enabled   (the stored range describes a real dimension)
 *   explicit flag              -> honoured exactly as written
 *
 * Nothing is written back. comp_criteria is JSON and this resolves on read, so no migration or backfill.
 */
export function resolveLegacyDimensions(
  criteria: CompCriteria,
  subject: { beds: number | null; baths: number | null },
): CompCriteria {
  const fix = <R extends CompRange>(range: R, spreadForNull: number): R => {
    const out = { ...range } as R;
    for (const dim of ["beds", "baths"] as const) {
      const flag = `${dim}_enabled` as const;
      if (typeof (range as unknown as Record<string, unknown>)[flag] === "boolean") continue;
      const known = subject[dim] != null;
      (out as unknown as Record<string, unknown>)[flag] = known;
      if (!known) {
        (out as unknown as Record<string, unknown>)[`${dim}_min`] = null;
        (out as unknown as Record<string, unknown>)[`${dim}_max`] = null;
      }
      void spreadForNull;
    }
    return out;
  };
  return { building: fix(criteria.building, 0), area: fix(criteria.area, 1) };
}

/**
 * An enabled dimension must carry usable bounds. Refuse rather than substitute one — substituting is how
 * the 0/0 studio filter was born. A bound of 0 is valid and must not be mistaken for a missing bound,
 * which is why this tests `== null` and never truthiness.
 */
export function validateDimensionBounds(criteria: CompCriteria): CompCriteria {
  for (const [scope, range] of [["building", criteria.building], ["area", criteria.area]] as const) {
    for (const dim of ["beds", "baths"] as const) {
      const r = range as unknown as Record<string, unknown>;
      if (r[`${dim}_enabled`] !== true) continue;
      const min = r[`${dim}_min`] as number | null;
      const max = r[`${dim}_max`] as number | null;
      if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) {
        throw new Error(`${scope}.${dim} is enabled but has no usable range (min=${String(min)}, max=${String(max)})`);
      }
      if (max < min) {
        throw new Error(`${scope}.${dim} range is inverted (min=${min}, max=${max})`);
      }
    }
  }
  return criteria;
}
