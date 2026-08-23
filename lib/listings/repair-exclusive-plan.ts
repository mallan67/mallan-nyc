/**
 * Pure decision logic for the Mallan-exclusive agent-assignment repair ops script
 * (`scripts/ops/repair-exclusive-agent-assignment.mjs`).
 *
 * Phase C (agent_info normalization, board #415): the live attribution lives in the 8
 * TYPED columns — `agent_info` JSON is frozen/empty for rows created/edited after the
 * stop-write change. So the repair MUST decide candidates and fill values TYPED-FIRST
 * (via `resolveListingAgentInfo`), never from the retired JSON. Otherwise a row with good
 * typed attribution but `agent_info = {}` would be (wrongly) "repaired" — overwriting a
 * manual typed name with the owning Agent row and nulling MLS/email fields absent from the
 * JSON source (Codex #420 blocker).
 *
 * Invariants:
 *   - skip a row when the COTALITYLVED (typed-first) full name is already present, unless `force`.
 *   - fill ONLY blank resolved values from the Agent row / default brokerage (manual wins).
 *   - NEVER null a typed column that already has a value (MLS IDs are preserved as resolved —
 *     they are not on the Agent row).
 *   - never writes `agent_info` JSON.
 *
 * The .mjs ops script mirrors this logic inline (it cannot import TS); this module is the
 * canonical, unit-tested source of truth.
 */
import { resolveListingAgentInfo, type ResolvableListingAgent } from "./agent-info-resolver";

export const MALLAN_BROKERAGE_NAME = "Mallan Real Estate Inc.";

export interface RepairAgentIdentity {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Agent identity for an intentional reassignment — includes the Trestle MLS member id. */
export interface ReassignAgentIdentity extends RepairAgentIdentity {
  trestle_mls_id?: string | null;
}

export interface RepairedTypedColumns {
  list_agent_full_name: string | null;
  list_office_name: string | null;
  list_agent_email: string | null;
  list_agent_direct_phone: string | null;
  list_office_mls_id: string | null;
  list_agent_mls_id: string | null;
  co_list_office_mls_id: string | null;
  co_list_agent_mls_id: string | null;
}

export interface RepairDecision {
  skip: boolean;
  reason?: string;
  /** The typed-column write payload (only when `skip` is false). */
  typed?: RepairedTypedColumns;
}

const blank = (v: unknown): boolean => v == null || (typeof v === "string" && v.trim() === "");
const clean = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
};

function agentFullName(agent: RepairAgentIdentity): string | null {
  return (
    clean(agent.full_name) ??
    clean([agent.first_name, agent.last_name].map((p) => (p ?? "").trim()).filter(Boolean).join(" "))
  );
}

/**
 * Decide whether a Mallan-exclusive listing needs repair and, if so, the TYPED-FIRST
 * write payload. `listing` must carry the 8 typed columns (+ optional `agent_info` for
 * fallback). `agent` is the listing's OWN linked Agent row.
 */
export function planExclusiveRepair(
  listing: ResolvableListingAgent,
  agent: RepairAgentIdentity,
  opts: { force?: boolean } = {},
): RepairDecision {
  // Typed-first resolution (typed columns win; agent_info JSON is fallback only).
  const r = resolveListingAgentInfo(listing);

  // Candidate gate: a row whose resolved name is already present is NOT repaired by
  // default — its attribution is intact in the typed columns. `force` overrides.
  if (!opts.force && !blank(r.fullName)) {
    return { skip: true, reason: "typed attribution already present" };
  }

  // Blank-only fill from the Agent row / default brokerage. Existing non-blank resolved
  // values (manual overrides, populated MLS/email) are PRESERVED — never overwritten, never
  // nulled. MLS IDs are not on the Agent row, so they pass through as resolved.
  return {
    skip: false,
    typed: {
      list_agent_full_name: r.fullName ?? agentFullName(agent),
      list_office_name: r.officeName ?? MALLAN_BROKERAGE_NAME,
      list_agent_email: r.agentEmail ?? clean(agent.email),
      list_agent_direct_phone: r.agentDirectPhone ?? clean(agent.phone),
      list_office_mls_id: r.officeMlsId,
      list_agent_mls_id: r.agentMlsId,
      co_list_office_mls_id: r.coListOfficeMlsId,
      co_list_agent_mls_id: r.coListAgentMlsId,
    },
  };
}

/**
 * Plan the typed-column write for an INTENTIONAL reassignment of a Mallan exclusive to a
 * chosen Agent (the set-exclusive-listing-agent ops path). Unlike a repair, this DELIBERATELY
 * overwrites the agent identity (name / email / phone / agent-MLS) from the chosen Agent and
 * stamps the Mallan brokerage. But it must NOT wipe the office / co-list typed MLS IDs just
 * because the retired `agent_info` JSON lacks them — those are resolved TYPED-FIRST and
 * preserved (the Agent row does not define them). `agent_info` is never written. (Codex #420.)
 */
export function planExclusiveReassignment(
  listing: ResolvableListingAgent,
  agent: ReassignAgentIdentity,
): RepairedTypedColumns {
  const r = resolveListingAgentInfo(listing);
  return {
    // Intentionally written from the chosen Agent:
    list_agent_full_name: agentFullName(agent),
    list_office_name: MALLAN_BROKERAGE_NAME,
    list_agent_email: clean(agent.email),
    list_agent_direct_phone: clean(agent.phone),
    // New agent's MLS member id when present, else PRESERVE the existing typed value:
    list_agent_mls_id: clean(agent.trestle_mls_id) ?? r.agentMlsId,
    // Not derivable from the Agent — PRESERVE the existing typed Cotality identity:
    list_office_mls_id: r.officeMlsId,
    co_list_office_mls_id: r.coListOfficeMlsId,
    co_list_agent_mls_id: r.coListAgentMlsId,
  };
}
