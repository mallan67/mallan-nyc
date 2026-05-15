/**
 * PR-S.1 — Suggest API query classifier + address-display gate.
 *
 * Pure functions extracted from `app/api/listings/suggest/route.ts` so the
 * three correctness fixes below can be unit-tested without the live Trestle
 * fetcher or Next runtime.
 *
 * THE THREE FIXES THIS MODULE LOCKS IN
 *
 * 1. Listing-ID regex tightened — require either the explicit `RLS` prefix
 *    OR an alphanumeric form (≥2 letters + ≥3 digits). 3-digit pure numerics
 *    like "425" are NO LONGER treated as listing IDs.
 *
 * 2. ZIP regex restricted to exactly 5 digits. NYC ZIPs are 10001–11697 (all
 *    5 digits). 3–4 digit numerics fall through to street-number matching;
 *    6+ digit numerics fall through to text-only matching.
 *
 * 3. Address-display gate replaces the previous fail-closed
 *    `affirmPermission(InternetAddressDisplayYN)` with `!== false`. This
 *    matches the 2026-04-30 IDX-Plus pre-filter learning that's now policy
 *    in `lib/idx/trestle-mapper.ts:834` and documented in
 *    `.claude/skills/rebny-compliance/SKILL.md` §2.1.1:
 *
 *      - REBNY's policy layer pre-filters non-displayable rows BEFORE they
 *        reach the API. The field is null for the vast majority of records.
 *      - `affirmPermission(null) === false` → every suggestion was stripped.
 *      - `!== false` is the correct read for this provider-gated field.
 *
 * WHAT THIS MODULE DOES NOT CHANGE
 *
 * - `checkDistributionGates(raw).displayable` still runs in the route BEFORE
 *   any suggestion is surfaced. This module is only the second-layer filter
 *   for the address-suppression flag specifically.
 * - Listing DTO, attribution, disclaimer, agent PII masking, Fair Housing
 *   scanner — none touched.
 */

export interface SuggestQueryClassification {
  /** True when query matches a real listing-ID shape (RLS-prefixed or alphanumeric). */
  isListingId: boolean;
  /** True ONLY for exactly 5-digit numeric queries (real ZIP shape). */
  isZip: boolean;
  /** True for any pure-numeric query that did not match isListingId / isZip. */
  isPureNumeric: boolean;
}

/**
 * Classify a search query for the suggest endpoint.
 *
 * Examples:
 *   "RLS20059088"  → { isListingId: true,  isZip: false, isPureNumeric: false }
 *   "WEB12345"     → { isListingId: true,  isZip: false, isPureNumeric: false }
 *   "425"          → { isListingId: false, isZip: false, isPureNumeric: true  }
 *   "4259"         → { isListingId: false, isZip: false, isPureNumeric: true  }
 *   "10001"        → { isListingId: false, isZip: true,  isPureNumeric: false }
 *   "12345678"     → { isListingId: false, isZip: false, isPureNumeric: true  }
 *   "425 park"     → { isListingId: false, isZip: false, isPureNumeric: false }
 *   "Carnegie"     → { isListingId: false, isZip: false, isPureNumeric: false }
 */
export function classifySuggestQuery(query: string): SuggestQueryClassification {
  const trimmed = (query ?? '').trim();

  // Listing-ID detection — require explicit RLS prefix OR alphanumeric shape.
  // OLD bug: /^(RLS|rls)?\d{3,}$/ — the `?` made the prefix optional, so any
  // 3+ digit numeric matched and the address branch was wrongly skipped.
  const isListingId =
    /^(RLS|rls)\d{4,}$/i.test(trimmed) ||
    /^[A-Z]{2,}\d{3,}$/i.test(trimmed);

  // ZIP — must be exactly 5 digits.
  // OLD bug: /^\d{3,5}$/ caught "425" → routed to ZIP-prefix search →
  // no NYC ZIP starts with "425" → 0 suggestions.
  const isZip = /^\d{5}$/.test(trimmed);

  // Pure-numeric — for the new dedicated street-number branch added in the
  // route. Excludes isZip + isListingId paths (only fires when those are false).
  const isPureNumeric = !isListingId && !isZip && /^\d+$/.test(trimmed);

  return { isListingId, isZip, isPureNumeric };
}

/**
 * Address-display gate for individual Trestle records surfaced as suggestions.
 *
 * Returns `true` when the record's address may be shown (suggestion can be
 * surfaced); `false` otherwise.
 *
 * The 2026-04-30 IDX-Plus incident (`memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`)
 * established that `InternetAddressDisplayYN` is provider-gated by REBNY:
 *
 *   - null (the vast majority of records) → REBNY pre-filter passed → DISPLAYABLE
 *   - true                                → explicit allow → DISPLAYABLE
 *   - false                               → explicit suppress → NOT DISPLAYABLE
 *
 * The OLD `affirmPermission(value)` collapsed null → false, hiding ~100% of
 * REBNY-IDX-Plus suggestions. This function applies the correct policy.
 *
 * The PRIMARY display gate (`checkDistributionGates`) MUST already have been
 * run by the caller — this function is the SECONDARY address-suppression
 * filter only.
 */
export function isAddressDisplayablePerSuggest(
  internetAddressDisplayYN: unknown,
): boolean {
  return internetAddressDisplayYN !== false;
}
