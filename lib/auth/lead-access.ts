// ONE canonical decision: may this Client (Lead) reach the portal?
//
// SCOPE — deliberately one token, deliberately not a lifecycle model.
// This answers exactly one question: does the explicit string "inactive" on Lead.status revoke portal
// access? It answers "no access" for that token and "access" for everything else, and it does NOT claim
// every other value is a valid or intended status.
//
// Why so narrow. The Lane 3A census (2026-09-16) proved Lead.status is free text with NO allowlist: two
// caller-controlled writers persist any string (app/api/crm/clients/[id]/route.ts:236,
// lib/lead-distribution/assign.ts:68), and the read-only production census
// — SELECT status, pipeline_stage, COUNT(*) FROM leads GROUP BY 1,2 — has been REFUSED twice by the
// permission classifier and is still owed. Until the stored distribution is known, inferring behaviour
// for "closed", "past" or any other value would be encoding a guess about production data as an access
// control. "closed" in particular is NOT treated as inactive here: the census showed status,
// pipeline_stage, transaction completion, portal access and retention have already been conflated in
// several places, and the point of this lane is to untangle them rather than add another assumption.
//
// WHAT THIS IS NOT:
//   - not pipeline_stage — that is business workflow state and has its own (separate, broken) contract,
//     registered as LANE 3A — PIPELINE STAGE CONTRACT CONVERGENCE;
//   - not archive eligibility — retention/archive is Lane 3B and remains held;
//   - not a declaration that every non-"inactive" value is valid;
//   - not a general authorization helper. Callers still perform their own authn/authz; this only adds a
//     lifecycle veto on top.
//
// WHY A HELPER RATHER THAN AN INLINE CHECK. The same decision is needed at six independent doors (login,
// session validation, forgot-password, reset-password, invite issuance, invite acceptance) and will be
// needed again by Safety Packet 2 for automated sends. Six copies of `status === "inactive"` is how the
// next door gets missed — which is exactly how this defect existed: app/api/auth/login/route.ts:58
// already gated AGENTS on `agent.status !== "active"`, seventy-five lines above a lead branch that
// checked nothing.

/** The one token this packet reacts to. Widening this set is a separate, evidence-backed decision. */
const PORTAL_ACCESS_REVOKED_STATUS = "inactive";

/**
 * Normalize only for harmless transport variation — surrounding whitespace and casing.
 * This is NOT a vocabulary normalizer: it maps nothing onto anything, it just prevents " Inactive "
 * from reading as a different state than "inactive".
 */
function normalizeStatusToken(status: unknown): string {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

/**
 * Is this Lead.status value explicitly the revoked one?
 * A null/undefined/absent status is NOT inactive — absence is not deactivation.
 */
export function isLeadExplicitlyInactive(status: unknown): boolean {
  return normalizeStatusToken(status) === PORTAL_ACCESS_REVOKED_STATUS;
}

/**
 * May a Lead with this status use the client portal?
 *
 * ACCESS decision only. Fail-OPEN by design for unknown values, and that is deliberate: the stored
 * vocabulary is unknown, so refusing everything unrecognized would lock out real clients whose status is
 * some historical token. The veto is narrow and explicit until the stored census lands.
 */
export function isLeadPortalAccessAllowed(status: unknown): boolean {
  return !isLeadExplicitlyInactive(status);
}

/** The refusal an operator or client should see. Kept here so all six doors say the same thing. */
export const LEAD_PORTAL_ACCESS_REVOKED =
  "This client account is inactive. Portal access has been disabled — contact your agent to reactivate it.";
