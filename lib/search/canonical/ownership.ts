/**
 * ownership.ts — canonical CommonInterest → ownership class (PURE).
 *
 * Live-verified members (live-truth.ts / data/cotality-enums.live.json): Condominium,
 * StockCooperative (co-op), Condop, RentalBuilding, None. There is NO `Cooperative` member —
 * the repo's literal is invalid (400 on filter). Co-op MUST be classified as `StockCooperative`.
 * This is the co-op/condo separation axis the comps engine currently lacks.
 */

import { COMMON_INTEREST_MEMBERS } from './live-truth';

export type OwnershipClass = 'condo' | 'coop' | 'condop' | 'rental_building' | 'none' | 'other' | 'unknown';

const CLASSIFY: Readonly<Record<string, OwnershipClass>> = Object.freeze({
  Condominium: 'condo',
  StockCooperative: 'coop', // live co-op value — NOT 'Cooperative'
  Condop: 'condop',
  RentalBuilding: 'rental_building',
  None: 'none',
});

/**
 * Valid live CommonInterest members that aren't an NYC segmentation class. They classify as 'other'
 * (recognized, never dropped to 'unknown'), so a valid ownership value is never silently excluded.
 */
const OTHER_MEMBERS: ReadonlySet<string> = new Set(
  COMMON_INTEREST_MEMBERS.filter((m) => !(m in CLASSIFY)),
);

/** Classify a record's CommonInterest. Valid non-segmentation members → 'other'; unrecognized → 'unknown'. */
export function ownershipClass(commonInterest: unknown): OwnershipClass {
  if (typeof commonInterest !== 'string') return 'unknown';
  const v = commonInterest.trim();
  return CLASSIFY[v] ?? (OTHER_MEMBERS.has(v) ? 'other' : 'unknown');
}

/** Exact live CommonInterest value(s) to filter for an ownership class. */
export function commonInterestFor(cls: OwnershipClass): readonly string[] {
  switch (cls) {
    case 'condo': return ['Condominium'];
    case 'coop': return ['StockCooperative'];
    case 'condop': return ['Condop'];
    case 'rental_building': return ['RentalBuilding'];
    case 'none': return ['None'];
    default: return [];
  }
}

/** Map the UI ownership label ('Condo'|'Co-op'|'Condop', lib/search/types.ts) → ownership class. */
export function ownershipClassFromUiLabel(label: unknown): OwnershipClass {
  if (typeof label !== 'string') return 'unknown';
  switch (label.trim().toLowerCase()) {
    case 'condo': return 'condo';
    case 'co-op': case 'coop': return 'coop';
    case 'condop': return 'condop';
    default: return 'unknown';
  }
}
