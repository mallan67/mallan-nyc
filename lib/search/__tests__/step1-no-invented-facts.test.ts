/// <reference types="jest" />
/**
 * STEP 1 — UNKNOWN IS A REAL STATE.
 *
 * The mapper invents facts Cotality never supplied. Each default below looks
 * like data to every downstream consumer — result card, listing workspace,
 * report, calculator, CMA — because nothing distinguishes "the provider said 0"
 * from "the provider said nothing".
 *
 *   missing borough      -> "Manhattan"     a listing in Brooklyn reads Manhattan
 *   missing listing type -> "Exclusive"     third-party inventory claims exclusivity
 *   missing numbers      -> 0               unknown fee becomes $0 in every calculator
 *   unknown permission   -> permitted       fail-OPEN on a compliance gate
 *
 * The rule for this step: **remove the invention, do not substitute another
 * invented value.** `null` means the provider did not supply it. Renderers must
 * show that as unavailable — proven separately in the downstream tests.
 *
 * NOT in scope here: changing Sale/Rental filtering, engines, schema, or
 * expanding Cotality resources.
 */
import { mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";

/** A provider row carrying ONLY identity — every other fact absent. */
const EMPTY_ROW = { ListingId: "RLS20000001" } as Record<string, unknown>;

const mapped = () => mapTrestleToCrmListing(EMPTY_ROW, 0) as Record<string, unknown>;

describe("geography is never invented", () => {
  it("does not default a missing borough to Manhattan", () => {
    expect(mapped().borough).not.toBe("Manhattan");
  });

  it("reports an absent borough as unknown", () => {
    expect(mapped().borough).toBeNull();
  });

  it("still carries a borough the provider DID supply", () => {
    const row = { ...EMPTY_ROW, CityRegion: "Brooklyn" };
    expect((mapTrestleToCrmListing(row, 0) as Record<string, unknown>).borough).toBe("Brooklyn");
  });
});

describe("listing type is never invented", () => {
  it("does not label every provider row Exclusive", () => {
    // "Exclusive" is a Mallan business fact. Asserting it on third-party
    // inventory claims a relationship with the seller that does not exist.
    expect(mapped().listingType).not.toBe("Exclusive");
  });

  it("reports an unestablished listing type as unknown", () => {
    expect(mapped().listingType).toBeNull();
  });
});

describe("numbers are never invented", () => {
  it.each([
    ["price", "ListPrice"],
    ["rooms", "RoomsTotal"],
    ["beds", "BedroomsTotal"],
    ["fullBaths", "BathroomsFull"],
    ["halfBaths", "BathroomsHalf"],
    ["dom", "DaysOnMarket"],
    ["cdom", "CumulativeDaysOnMarket"],
    ["maintCC", "AssociationFee"],
  ])("%s is null when the provider did not supply %s", (field) => {
    expect(mapped()[field]).toBeNull();
  });

  it("preserves a genuine ZERO — 0 and unknown are different facts", () => {
    const row = { ...EMPTY_ROW, BedroomsTotal: 0 };
    // A studio really has 0 bedrooms. That must survive.
    expect((mapTrestleToCrmListing(row, 0) as Record<string, unknown>).beds).toBe(0);
  });

  it("does not compute a total monthly cost from unknown parts", () => {
    // monthlyTax + maintCC where both are unknown produced $0/month, which a
    // buyer reads as "no carrying cost".
    expect(mapped().totalMonthly).toBeNull();
  });
});

describe("compliance gates fail CLOSED, never open", () => {
  // CORRECTED. My first version of this test asserted idxDisplayYN must not be
  // true when absent. That is WRONG for this field and would have re-created the
  // 2026-04-30 incident from the other side: on the IDX Plus feed
  // InternetEntireListingDisplayYN is REBNY-PRE-FILTERED, so null IS the
  // provider's evidence that the row is displayable. Treating null as suppressed
  // corrupted 7,594 rows. The real defect was the hard-coded `true`, which
  // ignored an explicit `false`.
  it("honours the IDX Plus pre-filter: null means displayable", () => {
    expect(mapped().idxDisplayYN).toBe(true);
  });

  it("but an EXPLICIT provider false is now respected — the hard-coded true ignored it", () => {
    const row = { ...EMPTY_ROW, InternetEntireListingDisplayYN: false };
    const out = mapTrestleToCrmListing(row, 0) as Record<string, unknown>;
    expect(out.idxDisplayYN).toBe(false);
    expect((out.permissions as Record<string, unknown>).idxDisplay).toBe(false);
  });

  it("does not assert syndication permission without provider evidence", () => {
    expect((mapped().permissions as Record<string, unknown>).syndication).not.toBe(true);
  });

  it("does not assert owner opt-out is FALSE without provider evidence", () => {
    // `ownerOptOut: false` means "the owner has NOT opted out" — an affirmative
    // claim. Unknown must not read as permission to display.
    expect((mapped().permissions as Record<string, unknown>).ownerOptOut).not.toBe(false);
  });

  it("does not assert participant-only is FALSE without provider evidence", () => {
    expect((mapped().permissions as Record<string, unknown>).participantOnly).not.toBe(false);
  });

  it("still honours an explicit provider grant", () => {
    const row = { ...EMPTY_ROW, InternetEntireListingDisplayYN: true };
    const out = mapTrestleToCrmListing(row, 0) as Record<string, unknown>;
    expect(out.internetDisplayYN).toBe(true);
  });
});

describe("photo count is never invented", () => {
  it("is null when the provider supplied no count", () => {
    expect(mapped().photoCount).toBeNull();
  });

  it("preserves an explicit zero", () => {
    const row = { ...EMPTY_ROW, PhotosCount: 0 };
    expect((mapTrestleToCrmListing(row, 0) as Record<string, unknown>).photoCount).toBe(0);
  });
});

describe("status already fails safe — pin it so it cannot regress", () => {
  it("is UNKNOWN, not ACTIVE, when the provider supplied no status", () => {
    expect(mapped().status).toBe("UNKNOWN");
  });
});
