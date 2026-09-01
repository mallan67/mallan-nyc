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
 * Returns '' when the agent cannot be resolved at all — callers must omit the
 * title line rather than assert a designation we cannot stand behind. Guessing
 * "Salesperson" for an unknown licensee is the exact defect this replaces.
 */
export function professionalTitle(agent: ProfessionalTitleSource | null | undefined): string {
  if (!agent) return '';

  // 1. The canonical stored title always wins.
  const stored = (agent.title ?? '').trim();
  if (stored) return stored;

  // 2. Fall back to the LICENCE, never to the authorisation role alone.
  const licence = (agent.license_type ?? '').trim().toLowerCase();
  if (licence === 'broker') {
    return isPrincipalBrokerRole(agent.role) ? PRINCIPAL_BROKER_TITLE : ASSOCIATE_BROKER_TITLE;
  }
  if (licence === 'salesperson') return SALESPERSON_TITLE;

  // 3. No title and no licence on record — assert nothing.
  return '';
}
