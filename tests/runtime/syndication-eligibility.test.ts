/// <reference types="jest" />
/**
 * Syndication eligibility — pure-function tests.
 *
 * Covers the 16 cases from the Syndication Plan v2 §I.1 (test matrix
 * updated 2026-05-18 after Codex feedback on PR #161 removed the
 * unsafe `source='manual' + agent_id` fallback).
 *
 * Pure function, no DB, no mocks needed beyond the structural shape.
 */

import {
  evaluateMallanSyndicationEligibility,
  type ListingForEligibility,
  type MallanIdentityConfig,
} from "@/lib/syndication/eligibility";

const MALLAN_OFFICE = "39361"; // hypothetical Mallan Trestle ListOfficeMlsId
const MALLAN_AGENT_A = "AG-MAYA-001";
const MALLAN_AGENT_B = "AG-OTHER-MALLAN-002";
const OTHER_BROKERAGE = "OTHER-OFFICE-12345";
const OTHER_AGENT = "OTHER-AGENT-99999";

function configEmpty(): MallanIdentityConfig {
  return {
    officeMlsIds: new Set<string>(),
    agentMlsIds: new Set<string>(),
  };
}

function configFull(): MallanIdentityConfig {
  return {
    officeMlsIds: new Set([MALLAN_OFFICE]),
    agentMlsIds: new Set([MALLAN_AGENT_A, MALLAN_AGENT_B]),
  };
}

// A row that passes Layers 2 + 3 entirely. Layer 1 is then varied per test.
function fullyApprovedRow(
  overrides: Partial<ListingForEligibility> = {},
): ListingForEligibility {
  return {
    source: "trestle",
    status: "Active",
    list_office_name: "",
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    agent_info: {
      ListOfficeMlsId: MALLAN_OFFICE,
      ListOfficeName: "Mallan Real Estate Inc.",
      ListAgentMlsId: MALLAN_AGENT_A,
      ListAgentFullName: "Maya Allan",
    },
    compliance: {
      syndication: {
        approval_status: "approved",
        approved_at: "2026-05-18T10:00:00Z",
        approved_by: "1",
      },
      seller_advertising_authorization: {
        signed_at: "2026-05-18T09:00:00Z",
        scope: "mallan_owned_only",
      },
      media_rights: {
        confirmed_at: "2026-05-18T09:00:00Z",
        source: "owner_release",
      },
    },
    ...overrides,
  };
}

