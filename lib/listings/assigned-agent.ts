/**
 * Assigned-agent DISPLAY payload for the public listing-detail contact card.
 *
 * For a Mallan EXCLUSIVE (SL-/RL- listing_id or website-only rls_eligible=false)
 * the public contact card shows our OWN listing agent. The display name / office
 * / email / phone come from the listing's `agent_info` JSON (manual values win);
 * the headshot, license title and profile slug are NOT in agent_info — they live
 * on the Agent record — so the caller loads the linked agent (by agent_id) and
 * passes it in. This module merges the two into the card payload.
 *
 * Pure + generic: no hardcoded person, no hardcoded listing. Third-party IDX/RLS
 * rows are not Mallan exclusives → returns null → the card falls back to the
 * brokerage-only block and NO third-party agent PII is surfaced.
 *
 * Compliance: NY DOS §175.25 — when the agent's name is shown, the license
 * designation (`title`, else `license_type`) is included if stored. Never
 * invented: a missing title is simply omitted (caller still shows the brokerage).
 *
 * @module lib/listings/assigned-agent
 */

/** The Agent-record subset needed for the contact card (structural shape). */
export interface AssignedAgentRecord {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  photo?: string | null;
  title?: string | null;
  license_type?: string | null;
  public_slug?: string | null;
}

export interface BuildAssignedAgentInput {
  /** True for SL-/RL- or website-only (rls_eligible===false) Mallan listings. */
  isMallanExclusive: boolean;
  /** The listing's agent_info JSON (manual/display values win). */
  agentInfo: Record<string, unknown> | null | undefined;
  /** The linked Agent row (by agent_id), or null when none / not exclusive. */
  agentRecord: AssignedAgentRecord | null | undefined;
}

/** What the contact card renders. All fields optional; blanks are omitted. */
export interface AssignedAgentDisplay {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  photo?: string;
  title?: string;
  slug?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Build the assigned-agent card payload, or null when none should show.
 *
 * Precedence: agent_info (manual/display) wins for name/email/phone; the Agent
 * record fills what agent_info lacks (and is the ONLY source for photo/title/
 * slug). Returns null for non-exclusive listings or when nothing displayable.
 */
export function buildAssignedAgentDisplay(
  input: BuildAssignedAgentInput,
): AssignedAgentDisplay | null {
  if (!input.isMallanExclusive) return null;
  const ai = input.agentInfo || {};
  const ar = input.agentRecord || null;

  const name = str(ai.ListAgentFullName) || str(ar?.full_name);
  const email = str(ai.ListAgentEmail) || str(ar?.email);
  const phone = str(ai.ListAgentDirectPhone) || str(ar?.phone);
  const company = str(ai.ListOfficeName);
  const photo = str(ar?.photo);
  // §175.25 license designation — prefer the stored title, else license_type.
  const title = str(ar?.title) || str(ar?.license_type);
  const slug = str(ar?.public_slug);

  if (!name && !email && !phone && !company && !photo) return null;

  const out: AssignedAgentDisplay = {};
  if (name) out.name = name;
  if (email) out.email = email;
  if (phone) out.phone = phone;
  if (company) out.company = company;
  if (photo) out.photo = photo;
  if (title) out.title = title;
  if (slug) out.slug = slug;
  return out;
}
