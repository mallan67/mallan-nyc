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


/**
 * CRM token → the ONE `StandardStatus` member it means.
 *
 * `PENDING` and `UNDER_CONTRACT` are deliberately distinct entries pointing at
 * distinct members. That is the entire correction.
 */
const TOKEN_TO_MEMBER: Readonly<Record<string, StandardStatusMember>> = Object.freeze({
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


/**
 * NOTE: there is NO legacy alias table in this file, by design.
 *
 * THE CANONICAL VALUE IS THE EXACT COTALITY MEMBER. A contract that quietly
 * accepts `UNDER_CONTRACT` or `COMING_SOON` is a contract that keeps a second
 * vocabulary alive, and this codebase has now been bitten three times by
 * exactly that: two opposite substitutions that cancelled, three separate
 * browser/server translation tables, and a four-vocabulary chain that made the
 * UCBA Coming Soon badge stop matching.
 *
 * Saved searches written before 2026-08-22 do hold those spellings. They are
 * migrated at an explicitly separate boundary,
 * lib/search/legacy-status-migration.ts, which converts them ONCE
 * on the way in and hands this contract an exact member. A legacy spelling
 * never becomes provider truth, is never persisted again, and never reaches
 * Cotality.
 */

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
  // EXACT MEMBERS ONLY. A Mallan-invented spelling is not translated here; see
  // the note above and the separate migration boundary.
  return isStandardStatusMember(trimmed) ? trimmed : null;
}



/**
 * The DEFAULT market universe — what a Search means when the broker names no status.
 *
 * This lived as a literal OData string inside crm-idx-filter.ts:
 *
 *   "(StandardStatus eq 'Active' or ... 'ComingSoon' or ... 'ActiveUnderContract')"
 *
 * so StandardStatus had TWO renderers — this module for an explicit status, and a
 * hand-rolled literal for the default. The default is the path almost every search
 * takes, and 'which listings count as on-market' is a Mallan business rule, which is
 * the kind of decision this module exists to hold. Held here, the default and an
 * explicit selection cannot drift apart, because both render through the same
 * function and the same member vocabulary.
 *
 * TOKENS, not a rendered clause: the caller renders them via standardStatusOData so
 * an unsupported member would fail loudly here exactly as it does for broker input.
 *
 * NOT a provider claim. Membership of these three in StandardStatus is recorded
 * against the live probe in the registry entry for market_status.
 */
export const DEFAULT_MARKET_STATUS_TOKENS: readonly StandardStatusMember[] = Object.freeze([
  'Active',
  'ComingSoon',
  'ActiveUnderContract',
]);

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

/**
 * The human label for a status. PRESENTATION ONLY.
 *
 * Formatting happens at render time and never changes the stored, DTO, or
 * search value. `ActiveUnderContract` displays as "Under Contract"; it does not
 * BECOME "UNDER_CONTRACT" anywhere.
 *
 * An unrecognised value gets a neutral label rather than an invented status —
 * a renderer must never turn "we do not know" into a status a broker can quote.
 */
const STATUS_LABELS: Readonly<Record<StandardStatusMember, string>> = Object.freeze({
  Active: 'Active',
  ActiveUnderContract: 'Under Contract',
  Pending: 'Pending',
  ComingSoon: 'Coming Soon',
  Closed: 'Closed',
  Withdrawn: 'Withdrawn',
  Canceled: 'Canceled',
  Expired: 'Expired',
  Hold: 'Hold',
  Incomplete: 'Incomplete',
  Delete: 'Removed',
});

export function statusDisplayLabel(status: unknown): string {
  if (isStandardStatusMember(status)) return STATUS_LABELS[status];
  return 'Status Unavailable';
}
