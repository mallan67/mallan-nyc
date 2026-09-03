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
 * designation is included if stored. Never invented: a missing designation is
 * simply omitted (caller still shows the brokerage). The fallback resolves the
 * LICENCE CLASS to its regulated designation rather than printing the raw column
 * value — §175.25(c)(4) prohibits a bare "broker", and a raw class token such as
 * "associate_broker" is not a designation at all.
 *
 * @module lib/listings/assigned-agent
 */
import { resolveListingAgentInfo, type ResolvableListingAgent } from "@/lib/listings/agent-info-resolver";
import { professionalTitle } from "@/lib/agents/professional-title";

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
  /**
   * Phase B (agent_info normalization): the listing's typed agent columns. When present they are
   * read TYPED-FIRST (via resolveListingAgentInfo) with `agentInfo` JSON fallback. Optional so
   * callers that don't pass them safely fall back to the JSON (no regression).
   */
  typed?: ResolvableListingAgent | null;
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

  // Phase B: typed-first (typed columns), then agent_info JSON, then the Agent record.
  const resolved = resolveListingAgentInfo({ ...(input.typed ?? {}), agent_info: ai });
  const name = resolved.fullName || str(ar?.full_name);
  const email = resolved.agentEmail || str(ar?.email);
  const phone = resolved.agentDirectPhone || str(ar?.phone);
  const company = resolved.officeName || "";
  const photo = str(ar?.photo);
  // §175.25 license designation — prefer the stored title, else derive it from
  // the LICENCE CLASS through the one title authority. Never the raw column.
  const title = str(ar?.title) || professionalTitle({ license_type: ar?.license_type });
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
