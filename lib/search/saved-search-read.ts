/**
 * Saved Search read-side helpers shared by the CRM saved-search routes (Packet 2).
 * The stored contract and its resolution live in lib/search/canonical/saved-search.ts;
 * the count comes from the Search executor — the same membership as live Search and alerts.
 */
import { hasCredentials } from "@/lib/idx/auth";
import type { ResolvedSavedSearch } from "@/lib/search/engine/saved-search";
import { countSearch } from "@/lib/search/engine/executor";

export const CRITERIA_CONTRACT_ERROR =
  "criteria must be the executed Search parameters: { criteria_version: 2, params: { type, status, minPrice, ... } }";

export type SavedSearchCountStatus = "stored" | "never_run" | "invalid_criteria";

export interface SavedSearchRowLike {
  id: bigint; agent_id: bigint | null; lead_id: bigint | null; name: string; criteria: unknown;
  last_run: Date | null; result_count: number | null; alert_frequency: string | null; alert_enabled: boolean;
  last_alert_sent: Date | null; alert_email: string | null; created_at: Date; updated_at: Date;
}

/** The shared read-side shape of one saved search row. */
export function serializeSavedSearch(s: SavedSearchRowLike, resolved: ResolvedSavedSearch) {
  const countStatus: SavedSearchCountStatus = resolved.state === "invalid" ? "invalid_criteria" : s.last_run ? "stored" : "never_run";
  return {
    id: s.id.toString(),
    agent_id: s.agent_id?.toString() ?? null,
    lead_id: s.lead_id?.toString() ?? null,
    name: s.name,
    criteria: s.criteria,
    criteria_state: resolved.state,
    executable_params: resolved.state === "invalid" ? null : resolved.params,
    migration_notes: resolved.state === "migrated" ? resolved.mapped : null,
    invalid_reasons: resolved.state === "invalid" ? resolved.reasons : null,
    invalid_criteria: resolved.state === "invalid" ? true : null,
    last_run: s.last_run,
    result_count: s.result_count ?? null,
    count_status: countStatus,
    alert_frequency: s.alert_frequency ?? null,
    alert_enabled: s.alert_enabled ?? false,
    last_alert_sent: s.last_alert_sent,
    alert_email: s.alert_email,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

/** Stamp a count from the executor. Reported when the provider is unavailable — never faked. */
export async function stampedCount(resolved: ResolvedSavedSearch): Promise<{ result_count: number | null; last_run: Date | null; count_status: "stored" | "unavailable"; detail?: string }> {
  if (resolved.state === "invalid") return { result_count: null, last_run: null, count_status: "unavailable", detail: "invalid criteria" };
  if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) return { result_count: null, last_run: null, count_status: "unavailable", detail: "IDX not enabled" };
  try {
    const c = await countSearch(resolved.criteria);
    return { result_count: c.total, last_run: new Date(), count_status: "stored" };
  } catch (err) {
    return { result_count: null, last_run: null, count_status: "unavailable", detail: err instanceof Error ? err.message : String(err) };
  }
}
