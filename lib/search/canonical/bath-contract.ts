/**
 * THE CANONICAL TOTAL-BATH CONTRACT — one definition, two renderers.
 *
 * Search must mean the same thing whether it executes against Mallan storage or
 * an authorized Cotality fallback. The rule below is defined ONCE and rendered
 * to Prisma and to OData, so the two paths cannot drift into different answers
 * for the same user question — which is exactly what they did before.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LIVE FEED ACTUALLY CONTAINS (exhaustive, 2026-08-19)
 *
 * Every `StandardStatus eq 'Active'` row was read by following `@odata.nextLink`
 * to the end — 8,103 rows against a provider-declared count of 8,103, coverage
 * complete. Not a sample.
 *
 *   field                    non-null   non-zero
 *   BathroomsFull                8,103      8,059
 *   BathroomsHalf                8,103      2,023   <- REAL, must be counted
 *   BathroomsOneQuarter             36          0
 *   BathroomsThreeQuarter           31          0
 *   BathroomsPartial                 0          0   <- never delivered
 *   BathroomsTotalInteger        8,087      8,059
 *
 * `BathroomsOneQuarter` and `BathroomsThreeQuarter` appear on a handful of rows
 * but are ZERO on every one of them, and `BathroomsPartial` is never delivered.
 * So `full + half/2` discards NOTHING in the current feed. That check had to
 * come first: a quarter-bath component that was populated would make this
 * formula silently lossy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `BathroomsTotalInteger` IS NOT USED
 *
 * It is an Int32, so it cannot represent 1.5 at all. It is also NOT a derivable
 * function of the components — four hypotheses were tested against all 8,087
 * comparable rows and none matched exhaustively:
 *
 *   Full + Half              7,796 / 8,087   (96.4%)
 *   Full + ceil(Half/2)      7,993 / 8,087   (98.8%)
 *   round(Full + Half/2)     7,993 / 8,087   (98.8%)
 *   Full + floor(Half/2)     6,310 / 8,087   (78.0%)
 *
 * The residue is provider data error, not a different rule — e.g. RLS20105072
 * reports full=2, half=1, TotalInteger=0, and RLS20105359 reports full=4,
 * half=1, TotalInteger=1. An independently-entered field that disagrees with its
 * own components on ~1% of rows cannot define a filter.
 *
 * There is NO `BathroomsTotalDecimal` field on the live Property resource.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A DISJUNCTION RATHER THAN ARITHMETIC
 *
 * Probed live: `BathroomsFull add BathroomsHalf ge 3` is SUPPORTED, but
 * `div` and `mul` are both PROVIDER_REJECTED_500 — so the 0.5 weighting cannot
 * be expressed arithmetically on the provider, and Prisma cannot express
 * arithmetic in a `where` at all. The inequality is therefore expanded into an
 * exact disjunction over the small integer range `BathroomsFull` occupies.
 * This is exact, not an approximation.
 */

/** Live-verified: these are the only bath components carrying data. */
export const BATH_COMPONENTS_LIVE = {
  used: ['BathroomsFull', 'BathroomsHalf'] as const,
  presentButAlwaysZero: ['BathroomsOneQuarter', 'BathroomsThreeQuarter'] as const,
  neverDelivered: ['BathroomsPartial'] as const,
  rejected: ['BathroomsTotalInteger'] as const,
  verifiedAt: '2026-08-19',
  coverage: { rowsRead: 8103, providerDeclared: 8103, complete: true },
} as const;

/** `BathroomsFull` never exceeds this in the live feed; bounds the expansion. */
const MAX_FULL_ENUMERATED = 12;

/** The canonical total. NULL half-baths read as zero, never as unknown. */
export function bathTotal(full: number | null | undefined, half: number | null | undefined): number {
  return (full ?? 0) + (half ?? 0) * 0.5;
}

/**
 * ONE definition of "total >= min", as (full, minHalf) alternatives.
 *
 * `full: {atLeast}` means enough full baths alone satisfy it — the arm the old
 * rule omitted, which is why `minBaths=1.5` rejected a 2-full/0-half apartment.
 */
export function minBathsAlternatives(minBaths: number): Array<{ fullAtLeast?: number; fullExactly?: number; halfAtLeast?: number }> {
  const ceiling = Math.min(Math.ceil(minBaths), MAX_FULL_ENUMERATED);
  const alts: Array<{ fullAtLeast?: number; fullExactly?: number; halfAtLeast?: number }> = [
    { fullAtLeast: ceiling },
  ];
  for (let full = 0; full < ceiling; full++) {
    alts.push({ fullExactly: full, halfAtLeast: Math.ceil((minBaths - full) * 2) });
  }
  return alts;
}

/** ONE definition of "total <= max", as (full, maxHalf) alternatives. */
export function maxBathsAlternatives(maxBaths: number): Array<{ fullExactly: number; halfAtMost: number }> {
  const cap = Math.min(Math.floor(maxBaths), MAX_FULL_ENUMERATED);
  const alts: Array<{ fullExactly: number; halfAtMost: number }> = [];
  for (let full = 0; full <= cap; full++) {
    alts.push({ fullExactly: full, halfAtMost: Math.floor((maxBaths - full) * 2) });
  }
  return alts;
}

/** OData rendering — uses only eq/ge/le/or, all live-verified as permitted. */
export function minBathsOData(minBaths: number): string {
  const parts = minBathsAlternatives(minBaths).map((a) =>
    a.fullAtLeast !== undefined
      ? `BathroomsFull ge ${a.fullAtLeast}`
      : `(BathroomsFull eq ${a.fullExactly} and BathroomsHalf ge ${a.halfAtLeast})`,
  );
  return `(${parts.join(' or ')})`;
}

export function maxBathsOData(maxBaths: number): string {
  const alts = maxBathsAlternatives(maxBaths);
  if (alts.length === 0) return '(BathroomsFull lt 0)'; // matches nothing
  const parts = alts.map(
    (a) => `(BathroomsFull eq ${a.fullExactly} and BathroomsHalf le ${a.halfAtMost})`,
  );
  return `(${parts.join(' or ')})`;
}
