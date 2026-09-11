/**
 * BROKERAGE PROFESSIONAL ROLE — what a person IS in the firm.
 *
 * @module lib/agents/brokerage-role
 *
 * ── Three concepts, and who owns each ─────────────────────────────────────
 *
 *   NY LICENCE CLASS              `Agent.license_type`
 *                                 (lib/agents/professional-title.ts)
 *   BROKERAGE PROFESSIONAL ROLE   `Agent.role`  ← this module
 *   SOFTWARE AUTHORISATION        the authenticated session identity
 *                                 (`Session.user_type`) evaluated against
 *                                 explicit Mallan permission rules
 *
 * There is deliberately NO third "authorisation" column. Authorisation is not a
 * stored attribute of a person; it is a decision made about a session. Adding a
 * column to make the model look symmetrical would just relocate the conflation.
 *
 * ── CORRELATION IS NOT DERIVATION ─────────────────────────────────────────
 * The licence class and the brokerage role will usually agree — an associate
 * real estate broker is normally an ASSOCIATE_BROKER in the firm. They agree
 * because BOTH are recorded from known facts, NOT because either implies the
 * other. This module therefore offers no helper that computes one from the
 * other, and none may be added: a future licensee can legitimately break the
 * symmetry and the model has to survive it.
 */

/** The canonical brokerage professional roles. */
export const BROKERAGE_ROLES = ['BROKER', 'ASSOCIATE_BROKER', 'SALESPERSON'] as const;
export type BrokerageRole = (typeof BROKERAGE_ROLES)[number];

/**
 * LEGACY TOLERANCE, read-side only.
 *
 * `Agent.role` defaulted to "AGENT" under the retired model, where the column
 * meant "not the principal broker" rather than naming a profession. Those rows
 * and their live sessions still exist and this change does not mutate
 * Production, so "AGENT" is still ACCEPTED for access eligibility. It states no
 * profession and must never be presented as one.
 */
export const LEGACY_BROKERAGE_ROLES = ['AGENT'] as const;

/**
 * Normalise the stored role for comparison.
 *
 * Mixed casing exists in live data ("BROKER" and "broker" are both handled at
 * several call sites), so never assume the canonical form on read.
 */
export function normaliseBrokerageRole(role: string | null | undefined): string {
  return String(role ?? '').trim().toUpperCase();
}

/** True only for the PRINCIPAL broker. Narrow, and deliberately kept narrow. */
export function isPrincipalBroker(role: string | null | undefined): boolean {
  return normaliseBrokerageRole(role) === 'BROKER';
}

/**
 * ACCESS ELIGIBILITY ONLY — "may this session use Mallan licensee surfaces?"
 *
 * It answers nothing about what the person is licensed as. Do not read a
 * licence class out of it, and do not use it to build a designation.
 *
 * ── Why this predicate exists at all ──────────────────────────────────────
 * Generic licensee access used to be spelled `role === "AGENT" || role ===
 * "BROKER"`, which asked "are you the non-principal one" when it meant "are you
 * a Mallan licensee". Naming the professional roles honestly would have 403'd
 * every associate broker and salesperson out of ~146 CRM routes.
 *
 * The obvious repair — accept any `userType === "agent"` session — was NOT
 * taken on its own. `Agent` rows are not proven to be exclusively licensed
 * professionals (`license_type` is nullable, and nothing in the schema marks a
 * non-licensee), so widening to the whole agent session population could grant
 * licensee permissions to an office/admin account. Callers therefore require
 * BOTH the agent session identity AND this explicit predicate, which is
 * strictly today's allow-list plus the two honest professional roles.
 */
export function isLicenseeAccessRole(role: string | null | undefined): boolean {
  const r = normaliseBrokerageRole(role);
  return (BROKERAGE_ROLES as readonly string[]).includes(r)
    || (LEGACY_BROKERAGE_ROLES as readonly string[]).includes(r);
}

/**
 * True when the value is one `Agent.role` may be WRITTEN with.
 *
 * EXACT match, deliberately. Case-insensitive comparison belongs to the READ
 * helpers above, which exist because mixed casing is already in live data.
 * Accepting `"salesperson"` here and storing `"SALESPERSON"` would be inbound
 * normalisation — the write boundary refuses what it is given rather than
 * quietly repairing it, exactly as the licence-class boundary does.
 */
export function isCanonicalBrokerageRole(v: unknown): v is BrokerageRole {
  return typeof v === 'string' && (BROKERAGE_ROLES as readonly string[]).includes(v);
}

/**
 * WRITE BOUNDARY for `Agent.role`.
 *
 * Legacy values — `"AGENT"` above all — are tolerated on READ and REFUSED here.
 * Read tolerance is not write tolerance: a brand-new row must carry a canonical
 * professional role, or the transition never ends.
 *
 * Returns an error message, or null when acceptable. An ABSENT value is
 * accepted here because callers differ on whether the field is optional;
 * the CREATE path additionally REQUIRES it — see requireBrokerageRole().
 */
export function rejectNonCanonicalBrokerageRole(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null; // presence is the caller's rule
  if (isCanonicalBrokerageRole(v)) return null;
  return `role must be one of ${BROKERAGE_ROLES.join(' | ')}, received "${String(v)}". `
    + 'It is the brokerage professional role, not a licence class and not a permission.';
}

/**
 * CREATE-PATH RULE: the brokerage role is REQUIRED and has NO default.
 *
 * A default of `"AGENT"` is what this correction exists to remove. `"AGENT"`
 * never named a profession — it meant "not the principal broker" — so defaulting
 * to it let a stale client or a direct API caller mint a brand-new non-canonical
 * Agent at the one place that creates rows. There is deliberately no fallback:
 * an unstated professional role is refused, not guessed.
 *
 * Returns an error message, or null when acceptable.
 */
export function requireBrokerageRole(v: unknown): string | null {
  if (v === undefined || v === null || v === '') {
    return `role is required and must be one of ${BROKERAGE_ROLES.join(' | ')}. `
      + 'It is the brokerage professional role, recorded from a known fact — it is '
      + 'not defaulted, not derived from the licence class, and not a permission.';
  }
  return rejectNonCanonicalBrokerageRole(v);
}
