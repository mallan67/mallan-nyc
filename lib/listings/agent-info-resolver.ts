/**
 * READER-side resolver for the agent_info normalization (spec #410 §3, plan #411 Phase B,
 * board #415 Lane 1).
 *
 * `resolveListingAgentInfo` reads the 8 agent attribution values TYPED-FIRST, falling back to the
 * `agent_info` JSON only where the typed column is null. This is the single seam every READER moves
 * to in Phase B, so:
 *   - after A6 backfill (#416), the typed columns are populated and win;
 *   - any row not yet typed (edge cases) still resolves from JSON — no behavior regression;
 *   - flipping to typed-only later (Phase D, after the JSON is dropped) is a one-line change here.
 *
 * PII boundary (spec §4) is UNCHANGED by this resolver: it only SOURCES values. Exposure stays
 * gated by the existing DTO / portal-mask layer — `agentEmail`/`agentDirectPhone` are PRIVATE and
 * must never be emitted on a public DTO by default (only the gated exclusive contact card + CRM).
 *
 * This is the READER counterpart to the WRITER seam `typedAgentColumnsFromJson` (which maps JSON →
 * typed columns for producers). The resolver reuses it for the JSON-fallback half so the two stay
 * in lock-step (same key shapes: PascalCase + the lowercase ensure-listing shape).
 */
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";

/** A listing shape carrying the typed columns + the agent_info JSON (any extra fields ignored). */
export interface ResolvableListingAgent {
  list_agent_full_name?: string | null;
  list_office_name?: string | null;
  list_agent_email?: string | null;
  list_agent_direct_phone?: string | null;
  list_office_mls_id?: string | null;
  list_agent_mls_id?: string | null;
  co_list_office_mls_id?: string | null;
  co_list_agent_mls_id?: string | null;
  agent_info?: Record<string, unknown> | null;
}

export interface ResolvedAgentInfo {
  fullName: string | null; // public-safe
  officeName: string | null; // public-safe
  agentEmail: string | null; // PRIVATE — gated by the read/DTO layer
  agentDirectPhone: string | null; // PRIVATE — gated by the read/DTO layer
  officeMlsId: string | null; // syndication gate
  agentMlsId: string | null; // syndication gate
  coListOfficeMlsId: string | null; // syndication gate
  coListAgentMlsId: string | null; // syndication gate
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * Typed-column-first resolution of the 8 agent attribution values, with JSON fallback only where
 * the typed column is null/empty. Never throws; tolerates a null/undefined listing.
 */
export function resolveListingAgentInfo(listing: ResolvableListingAgent | null | undefined): ResolvedAgentInfo {
  const l = listing ?? {};
  const json = typedAgentColumnsFromJson(l.agent_info as Record<string, unknown>);
  const pick = (typed: string | null | undefined, jsonVal: string | null): string | null =>
    clean(typed) ?? jsonVal;
  return {
    fullName: pick(l.list_agent_full_name, json.list_agent_full_name),
    officeName: pick(l.list_office_name, json.list_office_name),
    agentEmail: pick(l.list_agent_email, json.list_agent_email),
    agentDirectPhone: pick(l.list_agent_direct_phone, json.list_agent_direct_phone),
    officeMlsId: pick(l.list_office_mls_id, json.list_office_mls_id),
    agentMlsId: pick(l.list_agent_mls_id, json.list_agent_mls_id),
    coListOfficeMlsId: pick(l.co_list_office_mls_id, json.co_list_office_mls_id),
    coListAgentMlsId: pick(l.co_list_agent_mls_id, json.co_list_agent_mls_id),
  };
}

/** The typed-column select fields a reader must include so the resolver can prefer them. */
export const AGENT_TYPED_SELECT = {
  list_agent_full_name: true,
  list_office_name: true,
  list_agent_email: true,
  list_agent_direct_phone: true,
  list_office_mls_id: true,
  list_agent_mls_id: true,
  co_list_office_mls_id: true,
  co_list_agent_mls_id: true,
} as const;
