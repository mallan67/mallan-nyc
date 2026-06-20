/**
 * Mallan-exclusive listing-agent assignment.
 *
 * When a listing is created/updated in the CRM as a Mallan EXCLUSIVE
 * (listing_id prefix `SL-`/`RL-`, or `rls_eligible === false` website-only,
 * i.e. a listing Mallan itself authored), the listing's agent identity must
 * be stamped onto the row so the public surfaces (FeaturedListings, the
 * listing detail contact card, attribution lines) can render the ACTUAL
 * listing agent + brokerage.
 *
 * This module is the single source of truth for that mapping. It is a PURE
 * function: it takes the agent identity the app already holds (from the
 * authenticated session / request — `auth.userId` resolved to an Agent row)
 * and returns the four fields to persist. It does NOT hardcode a person and
 * it does NOT read env vars.
 *
 * The four assigned fields
 * ------------------------
 *   1. `agent_id`              → Listing.agent_id column (BigInt FK → Agent)
 *   2. `list_agent_full_name`  → agent_info.ListAgentFullName
 *   3. `list_office_name`      → agent_info.ListOfficeName
 *   4. `agent_info`            → the enriched REBNY-shaped JSON blob carrying
 *                                the display name, office, and Mallan's own
 *                                contact for this exclusive.
 *
 * Compliance
 * ----------
 *   - UCBA Art. III §2(C): attribution must identify the ACTUAL listing
 *     broker. For a Mallan exclusive, Mallan IS the listing broker — so
 *     stamping the named Mallan agent + "Mallan Real Estate Inc." is the
 *     correct, required attribution.
 *   - 19 NYCRR §175.25: advertising must name the brokerage; `ListOfficeName`
 *     carries it.
 *   - The agent email/phone we surface here are Mallan's OWN contact for OUR
 *     OWN listing — this is not the third-party-agent PII that the NAR
 *     settlement / REBNY rules strip from IDX display. It is published only
 *     for the exclusive path; third-party IDX rows never reach this helper.
 *   - Manual typed values always win: this helper FILLS only blank
 *     agent_info keys (see `mergeBlankOnly`), so any name/office/contact the
 *     form already carried is preserved.
 *
 * @module lib/listings/exclusive-agent-assignment
 */

import { MALLAN_BROKERAGE_NAME } from '@/lib/syndication/mallan-identity';
import { typedAgentColumnsFromJson } from '@/lib/listings/agent-info-typed-columns';

const CRM_PREFIXES = ['SL-', 'RL-'] as const;

/**
 * The agent identity the app already holds — sourced from the authenticated
 * session (the Agent row keyed by `auth.userId`). Structural shape so callers
 * can pass a Prisma Agent row or a session-derived object without importing
 * `@prisma/client`.
 */
export interface AssigningAgentIdentity {
  id: bigint | number | string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Brokerage trade name override. Defaults to Mallan's canonical name. */
  office_name?: string | null;
}

/** Minimal listing shape needed to decide whether this is a Mallan exclusive. */
export interface ExclusiveAssignmentListing {
  /** The listing_id (used to detect the SL-/RL- CRM prefix). */
  listing_id?: string | null;
  /** false = website-only (commercial / off-RLS) — also Mallan-authored. */
  rls_eligible?: boolean | null;
}

/** The persisted result of an exclusive agent assignment. */
export interface ExclusiveAgentAssignment {
  agent_id: bigint;
  list_agent_full_name: string;
  list_office_name: string;
  /** REBNY-shaped agent_info JSON (merged blank-only over the existing one). */
  agent_info: Record<string, unknown>;
  /**
   * Phase A: the 6 NET-NEW typed agent columns derived from `agent_info` (the 2
   * display columns above are kept verbatim for backwards-compat). PII boundary:
   * email/direct-phone are stored but exposure stays gated by the read layer.
   */
  list_agent_email: string | null;
  list_agent_direct_phone: string | null;
  list_office_mls_id: string | null;
  list_agent_mls_id: string | null;
  co_list_office_mls_id: string | null;
  co_list_agent_mls_id: string | null;
}

