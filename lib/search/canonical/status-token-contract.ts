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

/**
 * LEGACY BOUNDARY COMPATIBILITY — not canonical, and never outgoing.
 *
 * THE CANONICAL EXECUTABLE VALUE IS THE EXACT COTALITY MEMBER. A criterion, a
 * persisted saved search, and an outgoing `$filter` all carry `Pending`,
 * `ActiveUnderContract`, `ComingSoon` — the provider's own words. Mallan does
 * not mint a parallel vocabulary for the Search foundation and then translate.
 *
 * The DOM already agreed: the status checkboxes carry
 * `data-value="Active" / "ComingSoon" / "Pending"`. The uppercase tokens were
 * invented purely in the JavaScript in between, and THREE separate tables then
 * existed to translate them back — in search-engine.js, in saved-searches.js,
 * and here.
 *
 * This map exists ONLY to migrate a SAVED SEARCH written before that. It is
 * applied at the boundary, once, on the way in. A legacy spelling never becomes
 * provider truth, is never persisted again, and never reaches Cotality.
 *
 * `FUTURE` and `OFFEROUT` are deliberately ABSENT. `FUTURE` used to be sent as
 * `Incomplete`; Cotality declares `Incomplete` and does not declare `Future`,
 * and one existing establishes nothing about the other's meaning — the same
 * unverified-equivalence mistake as `PENDING -> ActiveUnderContract`. They stay
 * unsupported until Mallan decides what they mean, and an unsupported criterion
 * FAILS rather than being silently dropped or substituted.
 */
const LEGACY_CRITERION_ALIASES: Readonly<Record<string, StandardStatusMember>> = Object.freeze({
  ACTIVE: 'Active',
  PENDING: 'Pending',
  UNDER_CONTRACT: 'ActiveUnderContract',
  CONTRACT: 'ActiveUnderContract',
  ACTIVEUNDERCONTRACT: 'ActiveUnderContract',
  ACTIVE_UNDER_CONTRACT: 'ActiveUnderContract',
  COMING_SOON: 'ComingSoon',
  COMINGSOON: 'ComingSoon',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn',
  CANCELLED: 'Canceled',
  CANCELED: 'Canceled',
  EXPIRED: 'Expired',
  HOLD: 'Hold',
  INCOMPLETE: 'Incomplete',
  DELETE: 'Delete',
});

/**
 * A status criterion carried a token with no live provider member.
 *
 * Thrown rather than warned. Dropping the criterion and continuing turns a
 * broker's NARROW query into a BROAD one while still looking successful —
 * strictly worse than the HTTP 400 it replaced, because a 400 is visible and a
 * silently widened result set is not.
 */
export class UnsupportedStatusCriterionError extends Error {
  readonly unsupportedTokens: readonly string[];

  constructor(unsupportedTokens: readonly string[]) {
    super(
      `Unsupported status criterion: ${unsupportedTokens.map((t) => `'${t}'`).join(', ')}. ` +
        `Not a live Cotality StandardStatus member. A criterion the provider cannot ` +
        `express is never dropped and never substituted — dropping it would widen the ` +
        `search rather than narrow it, and substituting a near neighbour is what sent ` +
        `Pending searches to the empty ActiveUnderContract member.`,
    );
    this.name = 'UnsupportedStatusCriterionError';
    this.unsupportedTokens = unsupportedTokens;
  }
}

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
  const trimmed = token.trim();

  // THE CANONICAL FORM: an exact live member, used verbatim. This is the normal
  // path — criteria, saved searches and outgoing filters all carry the
  // provider's own words.
  if (isStandardStatusMember(trimmed)) return trimmed;

  // LEGACY ONLY, migrated at the boundary. Whitespace is stripped so the spaced
  // spellings an older saved search may hold ("Coming Soon", "Active Under
  // Contract") migrate through the SAME table, rather than a second normaliser
  // existing somewhere else.
  const legacy = trimmed.replace(/\s+/g, '').toUpperCase();
  return LEGACY_CRITERION_ALIASES[legacy] ?? null;
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
 * THROWS `UnsupportedStatusCriterionError` if ANY token has no provider member.
 *
 * It does not drop the token and continue. Dropping it removes the status clause
 * and the search widens to every status while still returning HTTP 200 — a
 * broker's narrow question answered broadly, with nothing to indicate it. That
 * is worse than the HTTP 400 an invalid enum member used to cause, because a 400
 * is visible.
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

  // FAIL CLOSED. A mixed valid+unsupported request is NOT partially executed:
  // running the valid half answers a different question from the one the broker
  // asked, and does so without telling them.
  if (unsupportedTokens.length > 0) {
    throw new UnsupportedStatusCriterionError(unsupportedTokens);
  }

  const filter =
    members.length === 0
      ? null
      : members.length === 1
        ? `StandardStatus eq '${members[0]}'`
        : `(${members.map((m) => `StandardStatus eq '${m}'`).join(' or ')})`;

  return { filter, members, unsupportedTokens };
}
