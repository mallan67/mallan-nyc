/// <reference types="jest" />
/**
 * Stage A (raw-mapper-convergence exception, Maya 2026-10-02): behavioral
 * characterization of the three raw mappers BEFORE any unification code change —
 * lib/idx/trestle-mapper.ts (mapTrestleToPrisma, computeGateColumns, checkDistributionGates,
 * derivePermissionGates, normalizeStandardStatus), lib/idx/mapping.ts (mapRESOToInternal),
 * lib/search/crm-idx-mapper.ts (mapTrestleToCrmListing).
 *
 * This file locks in CURRENT behavior, including current disagreements between the three
 * mappers, so Stage B's extraction can be verified against it (a test that changes meaning
 * from "pins the bug" to "pins the fix" is expected and correct; a test that goes from pass
 * to fail unexpectedly is a regression). It does not yet resolve every disagreement — only
 * the ones verified directly against the live code in this pass. Dimensions not covered here
 * (address composition, property-type-on-missing-input, exact date shape per mapper, the two
 * media classifiers in lib/media/listing-media-resolver.ts vs lib/media/media-sync-service.ts)
 * are deliberately deferred to a follow-up characterization pass rather than resolved from a
 * secondhand description.
 */
import { mapTrestleToPrisma, computeGateColumns, checkDistributionGates, derivePermissionGates, normalizeStandardStatus } from "../trestle-mapper";
import { mapRESOToInternal } from "../mapping";
import { mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe("Stage A — normalizeStandardStatus (trestle-mapper.ts)", () => {
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
  it("StandardStatus takes precedence over MlsStatus, defaulting to Active if neither is present", () => {
    expect(mapTrestleToPrisma({ ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active" }).status).toBe("Pending");
    expect(mapTrestleToPrisma({ ListingId: "2", MlsStatus: "Pending" }).status).toBe("Pending");
    expect(mapTrestleToPrisma({ ListingId: "3" }).status).toBe("Active");
  });

  it("a missing numeric field (BedroomsTotal) maps to null, NOT zero", () => {
    const result = mapTrestleToPrisma({ ListingId: "1" });
    expect(result.bedrooms_total).toBeNull();
  });

  it("a missing ListPrice maps to the string \"0\" (Prisma Decimal precision), not null", () => {
    const result = mapTrestleToPrisma({ ListingId: "1" });
    expect(result.list_price).toBe("0");
  });

  it("ConcessionsAmount / ConcessionsComments / Concessions are preserved in `features` for ANY transaction type — not stripped or treated as rental-only", () => {
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

describe("Stage A — CONFIRMED cross-mapper disagreement: status-field precedence", () => {
  it("mapRESOToInternal (mapping.ts) is StandardStatus-first, same as mapTrestleToPrisma", () => {
    const listing = mapRESOToInternal({
      ListingKey: "1", ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active",
      PropertyType: "Residential", ListPrice: 100000,
    });
    expect(listing?.standardStatus).toBe("Pending");
  });

  it("mapTrestleToCrmListing (crm-idx-mapper.ts) is MlsStatus-FIRST — the opposite precedence, on the identical input shape", () => {
    const listing = mapTrestleToCrmListing(
      { ListingKey: "1", ListingId: "1", StandardStatus: "Pending", MlsStatus: "Active", PropertyType: "Residential", ListPrice: 100000 },
      0
    );
    // Characterizes TODAY's behavior, which disagrees with the other two mappers on the
    // identical input above (they return "Pending"). Not asserted here as correct — this is
    // the confirmed disagreement Stage B must resolve to one precedence, not pick by majority.
    expect(listing.status).not.toBe("Pending");
  });
});