describe("Mallan syndication eligibility — listing-side control", () => {
  // ── Case 13 from §I.1 — empty identity config blocks every row ──
  it("blocks every row when both office and agent ID sets are empty", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow(),
      configEmpty(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_1");
    expect(r.control.ambiguity_reasons).toContain(
      "identity_config_empty_blocks_all_rows",
    );
  });

  // ── Case 1 — Mallan-listed Trestle row passes Layer 1a ──
  it("eligible when ListOfficeMlsId matches Mallan and other layers pass", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow(),
      configFull(),
    );
    expect(r.eligible).toBe(true);
    expect(r.control.via).toBe("list_office_mls_id_match");
    expect(r.failed_layers).toEqual([]);
  });

  // ── Case 2 — Non-Mallan Trestle row blocked at Layer 1 ──
  it("blocks a non-Mallan Trestle row (other brokerage as ListOfficeMlsId)", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        agent_info: {
          ListOfficeMlsId: OTHER_BROKERAGE,
          ListAgentMlsId: OTHER_AGENT,
          ListOfficeName: "Other Brokerage LLC",
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_1");
    expect(r.control.via).toBe(null);
  });

  // ── Case 3 — early-v2 fallback (manual + agent_id + "mallan" text) ──
  // BLOCKED in corrected v2; this is the regression test for the
  // Codex-feedback fix.
  it("blocks a manual listing with agent_id and 'Mallan' text when no canonical IDs and no verification flag", () => {
    const r = evaluateMallanSyndicationEligibility(
      {
        source: "manual",
        status: "Active",
        list_office_name: "Mallan Real Estate Inc.",
        agent_id: 42 as unknown as bigint,
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: false,
        agent_info: {}, // no canonical IDs
        compliance: {
          // approvals are fine; the gate must still block at Layer 1
          syndication: {
            approval_status: "approved",
            approved_at: "2026-05-18T10:00:00Z",
            approved_by: "1",
          },
          seller_advertising_authorization: {
            signed_at: "2026-05-18T09:00:00Z",
            scope: "mallan_owned_only",
          },
          media_rights: {
            confirmed_at: "2026-05-18T09:00:00Z",
            source: "owner_release",
          },
        },
      },
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_1");
    expect(r.control.via).toBe(null);
  });

  // ── Case 4 — agent matches but office is another brokerage = block ──
  it("blocks when ListAgentMlsId matches Mallan but ListOfficeMlsId is another brokerage (ambiguity)", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        agent_info: {
          ListOfficeMlsId: OTHER_BROKERAGE,
          ListAgentMlsId: MALLAN_AGENT_A,
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_1");
    expect(r.control.ambiguity_reasons.join("|")).toContain(
      "agent_match_but_office_is_other_brokerage",
    );
  });

  // ── Case 5 — completely missing IDs = block ──
  it("blocks when both ListOfficeMlsId and ListAgentMlsId are empty on a Trestle row", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        source: "trestle",
        agent_info: {}, // empty
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_1");
  });

  // ── Case 12 — manual + agent_id + empty config = block ──
  it("blocks manual + agent_id when both config sets are empty AND no verification flag", () => {
    const r = evaluateMallanSyndicationEligibility(
      {
        source: "manual",
        status: "Active",
        agent_id: 7 as unknown as bigint,
        list_office_name: "Mallan Real Estate Inc.",
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: false,
        agent_info: {},
        compliance: {
          syndication: {
            approval_status: "approved",
            approved_at: "2026-05-18T10:00:00Z",
            approved_by: "1",
          },
          seller_advertising_authorization: {
            signed_at: "2026-05-18T09:00:00Z",
            scope: "mallan_owned_only",
          },
          media_rights: {
            confirmed_at: "2026-05-18T09:00:00Z",
            source: "owner_release",
          },
        },
      },
      configEmpty(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_1");
    expect(r.control.ambiguity_reasons).toContain(
      "identity_config_empty_blocks_all_rows",
    );
  });

  // ── Case 14 — free-text only (Mallan name) without canonical IDs = block ──
  it("blocks when only free-text 'Mallan Real Estate' name is present (no canonical IDs, no verification flag)", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        source: "trestle",
        list_office_name: "Mallan Real Estate Inc.",
        agent_info: {
          ListOfficeName: "Mallan Real Estate Inc.",
          // No ListOfficeMlsId, no ListAgentMlsId
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_1");
    expect(r.control.via).toBe(null);
  });

  // ── Case 15 — broker-approved manual-control flag PASSES ──
  it("eligible when the broker-approved manual-control verification flag is present and all other layers pass", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        source: "manual",
        agent_id: 1 as unknown as bigint,
        agent_info: {}, // no canonical IDs
        list_office_name: "Mallan Real Estate Inc.", // attribution for Layer 2
        compliance: {
          syndication: {
            approval_status: "approved",
            approved_at: "2026-05-18T10:00:00Z",
            approved_by: "1",
          },
          seller_advertising_authorization: {
            signed_at: "2026-05-18T09:00:00Z",
            scope: "mallan_owned_only",
          },
          media_rights: {
            confirmed_at: "2026-05-18T09:00:00Z",
            source: "owner_release",
          },
          mallan_control_verification: {
            verified_by: "1",
            verified_at: "2026-05-18T11:00:00Z",
            verification_note:
              "Mallan-owned exclusive — verified against signed listing agreement on file",
          },
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(true);
    expect(r.control.via).toBe("manual_control_verified");
    expect(r.failed_layers).toEqual([]);
  });

  // ── Case 16 — partial manual-control flag is NOT a flag = block ──
  it("blocks when the manual-control verification flag is partial (missing verification_note)", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        source: "manual",
        agent_info: {},
        list_office_name: "Mallan Real Estate Inc.",
        compliance: {
          syndication: {
            approval_status: "approved",
            approved_at: "2026-05-18T10:00:00Z",
            approved_by: "1",
          },
          seller_advertising_authorization: {
            signed_at: "2026-05-18T09:00:00Z",
            scope: "mallan_owned_only",
          },
          media_rights: {
            confirmed_at: "2026-05-18T09:00:00Z",
            source: "owner_release",
          },
          mallan_control_verification: {
            verified_by: "1",
            verified_at: "2026-05-18T11:00:00Z",
            // verification_note intentionally missing
          },
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_1");
  });

  // ── Co-list path ──
  it("blocks co-list rows (Mallan is CoListAgent) without a co_list_authorization_url", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        agent_info: {
          ListOfficeMlsId: OTHER_BROKERAGE,
          ListAgentMlsId: OTHER_AGENT,
          CoListAgentMlsId: MALLAN_AGENT_A,
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.control.ambiguity_reasons).toContain(
      "co_list_match_but_no_co_list_authorization_doc",
    );
  });

  it("eligible on co-list when co_list_authorization_url is present and Mallan is the co-list side", () => {
    const r = evaluateMallanSyndicationEligibility(
      {
        source: "trestle",
        status: "Active",
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        owner_opt_out: false,
        list_office_name: "Mallan Real Estate Inc.",
        agent_info: {
          ListOfficeMlsId: OTHER_BROKERAGE,
          ListAgentMlsId: OTHER_AGENT,
          CoListAgentMlsId: MALLAN_AGENT_A,
          ListOfficeName: "Other Brokerage LLC",
        },
        compliance: {
          syndication: {
            approval_status: "approved",
            approved_at: "2026-05-18T10:00:00Z",
            approved_by: "1",
            co_list_authorization_url: "https://docs.mallan.nyc/co-list-12345.pdf",
          },
          seller_advertising_authorization: {
            signed_at: "2026-05-18T09:00:00Z",
            scope: "mallan_plus_authorized_partners",
          },
          media_rights: {
            confirmed_at: "2026-05-18T09:00:00Z",
            source: "owner_release",
          },
        },
      },
      configFull(),
    );
    expect(r.eligible).toBe(true);
    expect(r.control.via).toBe("co_list_authorization");
  });
});

