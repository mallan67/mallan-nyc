// lib/syndication/eligibility.ts
//
// Mallan Exclusives Syndication — eligibility gate (5-layer, fail-closed).
//
// THIS IS A PURE FUNCTION. NO DB WRITES. NO NETWORK. NO SIDE EFFECTS.
// NO IMPORTS FROM lib/idx/**, lib/search/**, ListingSearchProjection,
// or app/api/listings — those are MLS-display-side surfaces and the
// syndication lane must remain independent of them. A source-regex
// test pin (tests/runtime/syndication-no-idx-imports.test.ts) enforces
// this structurally.
//
// === The 8 invariants (from the v2 plan §C.0) ===
//
//  I.1  Manual listings are NOT automatically eligible.
//  I.2  Trestle listings are NOT automatically excluded.
//  I.3  `source` alone never proves Mallan control.
//  I.4  Free-text brokerage / agent name matching is NEVER sufficient.
//  I.5  If MALLAN_OFFICE_MLS_IDS AND mallanAgentMlsIds are both empty,
//       ALL listings are blocked at Layer 1.
//  I.6  A manual listing may become eligible only when (a) canonical
//       Mallan IDs match the row, OR (b) a broker-approved explicit
//       manual-control verification flag is set on
//       Listing.compliance.mallan_control_verification.
//  I.7  The manual-control verification flag MUST NEVER be auto-created
//       by the audit script (which is read-only / dry-run only).
//  I.8  Ambiguity = block.

/**
 * Structural shape of a listing as the gate cares about it. Avoids a
 * hard dependency on the Prisma type so the function can be tested
 * with plain object fixtures and never needs the @prisma/client import.
 */
export interface ListingForEligibility {
  /** Diagnostic only — NEVER used to drive the eligibility decision. */
  source?: string | null;
  /** Diagnostic only — NEVER used to drive the eligibility decision. */
  agent_id?: bigint | number | null;
  /** Cotality StandardStatus — "Active" / "ComingSoon" / terminal values */
  status?: string | null;
  /** Free-text — used only for diagnostics in Layer 1d's reason logging */
  list_office_name?: string | null;
  /**
   * Phase B (agent_info normalization): the canonical MLS-ID signal is read TYPED-FIRST from
   * these promoted columns, falling back to `agent_info` JSON only where a column is null. Kept
   * inline (no import) to preserve this file's zero-cross-import structural defense.
   */
  list_office_mls_id?: string | null;
  list_agent_mls_id?: string | null;
  co_list_office_mls_id?: string | null;
  co_list_agent_mls_id?: string | null;
  /** Listing-side Trestle identifiers — the canonical signal (JSON fallback) */
  agent_info?: unknown;
  /** Distribution gates (REBNY) */
  idx_display_yn?: boolean | null;
  internet_entire_listing_display_yn?: boolean | null;
  owner_opt_out?: boolean | null;
  participant_only?: boolean | null;
  /** Workflow / authorization state stored as JSON */
  compliance?: unknown;
}

export interface MallanIdentityConfig {
  /** Office-level MLS IDs that count as Mallan as listing brokerage */
  officeMlsIds: ReadonlySet<string>;
  /** Per-agent MLS IDs that count as a Mallan listing agent */
  agentMlsIds: ReadonlySet<string>;
}

type Layer = "layer_1" | "layer_2" | "layer_3";

export type EligibilityVia =
  | "list_office_mls_id_match"
  | "list_agent_mls_id_match"
  | "co_list_authorization"
  | "manual_control_verified"
  | null;

export interface ListingSideControl {
  passes: boolean;
  via: EligibilityVia;
  ambiguity_reasons: string[];
}

export interface MallanSyndicationEligibility {
  eligible: boolean;
  failed_layers: Layer[];
  reasons: string[];
  control: ListingSideControl;
  computed_at: string;
}

