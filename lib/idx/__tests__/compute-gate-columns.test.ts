/// <reference types="jest" />
/**
 * Phase A unit tests — `computeGateColumns` helper.
 *
 * Locks the contract that every writer of the 5 display-gate columns on
 * `listings` must respect. If a future refactor changes the helper's
 * semantics, these tests must be updated in the same PR and the change
 * justified — drift between the helper and the data-retention cron predicate
 * at app/api/cron/data-retention/route.ts:79 reopens the H1 ping-pong gap.
 *
 * Coverage:
 *   - Terminal-status guard forces idx_display_yn=false for every terminal value
 *   - Status normalization (case, whitespace, alias) reaches the terminal guard
 *   - IDX Plus pre-filter semantics on InternetEntireListing / InternetAddress
 *   - Fail-closed on AVM + ConsumerComment via affirmPermission
 *   - Owner opt-out + participant-only override idx_display_yn=false
 *   - Defensive default for unknown / null status (Active)
 */

import {
  computeGateColumns,
  TERMINAL_STATUSES,
  type ComputeGateColumnsResult,
} from "@/lib/idx/trestle-mapper";

function expectAllFlags(
  result: ComputeGateColumnsResult,
  expected: Partial<ComputeGateColumnsResult>,
): void {
  for (const key of Object.keys(expected) as (keyof ComputeGateColumnsResult)[]) {
    expect(result[key]).toEqual(expected[key]);
  }
}

describe("computeGateColumns — terminal-status guard", () => {
  it("forces idx_display_yn=false for every TERMINAL_STATUSES value", () => {
    for (const terminal of TERMINAL_STATUSES) {
      const result = computeGateColumns({
        status: terminal,
        internetEntireListingDisplayYN: true,
        internetAddressDisplayYN: true,
        participantOnly: false,
        ownerOptOut: false,
      });
      expect(result.is_terminal).toBe(true);
      // NOT `toBe(terminal)`. One member of the set is deliberately rewritten:
      // the legacy `Cancelled` normalizes to the live Cotality value `Canceled`.
      // It stays IN the set so untouched rows keep gating (no backfill is in
      // scope), but it is not what the normalizer emits. What has to hold for
      // every member is that normalization lands on something still terminal.
      expect(TERMINAL_STATUSES.has(result.normalized_status)).toBe(true);
      expect(result.idx_display_yn).toBe(false);
      // Other gate columns are independent of terminal status.
      expect(result.internet_entire_listing_display_yn).toBe(true);
      expect(result.internet_address_display_yn).toBe(true);
    }
  });

  it("permits idx_display_yn=true on Active when all permissions allow", () => {
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
      internetAddressDisplayYN: true,
      internetAutomatedValuationDisplayYN: true,
      internetConsumerCommentYN: true,
      participantOnly: false,
      ownerOptOut: false,
    });
    expectAllFlags(result, {
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      internet_automated_valuation_display_yn: true,
      internet_consumer_comment_yn: true,
      normalized_status: "Active",
      is_terminal: false,
    });
  });

  it("permits idx_display_yn=true on ActiveUnderContract", () => {
    const result = computeGateColumns({
      status: "ActiveUnderContract",
      internetEntireListingDisplayYN: true,
    });
    expect(result.idx_display_yn).toBe(true);
    expect(result.normalized_status).toBe("ActiveUnderContract");
  });

  it("permits idx_display_yn=true on ComingSoon", () => {
    const result = computeGateColumns({
      status: "ComingSoon",
      internetEntireListingDisplayYN: true,
    });
    expect(result.idx_display_yn).toBe(true);
    expect(result.normalized_status).toBe("ComingSoon");
  });
});