/**
 * True when the listing is a Mallan-authored exclusive: either its
 * listing_id carries the `SL-`/`RL-` CRM prefix, or it is an explicit
 * website-only row (`rls_eligible === false`). These are the rows Mallan
 * itself listed — the only rows that get a Mallan agent stamped.
 */
export function isMallanExclusiveListing(listing: ExclusiveAssignmentListing): boolean {
  const id = String(listing.listing_id ?? '');
  if (CRM_PREFIXES.some((p) => id.startsWith(p))) return true;
  if (listing.rls_eligible === false) return true;
  return false;
}

/** Resolve a display full name from whatever name parts the identity carries. */
function resolveFullName(agent: AssigningAgentIdentity): string {
  const explicit = (agent.full_name ?? '').trim();
  if (explicit) return explicit;
  const composed = [agent.first_name, agent.last_name]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return composed;
}

/**
 * Merge `additions` into `base`, writing a key ONLY when `base` does not
 * already have a non-empty value for it. Manual / form-supplied values in
 * `base` always win. Returns a new object; does not mutate `base`.
 */
function mergeBlankOnly(
  base: Record<string, unknown>,
  additions: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(additions)) {
    if (value == null || value === '') continue;
    const existing = out[key];
    const existingBlank = existing == null || (typeof existing === 'string' && existing.trim() === '');
    if (existingBlank) out[key] = value;
  }
  return out;
}

/**
 * Build the four agent-assignment fields for a Mallan exclusive listing.
 *
 * Returns `null` when the listing is NOT a Mallan exclusive (third-party
 * IDX/RLS rows are never stamped — their attribution stays with the actual
 * listing brokerage).
 *
 * `existingAgentInfo` is the listing's current agent_info JSON (from the
 * form/normalizer). Existing non-blank keys are preserved (manual wins);
 * only blank keys are filled from the agent identity.
 */
export function buildExclusiveAgentAssignment(
  agent: AssigningAgentIdentity,
  listing: ExclusiveAssignmentListing,
  existingAgentInfo: Record<string, unknown> = {},
): ExclusiveAgentAssignment | null {
  if (!isMallanExclusiveListing(listing)) return null;

  const fullName = resolveFullName(agent);
  const officeName = (agent.office_name ?? '').trim() || MALLAN_BROKERAGE_NAME;
  const email = (agent.email ?? '').trim();
  const phone = (agent.phone ?? '').trim();

  // Fill ONLY blank keys — any name/office/contact the form already carried
  // is preserved (manual typed values always win).
  const agentInfo = mergeBlankOnly(existingAgentInfo, {
    ListAgentFullName: fullName,
    ListOfficeName: officeName,
    ListAgentEmail: email,
    ListAgentDirectPhone: phone,
  });

  // list_agent_full_name / list_office_name reflect whatever ended up in
  // agent_info after the blank-only merge (manual value wins, else identity).
  const resolvedName = String(agentInfo.ListAgentFullName ?? fullName);
  const resolvedOffice = String(agentInfo.ListOfficeName ?? officeName);

  // Phase A: derive the 6 net-new typed columns from the merged agent_info JSON.
  const typed = typedAgentColumnsFromJson(agentInfo);

  return {
    agent_id: BigInt(agent.id),
    list_agent_full_name: resolvedName,
    list_office_name: resolvedOffice,
    agent_info: agentInfo,
    list_agent_email: typed.list_agent_email,
    list_agent_direct_phone: typed.list_agent_direct_phone,
    list_office_mls_id: typed.list_office_mls_id,
    list_agent_mls_id: typed.list_agent_mls_id,
    co_list_office_mls_id: typed.co_list_office_mls_id,
    co_list_agent_mls_id: typed.co_list_agent_mls_id,
  };
}
