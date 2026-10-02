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
import { mapTrestleToPrisma, computeGateColumns, checkDistributionGates, derivePermissionGates, normalizeStandardStatus } from "../trestle-mapper";
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
  it("[PROVEN_DEFECT, upgraded 2026-10-02] StandardStatus/MlsStatus fallback-substitution — Master Plan §0.6 states these are two independent enums and 'Never substitute one for the other'; this test pins the CURRENT violation (shared by all three mappers, not just this one), not a target to preserve", () => {
    expect(mapTrestleToPrisma({ ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active" }).status).toBe("Pending");
    expect(mapTrestleToPrisma({ ListingId: "2", MlsStatus: "Pending" }).status).toBe("Pending");
    expect(mapTrestleToPrisma({ ListingId: "3" }).status).toBe("Active");
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

describe("Stage A — derivePermissionGates (owner opt-out / participant-only)", () => {
  it("participant-only fires on Permission === 'Private'", () => {
    expect(derivePermissionGates({ Permission: "Private" }).participantOnly).toBe(true);
    expect(derivePermissionGates({ Permission: "IDX" }).participantOnly).toBe(false);
  });

  it("owner-opt-out: current derivation checks for a literal 'OwnerOptOut'/'Owner Opt-Out' value that does not exist on live Cotality's Permission enum (PROVEN unreachable; see docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md 'Known held defect')", () => {
    // Characterizes that the code PATH exists and is well-formed, not that it is reachable
    // against live data. Do not treat a passing/failing value here as proof either way about
    // live reachability — that question is already answered elsewhere and is out of scope for
    // this mapper-convergence batch (no replacement field is proposed).
    expect(derivePermissionGates({ Permission: "OwnerOptOut" }).ownerOptOut).toBe(true);
    expect(derivePermissionGates({ Permission: "IDX" }).ownerOptOut).toBe(false);
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

describe("Stage A — PROVEN_DEFECT (upgraded 2026-10-02): status-field substitution, all three mappers, not just one", () => {
  // Master Plan §0.6: "StandardStatus and MlsStatus... Neither is derived from the other.
  // Never substitute one for the other." All three mappers below violate this by falling
  // back from one to the other. The two tests pin CURRENT (wrong) behavior for both
  // directions of the violation — neither is the target; Stage B must stop substituting
  // entirely (read StandardStatus for canonical status, MlsStatus separately only where a
  // consumer specifically needs it), not simply "pick StandardStatus-first as the winner."
  it("mapRESOToInternal (mapping.ts) substitutes MlsStatus when StandardStatus is present but reads StandardStatus first", () => {
    const listing = mapRESOToInternal({
      ListingKey: "1", ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active",
      PropertyType: "Residential", ListPrice: 100000,
    });
    expect(listing?.standardStatus).toBe("Pending");
  });

  it("mapTrestleToCrmListing (crm-idx-mapper.ts) substitutes in the OPPOSITE direction (MlsStatus-first) on the identical input shape", () => {
    const listing = mapTrestleToCrmListing(
      { ListingKey: "1", ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active", PropertyType: "Residential", ListPrice: 100000 },
      0
    );
    // Characterizes TODAY's behavior, which disagrees with the other two mappers on the
    // identical input above (they return "Pending"). Not asserted here as correct — both
    // this test and the one above pin a Master-Plan-forbidden substitution pattern, not a
    // disagreement to resolve by picking a winning direction.
    expect(listing.status).not.toBe("Pending");
  });
});