describe("computeGateColumns — status normalization reaches the guard", () => {
  it("accepts lowercase terminal status and blocks idx_display_yn", () => {
    const result = computeGateColumns({
      status: "closed",
      internetEntireListingDisplayYN: true,
    });
    expect(result.normalized_status).toBe("Closed");
    expect(result.is_terminal).toBe(true);
    expect(result.idx_display_yn).toBe(false);
  });

  it("accepts whitespace-padded terminal status and blocks idx_display_yn", () => {
    const result = computeGateColumns({
      status: "  Withdrawn  ",
      internetEntireListingDisplayYN: true,
    });
    expect(result.normalized_status).toBe("Withdrawn");
    expect(result.idx_display_yn).toBe(false);
  });

  it("accepts the legacy alias (Cancelled → Canceled) and blocks", () => {
    // The arrow used to point the other way. `Canceled` — one L — is the live
    // Cotality Property.StandardStatus value; `Cancelled` is the one Mallan
    // invented. The normalizer now converges on the provider.
    const result = computeGateColumns({
      status: "cancelled",
      internetEntireListingDisplayYN: true,
    });
    expect(result.normalized_status).toBe("Canceled");
    expect(result.idx_display_yn).toBe(false);
  });

  it("blocks a row that still carries the legacy spelling", () => {
    // The no-backfill half of the invariant: an untouched row reads exactly the
    // same as a freshly-written one.
    const result = computeGateColumns({
      status: "Cancelled",
      internetEntireListingDisplayYN: true,
    });
    expect(result.is_terminal).toBe(true);
    expect(result.idx_display_yn).toBe(false);
  });

  it("defaults null/undefined/non-string status to Active (displayable)", () => {
    for (const input of [null, undefined, 0, 1, {}, []] as unknown[]) {
      const result = computeGateColumns({
        status: input,
        internetEntireListingDisplayYN: true,
      });
      expect(result.normalized_status).toBe("Active");
      expect(result.is_terminal).toBe(false);
      expect(result.idx_display_yn).toBe(true);
    }
  });
});

describe("computeGateColumns — IDX Plus pre-filter semantics (Internet*Display)", () => {
  it("treats null InternetEntireListingDisplayYN as displayable", () => {
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: null,
      participantOnly: false,
      ownerOptOut: false,
    });
    expect(result.internet_entire_listing_display_yn).toBe(true);
    expect(result.idx_display_yn).toBe(true);
  });

  it("treats undefined InternetEntireListingDisplayYN as displayable", () => {
    const result = computeGateColumns({
      status: "Active",
      // omitted entirely
    });
    expect(result.internet_entire_listing_display_yn).toBe(true);
    expect(result.idx_display_yn).toBe(true);
  });

  it("treats explicit false InternetEntireListingDisplayYN as blocked", () => {
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: false,
    });
    expect(result.internet_entire_listing_display_yn).toBe(false);
    expect(result.idx_display_yn).toBe(false);
  });

  it("treats explicit true InternetEntireListingDisplayYN as displayable", () => {
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
    });
    expect(result.internet_entire_listing_display_yn).toBe(true);
    expect(result.idx_display_yn).toBe(true);
  });

  it("InternetAddress mirrors the same null/false convention", () => {
    const nullResult = computeGateColumns({
      status: "Active",
      internetAddressDisplayYN: null,
    });
    expect(nullResult.internet_address_display_yn).toBe(true);

    const falseResult = computeGateColumns({
      status: "Active",
      internetAddressDisplayYN: false,
    });
    expect(falseResult.internet_address_display_yn).toBe(false);
  });

  it("idx_display_yn is independent of internet_address_display_yn", () => {
    // Address can be blocked while entire-listing is allowed (per REBNY rules).
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
      internetAddressDisplayYN: false,
    });
    expect(result.idx_display_yn).toBe(true);
    expect(result.internet_address_display_yn).toBe(false);
  });
});

describe("computeGateColumns — per-row opt-out flags (fail-closed via affirmPermission)", () => {
  it("treats null/undefined AVM as blocked (fail-closed)", () => {
    for (const input of [null, undefined] as unknown[]) {
      const result = computeGateColumns({
        status: "Active",
        internetAutomatedValuationDisplayYN: input,
      });
      expect(result.internet_automated_valuation_display_yn).toBe(false);
    }
  });

  it("treats explicit true AVM as allowed", () => {
    const result = computeGateColumns({
      status: "Active",
      internetAutomatedValuationDisplayYN: true,
    });
    expect(result.internet_automated_valuation_display_yn).toBe(true);
  });

  it("treats string 'true' AVM as allowed (Trestle OData boolean-as-string)", () => {
    const result = computeGateColumns({
      status: "Active",
      internetAutomatedValuationDisplayYN: "true",
    });
    expect(result.internet_automated_valuation_display_yn).toBe(true);
  });

  it("treats ConsumerComment with same fail-closed semantics", () => {
    const blocked = computeGateColumns({
      status: "Active",
      internetConsumerCommentYN: null,
    });
    expect(blocked.internet_consumer_comment_yn).toBe(false);

    const allowed = computeGateColumns({
      status: "Active",
      internetConsumerCommentYN: true,
    });
    expect(allowed.internet_consumer_comment_yn).toBe(true);
  });

  it("idx_display_yn is independent of AVM and ConsumerComment", () => {
    // AVM and ConsumerComment are separate consumer-facing widgets; they
    // do not affect whether the listing itself is displayable.
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
      internetAutomatedValuationDisplayYN: false,
      internetConsumerCommentYN: false,
    });
    expect(result.idx_display_yn).toBe(true);
  });
});

