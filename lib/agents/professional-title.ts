/**
 * Pure helpers for an agent's PROFESSIONAL TITLE — the designation the public
 * and outside correspondents are told. No React / next / prisma dependencies
 * so they are trivially testable (same convention as ./avatar.ts).
 *
 * @module lib/agents/professional-title
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * `Agent.title` (professional designation) and `Agent.role` (application
 * authorisation) are DIFFERENT AXES and must never be derived from each other:
 *
 *   license_type  "broker" | "salesperson"  — the NY licence Maya's agents hold
 *   title         free text                 — what we advertise them as
 *   role          "BROKER" | "AGENT"        — what the CRM lets them DO
 *
 * "BROKER" unlocks the admin surfaces (audit log, every agent's leads,
 * automation, campaigns, /admin login) and belongs to the principal broker
 * alone. A NY *Associate* Broker holds a broker licence but is not the
 * principal broker, so she is correctly role "AGENT".
 *
 * Deriving an outbound title from `role` therefore labels every associate
 * broker a "Licensed Real Estate Salesperson" — a false statement about a
 * licensee in brokerage correspondence (NY DOS 19 NYCRR §175.25). The stored
 * canonical `title` is the authority; the licence-based fallback below is only
 * for records that predate the field.
 */

export const PRINCIPAL_BROKER_TITLE = 'Licensed Real Estate Broker';
export const ASSOCIATE_BROKER_TITLE = 'Licensed Real Estate Associate Broker';
export const SALESPERSON_TITLE = 'Licensed Real Estate Salesperson';

export interface ProfessionalTitleSource {
  /** Canonical stored title — authoritative when present. */
  title?: string | null;
  /** NY licence designation: "broker" | "salesperson". */
  license_type?: string | null;
  /** CRM authorisation grant: "BROKER" | "AGENT". NOT a licence designation. */
  role?: string | null;
}

/** True only for the principal-broker AUTHORISATION grant. */
export function isPrincipalBrokerRole(role: string | null | undefined): boolean {
  return (role ?? '').trim().toUpperCase() === 'BROKER';
}

/**
 * Resolve the title to advertise for an agent.
 *
 * DERIVED from the two canonical axes. The stored `title` column does NOT win:
 *
 *   salesperson  + any role    -> Licensed Real Estate Salesperson
 *   broker       + role AGENT  -> Licensed Real Estate Associate Broker
 *   broker       + role BROKER -> Licensed Real Estate Broker
 *
 * An earlier version preferred the stored string ("the canonical stored title
 * always wins"). That made this module and the writers disagree: the writers
 * derive the column, so a stale or free-form value left behind by an older
 * client would have overridden the regulated designation here — and this is
 * what addresses outside brokers in agent-inquiry email, where a false
 * designation is a false statement about a licensee (NY DOS 19 NYCRR 175.25).
 *
 * The stored string is consulted ONLY when the licence class is unknown, so a
 * legacy record with a title but no licence still says something rather than
 * nothing. Returns '' when neither is resolvable — callers omit the line rather
 * than assert a designation nobody can stand behind.
 */
export function professionalTitle(agent: ProfessionalTitleSource | null | undefined): string {
  if (!agent) return '';

  // 1. DERIVE from licence class + authorisation role. This is the regulated
  //    designation and it outranks whatever text happens to be stored.
  const licence = (agent.license_type ?? '').trim().toLowerCase();
  if (licence === 'broker') {
    return isPrincipalBrokerRole(agent.role) ? PRINCIPAL_BROKER_TITLE : ASSOCIATE_BROKER_TITLE;
  }
  if (licence === 'salesperson') return SALESPERSON_TITLE;

  // 2. Licence unknown — fall back to whatever was stored, so a legacy record
  //    is not silently blanked.
  const stored = (agent.title ?? '').trim();
  if (stored) return stored;

  // 3. Nothing resolvable — assert nothing.
  return '';
}
