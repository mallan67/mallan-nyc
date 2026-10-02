/// <reference types="jest" />
/**
 * Stage A (raw-mapper-convergence exception, Maya 2026-10-02): behavioral
 * characterization of the three raw mappers BEFORE any unification code change —
 * lib/idx/trestle-mapper.ts (mapTrestleToPrisma, computeGateColumns, checkDistributionGates,
 * derivePermissionGates, normalizeStandardStatus), lib/idx/mapping.ts (mapRESOToInternal),
 * lib/search/crm-idx-mapper.ts (mapTrestleToCrmListing).
 *
 * LEGACY OBSERVATION TESTS ONLY (Maya's correction, 2026-10-02): these pin CURRENT mapper
 * behavior, including current disagreements, so Stage B's extraction can be diffed against
 * it — but current behavior is NOT the target contract and these tests are NOT acceptance
 * criteria. The only real baseline is the live Cotality Property contract, then
 * MALLAN-PLATFORM-MASTER-PLAN.md §0, then an applicable REBNY rule. A field-by-field
 * verification against that baseline (workflow wf_0986966a-a73,
 * docs/audits/raw-mapper-property-contract-resolution-2026-10-02.md) found most of this
 * file's observations are themselves LEGACY_UNVERIFIED (not proven correct, not proven
 * wrong) rather than confirmed-correct targets — see per-test notes below. Only the two
 * tests marked PROVEN_DEFECT are confirmed wrong against the live contract/Master/REBNY and
 * ready to fix in Stage B; a test changing from "pins the bug" to "pins the fix" there is
 * expected and correct. Dimensions not covered here (address composition, exact date shape
 * per mapper, the two media classifiers) are deferred to that same audit doc, not resolved
 * here.
 */
