/**
 * THE CANONICAL STATUS TOKEN CONTRACT — one meaning, both directions.
 *
 * A broker's status criterion must mean the same thing on the way OUT (UI token
 * to a Cotality `$filter`) as on the way BACK (provider value to the status the
 * CRM displays). Until 2026-08-22 those two directions disagreed, and they
 * disagreed in opposite ways, so the error was invisible from either end alone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE LIVE API ACTUALLY CONTAINS (probed 2026-08-22, api.cotality.com)
 *
 * Full evidence: `docs/idx/COTALITY-SALE-RENTAL-STATUS-EVIDENCE-2026-08-22.md`
 *
 * `StandardStatus` is a nullable enum, `Edm.Int64`, with ELEVEN members:
 *
 *     Active=0  ActiveUnderContract=1  Canceled=2  Closed=3   ComingSoon=4
 *     Delete=5  Expired=6              Hold=7      Incomplete=8  Pending=9
 *     Withdrawn=10
 *
 * `Pending` and `ActiveUnderContract` are SEPARATE MEMBERS with separate values.
 * They are not synonyms and the provider does not treat them as such.
 *
 * `MlsStatus` is a DIFFERENT field with a DIFFERENT 25-member vocabulary, and
 * the provider suppresses it for filtering AND ordering at licence level
 * (HTTP 400). It may never stand in for `StandardStatus`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO OPPOSITE SUBSTITUTIONS THIS REPLACES
 *
 * OUTBOUND — `public/crm/js/search/search-engine.js`
 *
 *     'PENDING': 'ActiveUnderContract'
 *
 *   A broker ticking "Pending" asked Cotality for `ActiveUnderContract`. On the
 *   live feed that member has ZERO rows while `Pending` is populated, so the
 *   search returned nothing and the broker concluded there was no pending
 *   inventory. The map also sent `CONTRACT` and `UNDER_CONTRACT` to the same
 *   value and then de-duplicated, so selecting Pending AND Under Contract
 *   collapsed to a single criterion.
 *
 * INBOUND — `lib/search/crm-idx-mapper.ts`
 *
 *     ActiveUnderContract: 'PENDING'
 *     Pending:             'PENDING'
 *
 *   The reverse collapse. Two distinct provider states arrived and were
 *   displayed as one, so a listing genuinely under contract was shown to a
 *   client as merely pending.
 *
 * Round-tripping hid both: outbound turned PENDING into ActiveUnderContract and
 * inbound turned ActiveUnderContract back into PENDING, so a naive end-to-end
 * check "confirmed" the value survived. It did not survive; it was laundered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE
 *
 * One token maps to one member and back. Nothing is collapsed, nothing is
 * inferred, and an unrecognised value on either side is UNKNOWN rather than
 * assigned a plausible neighbour.
 */

/** Every member the live `StandardStatus` enum declares (2026-08-22). */
export const STANDARD_STATUS_MEMBERS = [
  'Active',
  'ActiveUnderContract',
  'Canceled',
  'Closed',
  'ComingSoon',
  'Delete',
  'Expired',
  'Hold',
  'Incomplete',
  'Pending',
  'Withdrawn',
] as const;

export type StandardStatusMember = (typeof STANDARD_STATUS_MEMBERS)[number];

/** The canonical status the CRM stores and displays. */
export type CrmStatusToken =
  | 'ACTIVE'
  | 'UNDER_CONTRACT'
  | 'PENDING'
  | 'COMING_SOON'
  | 'CLOSED'
  | 'WITHDRAWN'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'HOLD'
  | 'INCOMPLETE'
  | 'DELETE'
  | 'UNKNOWN';

/**
 * CRM token → the ONE `StandardStatus` member it means.
 *
 * `PENDING` and `UNDER_CONTRACT` are deliberately distinct entries pointing at
 * distinct members. That is the entire correction.
 */