describe("Mallan syndication eligibility — Layer 2 (authorization)", () => {
  it("blocks when broker approval_status is not 'approved'", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        compliance: {
          syndication: {
            approval_status: "pending",
          },
          seller_advertising_authorization: {
            signed_at: "2026-05-18T09:00:00Z",
            scope: "mallan_owned_only",
          },
          media_rights: {
            confirmed_at: "2026-05-18T09:00:00Z",
            source: "owner_release",
          },
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_2");
    expect(r.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("broker_approval_missing")]),
    );
  });

  it("blocks when seller_advertising_authorization is missing", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        compliance: {
          syndication: {
            approval_status: "approved",
            approved_at: "2026-05-18T10:00:00Z",
            approved_by: "1",
          },
          // seller_advertising_authorization intentionally missing
          media_rights: {
            confirmed_at: "2026-05-18T09:00:00Z",
            source: "owner_release",
          },
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_2");
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("seller_advertising_authorization_missing"),
      ]),
    );
  });

  it("blocks when media_rights.confirmed_at is missing", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        compliance: {
          syndication: {
            approval_status: "approved",
            approved_at: "2026-05-18T10:00:00Z",
            approved_by: "1",
          },
          seller_advertising_authorization: {
            signed_at: "2026-05-18T09:00:00Z",
            scope: "mallan_owned_only",
          },
          // media_rights intentionally missing
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_2");
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("media_rights_not_confirmed"),
      ]),
    );
  });

  it("blocks when media_rights.source = trestle_co_brokerage (rights belong to another brokerage)", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        compliance: {
          syndication: {
            approval_status: "approved",
            approved_at: "2026-05-18T10:00:00Z",
            approved_by: "1",
          },
          seller_advertising_authorization: {
            signed_at: "2026-05-18T09:00:00Z",
            scope: "mallan_owned_only",
          },
          media_rights: {
            confirmed_at: "2026-05-18T09:00:00Z",
            source: "trestle_co_brokerage",
          },
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("media_rights_belong_to_other_brokerage"),
      ]),
    );
  });

  it("blocks when no brokerage attribution is present", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({
        list_office_name: "",
        agent_info: {
          ListOfficeMlsId: MALLAN_OFFICE,
          ListAgentMlsId: MALLAN_AGENT_A,
          // ListOfficeName intentionally missing
        },
      }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("brokerage_attribution_missing"),
      ]),
    );
  });
});

describe("Mallan syndication eligibility — Layer 3 (REBNY safety)", () => {
  it("blocks owner_opt_out=true", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({ owner_opt_out: true }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_3");
  });

  it("blocks participant_only=true", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({ participant_only: true }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_3");
  });

  it("blocks internet_entire_listing_display_yn=false", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({ internet_entire_listing_display_yn: false }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_3");
  });

  it("blocks idx_display_yn=false", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({ idx_display_yn: false }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_3");
  });

  it("blocks terminal status (Closed)", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({ status: "Closed" }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_3");
    expect(r.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("status_terminal")]),
    );
  });

  it("blocks status that is neither Active nor ComingSoon", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow({ status: "Pending" }),
      configFull(),
    );
    expect(r.eligible).toBe(false);
    expect(r.failed_layers).toContain("layer_3");
    expect(r.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("status_not_distributable")]),
    );
  });
});

describe("Mallan syndication eligibility — output shape (no internal field leakage)", () => {
  // The eligibility function returns ONLY booleans, strings, and the
  // computed_at timestamp. raw_data, internal compliance keys, owner
  // PII — none of them appear in the output structure.
  it("output does not contain raw_data, agent_info, owner_client_id, or internal compliance keys", () => {
    const r = evaluateMallanSyndicationEligibility(
      fullyApprovedRow(),
      configFull(),
    );
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/raw_data/);
    expect(serialized).not.toMatch(/agent_info/);
    expect(serialized).not.toMatch(/owner_client_id/);
    expect(serialized).not.toMatch(/PrivateRemarks/);
    expect(serialized).not.toMatch(/ShowingInstructions/);
    expect(serialized).not.toMatch(/last_synced_from_trestle/);
  });
});