describe("computeGateColumns — owner-opt-out + participant-only block idx_display_yn", () => {
  it("ownerOptOut=true blocks idx_display_yn regardless of other flags", () => {
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
      participantOnly: false,
      ownerOptOut: true,
    });
    expect(result.idx_display_yn).toBe(false);
    expect(result.internet_entire_listing_display_yn).toBe(true); // unaffected
  });

  it("participantOnly=true blocks idx_display_yn regardless of other flags", () => {
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
      participantOnly: true,
      ownerOptOut: false,
    });
    expect(result.idx_display_yn).toBe(false);
  });

  it("null/undefined/non-true ownerOptOut defaults to not-blocked", () => {
    for (const input of [null, undefined, 0, 1, "true", "false", {}] as unknown[]) {
      const result = computeGateColumns({
        status: "Active",
        internetEntireListingDisplayYN: true,
        ownerOptOut: input,
        participantOnly: false,
      });
      // Defensive strict-equality: only `=== true` counts as opted-out.
      expect(result.idx_display_yn).toBe(true);
    }
  });

  it("null/undefined/non-true participantOnly defaults to not-blocked", () => {
    for (const input of [null, undefined, 0, 1, "true", "false", {}] as unknown[]) {
      const result = computeGateColumns({
        status: "Active",
        internetEntireListingDisplayYN: true,
        participantOnly: input,
        ownerOptOut: false,
      });
      expect(result.idx_display_yn).toBe(true);
    }
  });
});