const TOKEN_TO_MEMBER: Readonly<Record<Exclude<CrmStatusToken, 'UNKNOWN'>, StandardStatusMember>> =
  Object.freeze({
    ACTIVE: 'Active',
    UNDER_CONTRACT: 'ActiveUnderContract',
    PENDING: 'Pending',
    COMING_SOON: 'ComingSoon',
    CLOSED: 'Closed',
    WITHDRAWN: 'Withdrawn',
    CANCELLED: 'Canceled',
    EXPIRED: 'Expired',
    HOLD: 'Hold',
    INCOMPLETE: 'Incomplete',
    DELETE: 'Delete',
  });

/** `StandardStatus` member → the ONE CRM token it means. The exact inverse. */
const MEMBER_TO_TOKEN: Readonly<Record<StandardStatusMember, CrmStatusToken>> = Object.freeze({
  Active: 'ACTIVE',
  ActiveUnderContract: 'UNDER_CONTRACT',
  Pending: 'PENDING',
  ComingSoon: 'COMING_SOON',
  Closed: 'CLOSED',
  Withdrawn: 'WITHDRAWN',
  Canceled: 'CANCELLED',
  Expired: 'EXPIRED',
  Hold: 'HOLD',
  Incomplete: 'INCOMPLETE',
  Delete: 'DELETE',
});

/** Is this a member of the live provider vocabulary? */
export function isStandardStatusMember(value: unknown): value is StandardStatusMember {
  return typeof value === 'string' && (STANDARD_STATUS_MEMBERS as readonly string[]).includes(value);
}

/**
 * OUTBOUND. The `StandardStatus` member a CRM token asks for, or `null`.
 *
 * `null` means "no provider predicate exists for this token" and callers must
 * drop the criterion loudly rather than substituting a near neighbour — the
 * substitution is what sent Pending searches to an empty member.
 */
export function crmTokenToStandardStatus(token: unknown): StandardStatusMember | null {
  if (typeof token !== 'string') return null;
  const key = token.trim().toUpperCase() as Exclude<CrmStatusToken, 'UNKNOWN'>;
  return TOKEN_TO_MEMBER[key] ?? null;
}

/**
 * INBOUND. The CRM token a provider `StandardStatus` value means.
 *
 * Unrecognised or absent → `'UNKNOWN'`. Never `'ACTIVE'`: telling a broker an
 * unknown listing is on the market is the failure this codebase has corrected
 * twice already.
 */
export function standardStatusToCrmToken(standardStatus: unknown): CrmStatusToken {
  if (!isStandardStatusMember(standardStatus)) return 'UNKNOWN';
  return MEMBER_TO_TOKEN[standardStatus];
}

/**
 * The OData predicate for a set of CRM tokens.
 *
 * Returns the rendered `$filter` fragment plus the tokens that had no provider
 * member, so a caller can surface a dropped criterion instead of silently
 * narrowing or widening the broker's question.
 *
 * Rendered as positive `eq` predicates. `ne` is NOT used: it is well-behaved on
 * `StandardStatus` (verified — the enum has no case-variant member pairs) but
 * the exclusion form invites the same "complement of a set" defect corrected in
 * the Sale/Rental universe, and operator behaviour is verified per field rather
 * than inherited across enums.
 */
export function standardStatusOData(tokens: readonly unknown[]): {
  filter: string | null;
  members: StandardStatusMember[];
  unsupportedTokens: string[];
} {
  const members: StandardStatusMember[] = [];
  const unsupportedTokens: string[] = [];

  for (const token of tokens) {
    const member = crmTokenToStandardStatus(token);
    if (member === null) {
      unsupportedTokens.push(String(token));
      continue;
    }
    if (!members.includes(member)) members.push(member);
  }

  const filter =
    members.length === 0
      ? null
      : members.length === 1
        ? `StandardStatus eq '${members[0]}'`
        : `(${members.map((m) => `StandardStatus eq '${m}'`).join(' or ')})`;

  return { filter, members, unsupportedTokens };
}
