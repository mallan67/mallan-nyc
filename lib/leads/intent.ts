/**
 * Contact-form intent routing — A3 lane (2026-05-20).
 *
 * The public site exposes CTAs that carry an `?intent=` URL parameter
 * (e.g. `/contact?intent=international-seller`). On main HEAD `dd9475cd` the
 * intent was DROPPED between URL → form → API → lead, so a high-intent seller
 * landing from a townhouse exclusive CTA was treated as a generic buyer lead
 * and routed to the wrong agent queue. Audit pointer:
 *   docs/audits/exclusive-launch-readiness-audit-2026-05-20.md → A3.
 *
 * This module is the SINGLE SOURCE OF TRUTH for:
 *   1. The CLOSED allowlist of accepted intent values.
 *   2. Normalization (case-insensitive, whitespace-trimmed, defaulted to
 *      "general" on unknown input).
 *   3. Mapping intent → lead.roles (additive, never demote).
 *   4. Lead-role merging that NEVER overwrites prior roles.
 *
 * Compliance notes (TCPA / NY SHIELD / Fair Housing / NY DOS):
 *   - The allowlist is CLOSED — arbitrary URL values can't be reflected
 *     anywhere user-visible without sanitisation, and can't be weaponised as
 *     a tracking-pixel side channel.
 *   - No intent value names a protected class (race, religion, national
 *     origin, familial status, etc. — see Fair Housing Act + NYSHRL + NYC
 *     Human Rights Law). Adding such a value would be a hard block.
 *   - Intent NEVER unlocks portal access, agent privileges, or new PII
 *     collection — it only tags lead.roles for routing.
 *   - mergeRoles is additive only: never erases prior roles (so a returning
 *     buyer who later becomes a seller keeps both flags for re-marketing
 *     under CAN-SPAM unsubscribe parity).
 *
 * Test contract:
 *   tests/runtime/contact-form-consent.test.ts asserts INTENT_ALLOWLIST,
 *   classifyIntent, and mergeRoles are exported by name — a future refactor
 *   that renames or removes them will red-light the suite.
 */

/**
 * Closed allowlist of accepted intent values. Any value outside this set
 * is normalized to "general". DO NOT add a value without:
 *   (a) confirming it does not name a protected class (Fair Housing),
 *   (b) extending classifyIntent to map it to a role, and
 *   (c) adding a test case in tests/runtime/contact-form-consent.test.ts.
 */
export const INTENT_ALLOWLIST = new Set<string>([
  'general',
  'buyer',
  'seller',
  'exclusive-seller',
  'townhouse-seller',
  'international-seller',
  'landlord',
  'tenant',
]);

/** Max bytes of raw URL value kept in AuditEvent.changes.intent_raw. */
export const INTENT_RAW_MAX_LENGTH = 128;

/** Allowed lead roles (matches schema String[] convention). */
export type LeadRole = 'buyer' | 'seller' | 'landlord' | 'tenant';

export interface ClassifiedIntent {
  /** Normalized value from INTENT_ALLOWLIST (always "general" on unknown). */
  intent: string;
  /** Role(s) this intent implies. Always at least one entry. */
  roles: LeadRole[];
}

/**
 * Normalize + classify a raw intent value into a known intent + role(s).
 *
 * Behavior:
 *  - undefined / null / non-string → "general" → ["buyer"]
 *  - whitespace-trimmed and lowercased before matching
 *  - any value outside INTENT_ALLOWLIST → "general" → ["buyer"]
 *  - "general" / "buyer" → ["buyer"]
 *  - "seller" / "exclusive-seller" / "townhouse-seller" / "international-seller" → ["seller"]
 *  - "landlord" → ["landlord"]
 *  - "tenant" → ["tenant"]
 *
 * NOTE: A returning lead's existing roles are merged separately by
 * mergeRoles(); this function only produces the *incoming* role contribution.
 */
export function classifyIntent(raw: unknown): ClassifiedIntent {
  // No ReDoS surface — pure string ops, no regex with backtracking.
  const candidate =
    typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  const intent = INTENT_ALLOWLIST.has(candidate) ? candidate : 'general';

  let roles: LeadRole[];
  switch (intent) {
    case 'seller':
    case 'exclusive-seller':
    case 'townhouse-seller':
    case 'international-seller':
      roles = ['seller'];
      break;
    case 'landlord':
      roles = ['landlord'];
      break;
    case 'tenant':
      roles = ['tenant'];
      break;
    case 'buyer':
    case 'general':
    default:
      roles = ['buyer'];
      break;
  }

  return { intent, roles };
}

/**
 * Truncate the raw URL intent value for forensic logging. We keep the raw
 * value (sanitised for length only) so abuse patterns (XSS payloads,
 * tracking-pixel attempts) are visible in AuditEvent.changes.intent_raw
 * without polluting business logic.
 *
 * Returns null if the input is not a string at all — there is nothing to log.
 */
export function truncateIntentRaw(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0) return '';
  return raw.slice(0, INTENT_RAW_MAX_LENGTH);
}

/**
 * Merge incoming roles into an existing role array WITHOUT erasing prior
 * roles. A returning lead who previously had ["buyer", "seller"] and now
 * submits with intent=tenant becomes ["buyer", "seller", "tenant"].
 *
 * Guarantees:
 *  - Deduplicated (Set-backed).
 *  - Existing roles are preserved verbatim — never demoted, never dropped.
 *  - Only roles in the LeadRole union are added from `incoming`; any
 *    foreign string from `existing` (e.g. a legacy "renter" tag) is
 *    preserved as-is so we don't quietly drop historical data.
 *  - Output order: existing roles first (preserved insertion order from
 *    Set), then new incoming roles in classification order.
 *  - Always returns at least one role (defaults to ["buyer"] if both
 *    inputs are empty).
 */
export function mergeRoles(
  existing: readonly string[] | null | undefined,
  incoming: readonly LeadRole[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  if (existing) {
    for (const r of existing) {
      if (typeof r === 'string' && r.length > 0 && !seen.has(r)) {
        seen.add(r);
        out.push(r);
      }
    }
  }
  for (const r of incoming) {
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }

  if (out.length === 0) {
    out.push('buyer');
  }
  return out;
}