describe("computeGateColumns — invariant: terminal status never leaves idx_display_yn=true", () => {
  it("holds for every TERMINAL_STATUSES value across all flag combinations", () => {
    const combinations = [
      { internetEntireListingDisplayYN: true,  internetAddressDisplayYN: true,  participantOnly: false, ownerOptOut: false },
      { internetEntireListingDisplayYN: true,  internetAddressDisplayYN: false, participantOnly: false, ownerOptOut: false },
      { internetEntireListingDisplayYN: false, internetAddressDisplayYN: true,  participantOnly: false, ownerOptOut: false },
      { internetEntireListingDisplayYN: null,  internetAddressDisplayYN: null,  participantOnly: false, ownerOptOut: false },
      { internetEntireListingDisplayYN: true,  internetAddressDisplayYN: true,  participantOnly: true,  ownerOptOut: false },
      { internetEntireListingDisplayYN: true,  internetAddressDisplayYN: true,  participantOnly: false, ownerOptOut: true  },
    ];
    for (const terminal of TERMINAL_STATUSES) {
      for (const combo of combinations) {
        const result = computeGateColumns({ status: terminal, ...combo });
        expect(result.idx_display_yn).toBe(false);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Phase A Codex fix (2026-05-20) — rls_eligible is a first-class gate
// ───────────────────────────────────────────────────────────────────────────
//
// Codex reviewer of PR #165 caught that the W1 CRM status PATCH passed
// every other gate column to computeGateColumns() but omitted rls_eligible.
// Commercial / website-only listings carry `rls_eligible=false` and MUST
// NEVER have `idx_display_yn=true`. The CRM POST already had this guard
// inline (`rlsEligible && ...` at app/api/crm/listings/route.ts:340-343);
// the helper now carries it forward to every writer. The CRM PATCH body-
// driven `IDXEntireListingDisplayYN` path also got the same AND-in at
// app/api/crm/listings/[id]/route.ts:166-187 (was a pre-Phase-A latent bug
// surfaced by the audit).

describe("computeGateColumns — rls_eligible first-class gate (Codex PR #165 review)", () => {
  it("rls_eligible=false blocks idx_display_yn even when ALL other gates are true (Active)", () => {
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
      internetAddressDisplayYN: true,
      internetAutomatedValuationDisplayYN: true,
      internetConsumerCommentYN: true,
      participantOnly: false,
      ownerOptOut: false,
      rls_eligible: false,
    });
    // The aggregate idx_display_yn MUST be false even though every other
    // signal is "displayable." Commercial / website-only listings are
    // excluded from IDX distribution per CLAUDE.md.
    expect(result.idx_display_yn).toBe(false);
    expect(result.rls_eligible).toBe(false);
    // Other gate columns are independent of rls_eligible and remain at
    // their per-field semantics (so consumers that read them directly
    // still see the true permission state).
    expect(result.internet_entire_listing_display_yn).toBe(true);
    expect(result.internet_address_display_yn).toBe(true);
    expect(result.internet_automated_valuation_display_yn).toBe(true);
    expect(result.internet_consumer_comment_yn).toBe(true);
    expect(result.is_terminal).toBe(false);
  });

  it("rls_eligible=false blocks idx_display_yn on ComingSoon + ActiveUnderContract too", () => {
    for (const status of ["ComingSoon", "ActiveUnderContract"]) {
      const result = computeGateColumns({
        status,
        internetEntireListingDisplayYN: true,
        rls_eligible: false,
      });
      expect(result.idx_display_yn).toBe(false);
    }
  });

  it("rls_eligible=true on an Active listing leaves idx_display_yn=true (other gates ok)", () => {
    const result = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
      participantOnly: false,
      ownerOptOut: false,
      rls_eligible: true,
    });
    expect(result.idx_display_yn).toBe(true);
    expect(result.rls_eligible).toBe(true);
  });

  it("terminal status + rls_eligible=true still blocks (terminal guard independent of rls_eligible)", () => {
    for (const terminal of TERMINAL_STATUSES) {
      const result = computeGateColumns({
        status: terminal,
        internetEntireListingDisplayYN: true,
        rls_eligible: true,
      });
      // Both terminal guard AND rls_eligible would have blocked
      // separately — verifying the terminal guard still fires regardless
      // of rls_eligible.
      expect(result.idx_display_yn).toBe(false);
      expect(result.is_terminal).toBe(true);
      expect(result.rls_eligible).toBe(true);
    }
  });

  it("undefined / null / missing rls_eligible defaults to true (preserves Trestle-mapper behavior)", () => {
    // The mapper does NOT pass rls_eligible; Trestle-sourced rows are always
    // REBNY-eligible. Default-to-true keeps that path byte-equivalent.
    for (const input of [undefined, null] as unknown[]) {
      const result = computeGateColumns({
        status: "Active",
        internetEntireListingDisplayYN: true,
        rls_eligible: input,
      });
      expect(result.idx_display_yn).toBe(true);
      expect(result.rls_eligible).toBe(true);
    }
    // Omitting the field entirely also defaults to true.
    const omitted = computeGateColumns({
      status: "Active",
      internetEntireListingDisplayYN: true,
    });
    expect(omitted.idx_display_yn).toBe(true);
    expect(omitted.rls_eligible).toBe(true);
  });

  it("only EXPLICIT false counts as rls-ineligible (0, 'false', etc. default to true)", () => {
    // Defensive strict-equality: input.rls_eligible !== false. Other falsy
    // values (0, '', 'false' string, NaN) are NOT silently treated as
    // ineligible. Caller is expected to pass the canonical boolean.
    for (const input of [0, "", "false", "FALSE", {}, NaN] as unknown[]) {
      const result = computeGateColumns({
        status: "Active",
        internetEntireListingDisplayYN: true,
        rls_eligible: input,
      });
      // None of these are === false, so rls_eligible defaults to true and
      // the aggregate gate passes.
      expect(result.idx_display_yn).toBe(true);
      expect(result.rls_eligible).toBe(true);
    }
  });

  it("invariant: rls_eligible=false leaves idx_display_yn=false across every status × flag combination", () => {
    const statuses = ["Active", "ComingSoon", "ActiveUnderContract", "Closed", "Sold", "Withdrawn"];
    const combos = [
      { internetEntireListingDisplayYN: true,  participantOnly: false, ownerOptOut: false },
      { internetEntireListingDisplayYN: true,  participantOnly: true,  ownerOptOut: false },
      { internetEntireListingDisplayYN: null,  participantOnly: false, ownerOptOut: false },
      { internetEntireListingDisplayYN: false, participantOnly: false, ownerOptOut: false },
    ];
    for (const status of statuses) {
      for (const combo of combos) {
        const result = computeGateColumns({ status, rls_eligible: false, ...combo });
        expect(result.idx_display_yn).toBe(false);
      }
    }
  });
});