// Status set drawn from lib/idx/trestle-mapper.ts but DUPLICATED here
// (not imported) to maintain the no-cross-import structural defense.
// If REBNY adds a status, this list must be updated alongside the
// mapper. Source-regex test enforces no `lib/idx` import.
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "Closed",
  "Sold",
  "Leased",
  "Rented",
  "Withdrawn",
  "Expired",
  "Cancelled",
]);

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function pickString(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Evaluate whether a single listing is eligible for Mallan Exclusives
 * syndication.
 *
 * Pure function. Fail-closed. Source-agnostic.
 *
 * The caller (a future broker-only admin route) is expected to load
 * the identity config once per request via `loadMallanAgentMlsIds()`
 * + the `MALLAN_OFFICE_MLS_IDS` constant, then pass it in. The gate
 * does not perform DB access on its own.
 */
export function evaluateMallanSyndicationEligibility(
  listing: ListingForEligibility,
  config: MallanIdentityConfig,
): MallanSyndicationEligibility {
  const reasons: string[] = [];
  const failedLayers = new Set<Layer>();

  const agentInfo = asRecord(listing.agent_info);
  const compliance = asRecord(listing.compliance);
  const synd = asRecord(compliance.syndication);

  // Phase B: TYPED-FIRST (promoted columns), JSON fallback. Inline to keep the no-import defense.
  const typedFirst = (col: string | null | undefined, jsonKey: string): string =>
    (col ?? "").toString().trim() || pickString(agentInfo, jsonKey);
  const listOfficeMlsId = typedFirst(listing.list_office_mls_id, "ListOfficeMlsId");
  const listAgentMlsId = typedFirst(listing.list_agent_mls_id, "ListAgentMlsId");
  const coListOfficeId = typedFirst(listing.co_list_office_mls_id, "CoListOfficeMlsId");
  const coListAgentId = typedFirst(listing.co_list_agent_mls_id, "CoListAgentMlsId");

  // ════════════════════════════════════════════════════════════════
  // LAYER 1 — Listing-side control via canonical IDs
  // (also: broker-approved manual-control verification, OR
  //  explicit co-list authorization)
  // ════════════════════════════════════════════════════════════════
  let control: ListingSideControl = {
    passes: false,
    via: null,
    ambiguity_reasons: [],
  };

  // ── 1.PRE — Empty-config guard (invariant I.5 — RUNS FIRST) ──
  // If BOTH canonical-identity sets are empty, BLOCK every row
  // unconditionally, BEFORE 1a/1b/1c/1d are evaluated. The
  // broker-approved manual-control verification flag (1d) does NOT
  // bypass this check — see Codex PR #162 review and invariant I.5
  // in docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md.
  //
  // Rationale: if the system does not know what Mallan's office or
  // agent MLS IDs are, the verification flag is a single point of
  // bypass — anyone with write access to `compliance` JSON could
  // mint a passing row. The fail-closed default is: no canonical
  // identity → no eligibility, period.
  const identityConfigEmpty =
    config.officeMlsIds.size === 0 && config.agentMlsIds.size === 0;

  if (identityConfigEmpty) {
    control.ambiguity_reasons.push("identity_config_empty_blocks_all_rows");
    // Skip 1a/1b/1c/1d entirely — control.passes stays false.
  } else {
    // ── 1a — Office-level match (strongest signal) ──
    if (listOfficeMlsId && config.officeMlsIds.has(listOfficeMlsId)) {
      control = {
        passes: true,
        via: "list_office_mls_id_match",
        ambiguity_reasons: [],
      };
    }
    // ── 1b — Agent-level match (secondary) ──
    // Only fires when 1a didn't already pass. If the agent matches
    // Mallan but the office is explicitly set to ANOTHER brokerage,
    // block — ambiguity = block (invariant I.8).
    else if (listAgentMlsId && config.agentMlsIds.has(listAgentMlsId)) {
      if (listOfficeMlsId && !config.officeMlsIds.has(listOfficeMlsId)) {
        control.ambiguity_reasons.push(
          "agent_match_but_office_is_other_brokerage",
        );
      } else {
        control = {
          passes: true,
          via: "list_agent_mls_id_match",
          ambiguity_reasons: [],
        };
      }
    }
    // ── 1c — Co-list scenarios — default block unless explicit URL ──
    else if (
      (coListOfficeId && config.officeMlsIds.has(coListOfficeId)) ||
      (coListAgentId && config.agentMlsIds.has(coListAgentId))
    ) {
      const coListAuth = synd.co_list_authorization_url;
      if (typeof coListAuth === "string" && coListAuth.trim() !== "") {
        control = {
          passes: true,
          via: "co_list_authorization",
          ambiguity_reasons: [],
        };
      } else {
        control.ambiguity_reasons.push(
          "co_list_match_but_no_co_list_authorization_doc",
        );
      }
    }
    // ── 1d — Broker-approved manual-control verification flag ──
    // The ONLY path that passes when no canonical Trestle IDs match
    // on the row. Pre-requisite enforced ABOVE by 1.PRE: at least one
    // canonical-identity config set must be non-empty for this branch
    // to be reachable at all.
    //
    // The flag itself is set by an explicit broker action in the
    // admin UI (future PR). It is NEVER auto-created by the audit
    // script (invariant I.7).
    //
    // Partial flag = block (invariant I.6). All three of verified_by,
    // verified_at, and verification_note must be non-empty strings.
    else {
      const verification = asRecord(compliance.mallan_control_verification);
      const verifiedBy = pickString(verification, "verified_by");
      const verifiedAt = pickString(verification, "verified_at");
      const verificationNote = pickString(verification, "verification_note");
      if (verifiedBy && verifiedAt && verificationNote) {
        control = {
          passes: true,
          via: "manual_control_verified",
          ambiguity_reasons: [],
        };
      }
    }
  }

  // ── 1e — Ambiguity / conflicts catch-all ──
  // If a Trestle agent ID matched Mallan but the office is another
  // brokerage, record the ambiguity even if 1a/1b/1c/1d already
  // failed. Diagnostic / audit aid. Skipped when identity-config is
  // empty (1.PRE already blocked).
  if (
    !identityConfigEmpty &&
    listOfficeMlsId &&
    listAgentMlsId &&
    config.officeMlsIds.has(listOfficeMlsId) === false &&
    config.agentMlsIds.has(listAgentMlsId) === true
  ) {
    control.ambiguity_reasons.push(
      "agent_says_mallan_office_says_other_brokerage",
    );
  }

  if (!control.passes) {
    failedLayers.add("layer_1");
    const amb = control.ambiguity_reasons.join("|") || "none";
    reasons.push(`listing_side_control_failed (via=${control.via}; ambiguities=${amb})`);
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 2 — Syndication authorization
  // Broker approval + seller advertising authorization + media rights
  // + brokerage attribution. All four required; defaults to false.
  // ════════════════════════════════════════════════════════════════

  if (synd.approval_status !== "approved") {
    reasons.push("broker_approval_missing");
    failedLayers.add("layer_2");
  }
  if (typeof synd.approved_at !== "string" || typeof synd.approved_by !== "string") {
    reasons.push("broker_approval_signature_missing");
    failedLayers.add("layer_2");
  }
  if (
    typeof synd.expires_at === "string" &&
    Number.isFinite(Date.parse(synd.expires_at)) &&
    new Date(synd.expires_at) < new Date()
  ) {
    reasons.push("broker_approval_expired");
    failedLayers.add("layer_2");
  }

  // Seller / owner advertising authorization
  const seller = asRecord(compliance.seller_advertising_authorization);
  if (typeof seller.signed_at !== "string" || typeof seller.scope !== "string") {
    reasons.push("seller_advertising_authorization_missing");
    failedLayers.add("layer_2");
  }

  // Media rights
  const mediaRights = asRecord(compliance.media_rights);
  if (typeof mediaRights.confirmed_at !== "string") {
    reasons.push("media_rights_not_confirmed");
    failedLayers.add("layer_2");
  }
  if (mediaRights.source === "trestle_co_brokerage") {
    reasons.push("media_rights_belong_to_other_brokerage");
    failedLayers.add("layer_2");
  }

  // Brokerage attribution (NY DOS §175.25)
  const listOfficeName = (listing.list_office_name ?? "").toString().trim();
  const agentInfoOfficeName = pickString(agentInfo, "ListOfficeName");
  if (!listOfficeName && !agentInfoOfficeName) {
    reasons.push("brokerage_attribution_missing");
    failedLayers.add("layer_2");
  }

  // ════════════════════════════════════════════════════════════════
  // LAYER 3 — REBNY / RLS safety
  // owner_opt_out, participant_only, internet display flags, status
  // ════════════════════════════════════════════════════════════════

  if (listing.owner_opt_out === true) {
    reasons.push("owner_opt_out_true");
    failedLayers.add("layer_3");
  }
  if (listing.participant_only === true) {
    reasons.push("participant_only_true");
    failedLayers.add("layer_3");
  }
  if (listing.internet_entire_listing_display_yn === false) {
    reasons.push("internet_entire_display_false");
    failedLayers.add("layer_3");
  }
  if (listing.idx_display_yn === false) {
    reasons.push("idx_display_yn_false");
    failedLayers.add("layer_3");
  }

  const status = (listing.status ?? "").toString().trim();
  if (TERMINAL_STATUSES.has(status)) {
    reasons.push(`status_terminal (${status})`);
    failedLayers.add("layer_3");
  } else if (status !== "Active" && status !== "ComingSoon") {
    reasons.push(`status_not_distributable (${status || "missing"})`);
    failedLayers.add("layer_3");
  }

  return {
    eligible: failedLayers.size === 0,
    failed_layers: Array.from(failedLayers),
    reasons,
    control,
    computed_at: new Date().toISOString(),
  };
}
