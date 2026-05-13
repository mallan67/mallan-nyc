/**
 * Shared bathroom display formatter.
 *
 * `bathrooms_half` in our DB stores the COUNT of half-baths (1 half-bath =
 * 0.5 of a full bath), not a decimal fraction. The total is therefore
 * `full + (half × 0.5)`, formatted with a single decimal place only when
 * the result lands on a half-step.
 *
 * The bug this fixes (live in production until the patch lands):
 * six different components — `SearchListingCard.tsx` (3 cards),
 * `FeaturedListings.tsx`, `ListingSidePanel.tsx`, `app/listing/[id]/page.tsx`
 * — each reimplemented inline:
 *
 *     `${full}${half > 0 ? `.${half}` : ''} Bath`
 *
 * which for `full=2, half=1` produces the literal string "2.1 Bath" (two
 * full plus a decimal digit '1'). The correct display is "2.5 Bath".
 *
 * Other examples the inline pattern got wrong:
 *   (2, 2) → "2.2" (literal)  →  should be "3"   (2.0 + 1.0 = 3.0)
 *   (2, 3) → "2.3"            →  should be "3.5" (2.0 + 1.5)
 *   (1, 4) → "1.4"            →  should be "3"   (1.0 + 2.0)
 *
 * Every consumer should call this helper rather than reimplementing the
 * arithmetic. See `tests/runtime/format-bathrooms.test.ts` for the
 * canonical behaviour pinned by 16+ cases.
 */
export function formatBathrooms(
  full: number | null | undefined,
  half: number | null | undefined,
): string {
  // Coerce defensively: null/undefined/NaN/Infinity/negatives collapse to 0.
  // The DB columns are nullable (bathrooms_full Int? / bathrooms_half Int?)
  // and a few legacy CRM rows have stored strings; numeric coercion handles
  // both shapes consistently.
  const safeFull = Number.isFinite(full as number) && (full as number) > 0
    ? (full as number)
    : 0;
  const safeHalf = Number.isFinite(half as number) && (half as number) > 0
    ? (half as number)
    : 0;

  const total = safeFull + safeHalf * 0.5;
  if (total === 0) return '0';

  // Half-step totals (n.5) keep one decimal; whole totals render without
  // the trailing ".0". `Number.isInteger(total)` is the cleanest gate.
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}