import { mapTrestleToPrisma, computeGateColumns, checkDistributionGates, derivePermissionGates, normalizeStandardStatus, applyLocalOwnerOptOutGate } from "../trestle-mapper";
import { mapRESOToInternal } from "../mapping";
import { mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe("Stage A — normalizeStandardStatus (trestle-mapper.ts) [LEGACY_UNVERIFIED: live StandardStatus has zero null rows today per docs/audits/raw-mapper-property-contract-resolution-2026-10-02.md; this fallback arm is unreached, not proven correct or safe to remove]", () => {
  it("defaults non-string / empty input to 'Active'", () => {
    expect(normalizeStandardStatus(undefined)).toBe("Active");
    expect(normalizeStandardStatus(null)).toBe("Active");
    expect(normalizeStandardStatus("")).toBe("Active");
    expect(normalizeStandardStatus("   ")).toBe("Active");
  });

  it("is case-insensitive against known canonical sets", () => {
    expect(normalizeStandardStatus("closed")).toBe("Closed");
    expect(normalizeStandardStatus("ACTIVE")).toBe("Active");
  });

  it("preserves an unrecognized value verbatim rather than silently coercing it", () => {
    expect(normalizeStandardStatus("SomeNewStatus")).toBe("SomeNewStatus");
  });
});

describe("Stage A — mapTrestleToPrisma status precedence and numeric null-vs-zero", () => {
  it("[FIXED, Stage B cutover 1 (corrected), 2026-10-02] StandardStatus drives status exactly — MlsStatus is never consulted, even when it conflicts", () => {
    expect(mapTrestleToPrisma({ ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active" }).status).toBe("Pending");
    expect(mapTrestleToPrisma({ ListingId: "2", StandardStatus: "Closed", MlsStatus: "Active" }).status).toBe("Closed");
    expect(mapTrestleToPrisma({ ListingId: "3", StandardStatus: "Active", MlsStatus: "Closed" }).status).toBe("Active");
  });

  it("preserves exact live Cotality spellings verbatim — ActiveUnderContract, Canceled, Delete, Incomplete are never rewritten", () => {
    expect(mapTrestleToPrisma({ ListingId: "1", StandardStatus: "ActiveUnderContract", MlsStatus: "Active" }).status).toBe("ActiveUnderContract");
    expect(mapTrestleToPrisma({ ListingId: "2", StandardStatus: "Canceled" }).status).toBe("Canceled");
    expect(mapTrestleToPrisma({ ListingId: "3", StandardStatus: "Delete" }).status).toBe("Delete");
    expect(mapTrestleToPrisma({ ListingId: "4", StandardStatus: "Incomplete" }).status).toBe("Incomplete");
  });

  it("[NEGATIVE TEST, persistence boundary] StandardStatus absent, MlsStatus present: falls to the Unknown sentinel — never substitutes MlsStatus, never fabricates Active, and does not crash (mapTrestleToPrisma must stay robust on malformed/partial input per lib/compliance/__tests__/c2-terminal-idx-display.test.ts)", () => {
    expect(mapTrestleToPrisma({ ListingId: "2", MlsStatus: "Pending" }).status).toBe("Unknown");
  });

  it("[NEGATIVE TEST, persistence boundary] both StandardStatus and MlsStatus absent: falls to the Unknown sentinel, never fabricates Active", () => {
    expect(mapTrestleToPrisma({ ListingId: "3" }).status).toBe("Unknown");
  });

  it("a missing numeric field (BedroomsTotal) maps to null, NOT zero", () => {
    const result = mapTrestleToPrisma({ ListingId: "1" });
    expect(result.bedrooms_total).toBeNull();
  });

  it("[LEGACY_UNVERIFIED: live ListPrice has zero null rows today] a missing ListPrice maps to the string \"0\" (Prisma Decimal precision), not null — unreached fallback, not a proven-correct target", () => {
    const result = mapTrestleToPrisma({ ListingId: "1" });
    expect(result.list_price).toBe("0");
  });

  it("[LEGACY_UNVERIFIED: generic features-JSONB storage adequacy for an unconditionally-required REBNY field is unresolved] ConcessionsAmount / ConcessionsComments / Concessions are preserved in `features` for ANY transaction type — not stripped or treated as rental-only", () => {
    const result = mapTrestleToPrisma({
      ListingId: "1",
      PropertyType: "Residential",
      Concessions: "Yes",
      ConcessionsAmount: 5000,
      ConcessionsComments: "One month free",
    });
    expect(result.features.Concessions).toBe("Yes");
    expect(result.features.ConcessionsAmount).toBe(5000);
    expect(result.features.ConcessionsComments).toBe("One month free");
  });
});

describe("Stage A — derivePermissionGates (participant-only) / owner-opt-out cutover (2026-10-02)", () => {
  it("participant-only fires on Permission === 'Private'", () => {
    expect(derivePermissionGates({ Permission: "Private" }).participantOnly).toBe(true);
    expect(derivePermissionGates({ Permission: "IDX" }).participantOnly).toBe(false);
  });

  it("[FIXED, Permission cutover 2026-10-02] derivePermissionGates no longer returns an ownerOptOut field at all — Gate 1 (Owner Opt-Out) has no live Cotality signal (confirmed via trestle_get_picklist: neither Permission's 18 values nor MlsStatus's 26 values contain OwnerOptOut/'Owner Opt-Out') and is Mallan-local authority only (lib/compliance/gates.ts::isOwnerOptOut reads the DB-cached owner_opt_out column)", () => {
    expect(derivePermissionGates({ Permission: "OwnerOptOut" })).not.toHaveProperty("ownerOptOut");
    expect(derivePermissionGates({ Permission: "IDX" })).not.toHaveProperty("ownerOptOut");
  });

  it("[Permission cutover 2026-10-02] applyLocalOwnerOptOutGate preserves a locally-set owner_opt_out across a provider UPDATE, and lets a fresh CREATE (no existing row) through unchanged", () => {
    expect(applyLocalOwnerOptOutGate(true, true)).toBe(false);
    expect(applyLocalOwnerOptOutGate(true, false)).toBe(true);
    expect(applyLocalOwnerOptOutGate(true, null)).toBe(true);
    expect(applyLocalOwnerOptOutGate(true, undefined)).toBe(true);
  });
});

describe("Stage A — CONFIRMED LIVE DEFECT: computeGateColumns vs checkDistributionGates disagree on the UCBA Art. I §6 24-hour closed-listing grace period", () => {
  it("a listing closed 1 hour ago: checkDistributionGates (evaluateDisplayGate) allows display (grace period); computeGateColumns does not (it has no CloseDate parameter at all)", () => {
    const raw = { StandardStatus: "Closed", CloseDate: hoursAgoIso(1), InternetEntireListingDisplayYN: null };
    const viaGates = checkDistributionGates(raw);
    expect(viaGates.displayable).toBe(true); // grace period: closed <24h ago still shows

    const viaComputeGateColumns = computeGateColumns({
      status: "Closed",
      internetEntireListingDisplayYN: null,
      internetAddressDisplayYN: null,
      internetAutomatedValuationDisplayYN: null,
      internetConsumerCommentYN: null,
      ownerOptOut: false,
      participantOnly: false,
      rls_eligible: true,
    });
    // computeGateColumns has no CloseDate input and treats ANY terminal status as
    // immediately non-displayable — it cannot implement the grace period. This is the
    // confirmed disagreement: the same listing is displayable via one gate function and
    // not displayable via the other, depending only on which of the three current
    // computeGateColumns call sites (app/api/crm/listings/[id]/status/route.ts,
    // scripts/audit/reconcile-execute.ts, scripts/build-recovery-manifest.ts) a caller uses.
    expect(viaComputeGateColumns.idx_display_yn).toBe(false);
  });

  it("a listing closed 48 hours ago: both agree it is not displayable", () => {
    const raw = { StandardStatus: "Closed", CloseDate: hoursAgoIso(48), InternetEntireListingDisplayYN: null };
    expect(checkDistributionGates(raw).displayable).toBe(false);
    const viaComputeGateColumns = computeGateColumns({
      status: "Closed",
      internetEntireListingDisplayYN: null,
      internetAddressDisplayYN: null,
      internetAutomatedValuationDisplayYN: null,
      internetConsumerCommentYN: null,
      ownerOptOut: false,
      participantOnly: false,
      rls_eligible: true,
    });
    expect(viaComputeGateColumns.idx_display_yn).toBe(false);
  });
});

describe("Stage A — [FIXED, Stage B cutover 1 (corrected), 2026-10-02]: display projections fall to UNKNOWN, never a fabricated Active, in all three mappers", () => {
  // Master Plan §0.6: "StandardStatus and MlsStatus... Neither is derived from the other.
  // Never substitute one for the other." All three mappers now read the single shared
  // lib/cotality/property.ts export readCotalityStandardStatus(raw) — the Cotality raw
  // contract boundary, NOT any of the three legacy mapper files — for the field that
  // drives display/compliance decisions. mapTrestleToPrisma falls to an "Unknown"
  // sentinel when it is absent (see the describe block above, corrected from an earlier
  // throw — see lib/idx/trestle-mapper.ts's status-closure comment); mapRESOToInternal and
  // mapTrestleToCrmListing (display projections) fall to an UNKNOWN sentinel too — never
  // "Active", which is a real, specific provider-asserted business state.
  it("mapRESOToInternal (mapping.ts) now matches mapTrestleToPrisma's source exactly — StandardStatus only, MlsStatus never consulted", () => {
    const listing = mapRESOToInternal({
      ListingKey: "1", ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active",
      PropertyType: "Residential", ListPrice: 100000,
    });
    expect(listing?.standardStatus).toBe("Pending");
  });

  it("[NEGATIVE TEST] mapRESOToInternal with StandardStatus absent falls to UNKNOWN, never Active, even with MlsStatus present", () => {
    const listing = mapRESOToInternal({
      ListingKey: "1", ListingId: "1", MlsStatus: "Pending",
      PropertyType: "Residential", ListPrice: 100000,
    });
    expect(listing?.standardStatus).toBe("UNKNOWN");
  });

  it("mapTrestleToCrmListing (crm-idx-mapper.ts) no longer substitutes in the opposite direction — status is driven by StandardStatus on the identical input shape", () => {
    const listing = mapTrestleToCrmListing(
      { ListingKey: "1", ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active", PropertyType: "Residential", ListPrice: 100000 },
      0
    );
    expect(listing.status).toBe("PENDING");
  });

  it("[NEGATIVE TEST] mapTrestleToCrmListing with StandardStatus absent and only MlsStatus present falls to UNKNOWN — never Active, never Pending (no substitution, no fabrication)", () => {
    const listing = mapTrestleToCrmListing(
      { ListingKey: "1", ListingId: "1", MlsStatus: "Pending", PropertyType: "Residential", ListPrice: 100000 },
      0
    );
    expect(listing.status).toBe("UNKNOWN");
    expect(listing.status).not.toBe("ACTIVE");
    expect(listing.status).not.toBe("PENDING");
  });

  it("[NEGATIVE TEST] mapTrestleToCrmListing with both StandardStatus and MlsStatus absent falls to UNKNOWN, never Active", () => {
    const listing = mapTrestleToCrmListing(
      { ListingKey: "1", ListingId: "1", PropertyType: "Residential", ListPrice: 100000 },
      0
    );
    expect(listing.status).toBe("UNKNOWN");
    expect(listing.status).not.toBe("ACTIVE");
  });
});
