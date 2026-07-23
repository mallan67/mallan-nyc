/**
 * CANONICAL public ownership classification (Maya directive 2026-07-23).
 *
 * BUILDING OWNERSHIP determines the ownership label.
 * TRANSACTION TYPE determines For Sale versus For Rent.
 * Transaction type NEVER overrides ownership:
 *   rental in a condominium  → For Rent · Condo
 *   rental in a cooperative  → For Rent · Co-op
 *   rental in a condop       → For Rent · Condop
 *   rental in a rental bldg  → For Rent · Rental Building
 *   sale in a condominium    → For Sale · Condo
 *   sale in a cooperative    → For Sale · Co-op
 *   sale in a condop         → For Sale · Condop
 *
 * ONE classifier, ONE DTO field pair (`ownershipLabel`, `transactionLabel`);
 * React components render the fields — they never re-derive ownership.
 * `propertySubType` stays a SEPARATE concept (Apartment / Loft / Townhouse …)
 * and is never replaced by the ownership label.
 *
 * This module is the canonical home; PR #556's building-page classifier has
 * identical semantics and should import from here once both are merged
 * (one-line follow-up, noted in both PRs).
 */

export type OwnershipLabel =
  | 'Condo'
  | 'Co-op'
  | 'Condop'
  | 'Rental Building'
  | 'Townhouse'
  | 'House'
  | 'Multi-Family'
  | 'Mixed-Use'
  | null;

export type TransactionLabel = 'For Sale' | 'For Rent';

/**
 * Ownership from explicit ownership signals only. Priority: unit
 * CommonInterest → building CommonInterest → unit OwnershipType → building
 * OwnershipType. Tolerant of spacing/case variants ("Stock Cooperative").
 */
export function classifyOwnershipSignals(signals: {
  commonInterest?: string | null;
  buildingCommonInterest?: string | null;
  ownershipType?: string | null;
  buildingOwnershipType?: string | null;
}): 'Condo' | 'Co-op' | 'Condop' | 'Rental Building' | null {
  const chain = [
    signals.commonInterest,
    signals.buildingCommonInterest,
    signals.ownershipType,
    signals.buildingOwnershipType,
  ];
  for (const v of chain) {
    const s = String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (!s) continue;
    if (s.includes('condop')) return 'Condop';
    if (s.includes('condominium') || s === 'condo') return 'Condo';
    if (s.includes('cooperative') || s === 'coop') return 'Co-op';
    if (s.includes('rental') || s.includes('apartmentbuilding')) return 'Rental Building';
  }
  return null;
}

/**
 * Full ownership label for a public listing DTO.
 *
 * 1. Explicit ownership signals (classifier above) — always win.
 * 2. Structural forms from the sub-type when no shared-ownership signal
 *    exists (Townhouse / House / Multi-Family — a townhouse listing is
 *    correctly labeled Townhouse, not forced into the 4 ownership forms).
 * 3. A LEASE with no signal at all is, by definition, in a building with no
 *    individually owned units → 'Rental Building' (NEVER 'Apartment' merely
 *    because PropertyType is Residential Lease).
 * 4. A signal-less sale with an unrecognized sub-type → null (surfaces
 *    simply omit the label rather than guessing).
 */
export function deriveOwnershipLabel(input: {
  commonInterest?: string | null;
  buildingCommonInterest?: string | null;
  ownershipType?: string | null;
  buildingOwnershipType?: string | null;
  propertySubType?: string | null;
  listingType?: string | null; // 'sale' | 'rent'
}): OwnershipLabel {
  const own = classifyOwnershipSignals(input);
  if (own) return own;

  // Live feed sub-types are space-less PascalCase (SingleFamilyResidence,
  // MultiFamily, MixedUse — 2026-07-23 production inventory), so separators
  // are stripped before matching.
  const sub = String(input.propertySubType ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (sub.includes('townhouse')) return 'Townhouse';
  if (sub.includes('singlefamily') || sub === 'house') return 'House';
  if (sub.includes('multifamily') || sub.startsWith('multi')) return 'Multi-Family';
  if (sub.includes('mixeduse')) return 'Mixed-Use';
  if (sub.includes('condop')) return 'Condop';
  if (sub.includes('condo')) return 'Condo';
  if (sub.includes('coop') || sub.includes('stockcooperative')) return 'Co-op';

  if ((input.listingType ?? '') === 'rent') return 'Rental Building';
  return null;
}

/** For Sale / For Rent — from the transaction type alone. */
export function deriveTransactionLabel(listingType?: string | null): TransactionLabel {
  return listingType === 'rent' ? 'For Rent' : 'For Sale';
}

/**
 * Ownership-filter matcher for public list endpoints (fixes the neighborhood
 * tab defect: the `propertyType` query param — Condo / Co-op / Condop /
 * Rental Building / Townhouse … — is matched against the SAME canonical
 * label the cards display, so what a tab shows is exactly what its filter
 * selects).
 */
export function matchesOwnershipFilter(
  requested: string | null | undefined,
  label: OwnershipLabel,
): boolean {
  const want = String(requested ?? '').trim().toLowerCase();
  if (!want) return true;
  return (label ?? '').toLowerCase() === want;
}
