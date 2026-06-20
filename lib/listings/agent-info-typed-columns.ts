/**
 * Producer-side seam for the agent_info normalization (spec #410, plan #411, Phase A).
 *
 * `typedAgentColumnsFromJson` derives the 8 typed agent columns (added in A1) from a
 * RESO-shaped `agent_info` JSON object. Every WRITER (Trestle mapper, idx-sync, CRM
 * POST/PATCH, reset-sync, ensure-listing, exclusive-agent-assignment, ops scripts)
 * uses this single function so the typed columns and the JSON stay in lock-step
 * (same source, two destinations) — this is the "dual-write" invariant.
 *
 * Handles BOTH key shapes that exist in production data:
 *   - PascalCase RESO keys (Trestle/CRM rows): ListAgentFullName, ListOfficeName, …
 *   - the lowercase manual shape written by app/api/idx/ensure-listing/route.ts:
 *     { name, email, phone, company }
 *
 * PII NOTE (spec §4): list_agent_email + list_agent_direct_phone are PRIVATE/internal.
 * Putting them in typed columns does NOT expose them — the DTO/portal-mask READ layer
 * still gates exposure (office/name public; agent PII only on the exclusive card + CRM;
 * portal fail-closed). This module is producer-side only; it changes no reader.
 *
 * This is the WRITER counterpart to the (Phase B) reader resolver. It does NOT read DB
 * rows or pick "typed-first" — it only maps a source JSON to the typed-column shape.
 */

export interface TypedAgentColumns {
  list_agent_full_name: string | null;
  list_office_name: string | null;
  list_agent_email: string | null;
  list_agent_direct_phone: string | null;
  list_office_mls_id: string | null;
  list_agent_mls_id: string | null;
  co_list_office_mls_id: string | null;
  co_list_agent_mls_id: string | null;
}

function cleanStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * Map a RESO-shaped `agent_info` JSON to the 8 typed columns.
 * Empty strings and missing keys both become `null` (nullable columns, no empty strings).
 */
export function typedAgentColumnsFromJson(
  agentInfo: Record<string, unknown> | null | undefined,
): TypedAgentColumns {
  const ai = (agentInfo ?? {}) as Record<string, unknown>;
  return {
    // PascalCase first, then the lowercase ensure-listing shape as fallback.
    list_agent_full_name: cleanStr(ai.ListAgentFullName ?? ai.name),
    list_office_name: cleanStr(ai.ListOfficeName ?? ai.company),
    list_agent_email: cleanStr(ai.ListAgentEmail ?? ai.email),
    list_agent_direct_phone: cleanStr(ai.ListAgentDirectPhone ?? ai.phone),
    list_office_mls_id: cleanStr(ai.ListOfficeMlsId),
    list_agent_mls_id: cleanStr(ai.ListAgentMlsId),
    co_list_office_mls_id: cleanStr(ai.CoListOfficeMlsId),
    co_list_agent_mls_id: cleanStr(ai.CoListAgentMlsId),
  };
}
