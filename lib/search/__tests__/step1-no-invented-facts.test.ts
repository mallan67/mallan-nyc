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
import {
  hasUsableListingIdentity,
  mapDisplayPropertyType,
  mapTrestleToCrmListing,
} from "@/lib/search/crm-idx-mapper";

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

  it("preserves the raw provider geography without calling it a borough", () => {
    // RETARGETED 2026-08-24 (21b0adc0). This previously asserted
    // CityRegion -> borough. Cotality exposes SubdivisionName, CityRegion,
    // CountyOrParish, MLSAreaMajor/Minor and PostalCity as SEPARATE facts, and
    // their equivalence to the Mallan borough concept is not proven against the
    // live contract. Promoting one of them to `borough` is the same unverified
    // equivalence that sent Pending searches to ActiveUnderContract, so the raw
    // fact is preserved under its own provider name and `borough` stays unknown.
    const row = { ...EMPTY_ROW, CityRegion: "Brooklyn" };
    const mappedRow = mapTrestleToCrmListing(row, 0) as Record<string, unknown>;
    expect(mappedRow.providerCityRegion).toBe("Brooklyn");
    expect(mappedRow.borough).toBeNull();
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
  // CORRECTED TWICE, and the second correction is about EVIDENCE CLASS.
  //
  // (1) My first version asserted idxDisplayYN must not be true when absent.
  //     That risked repeating the 2026-04-30 suppression failure from the other
  //     side, so the existing convention is preserved.
  // (2) My second version called "null means displayable" a live-verified
  //     Cotality semantic. It is NOT. Live $metadata establishes only that the
  //     field is a nullable Boolean; metadata does not define what null MEANS.
  //     The convention is the EXISTING IDX PLUS RUNTIME/DISTRIBUTION CONTRACT,
  //     preserved here for safety, with live semantic verification deferred to
  //     Step 2. The real Step 1 defect was the hard-coded `true`, which ignored
  //     an explicit provider `false`.
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

/**
 * STEP 1a CLOSURE — three same-class defects inside the file Step 1a changed.
 *
 * Live `$metadata`: `PropertyType` is a nullable enum; `LandLeaseYN`,
 * `CoolingYN`, `GarageYN`, `PetsAllowedYN` and `NewConstructionYN` are nullable
 * Booleans; `ListingId` and `SourceSystemKey` are both nullable strings. None
 * declares `Nullable="false"`, so absence is a legitimate provider state for
 * every one of them.
 */
describe("property type is never invented", () => {
  it("does not default an absent PropertyType to Residential", () => {
    // The provider's silence is not "Residential". That label drives the
    // display type, the Sale/Rental split and every report grouping.
    expect(mapDisplayPropertyType({})).not.toBe("Residential");
  });

  it("reports an absent PropertyType as unknown", () => {
    expect(mapDisplayPropertyType({})).toBeNull();
  });

  it("still maps a PropertyType the provider DID supply", () => {
    expect(mapDisplayPropertyType({ PropertyType: "Residential" })).toBe("Residential");
    expect(mapDisplayPropertyType({ CommonInterest: "Condominium" })).toBe("Condo");
  });
});

describe("nullable provider booleans carry THREE states, not two", () => {
  const FLAGS = ["LandLeaseYN", "CoolingYN", "GarageYN", "PetsAllowedYN", "NewConstructionYN"] as const;

  it.each(FLAGS)("%s is null when the provider said nothing", (flag) => {
    // `x === true || x === "true"` collapsed "the provider said false" and
    // "the provider said nothing" into the same false — so a listing with no
    // garage fact reads as having no garage.
    expect(mapped()[flag]).toBeNull();
  });

  it.each(FLAGS)("%s is false when the provider explicitly said false", (flag) => {
    const out = mapTrestleToCrmListing({ ...EMPTY_ROW, [flag]: false }, 0) as Record<string, unknown>;
    expect(out[flag]).toBe(false);
  });

  it.each(FLAGS)("%s is true when the provider explicitly said true", (flag) => {
    const out = mapTrestleToCrmListing({ ...EMPTY_ROW, [flag]: true }, 0) as Record<string, unknown>;
    expect(out[flag]).toBe(true);
  });

  it.each(FLAGS)("%s accepts the string form the feed also emits", (flag) => {
    const t = mapTrestleToCrmListing({ ...EMPTY_ROW, [flag]: "true" }, 0) as Record<string, unknown>;
    const f = mapTrestleToCrmListing({ ...EMPTY_ROW, [flag]: "false" }, 0) as Record<string, unknown>;
    expect(t[flag]).toBe(true);
    expect(f[flag]).toBe(false);
  });
});

describe("identity is NEVER manufactured", () => {
  it("does not fall back to a positional index as the listing id", () => {
    // `String(ListingId || SourceSystemKey || index + 1)` gave an identityless
    // row the id "1". That id then keys selection, client history, reports,
    // saved searches and reconciliation — all pointing at nothing.
    const out = mapTrestleToCrmListing({}, 0) as Record<string, unknown>;
    expect(out.id).not.toBe("1");
  });

  it("reports an identityless row as having no id", () => {
    expect((mapTrestleToCrmListing({}, 5) as Record<string, unknown>).id).toBeNull();
  });

  it("exposes a predicate so callers can exclude the row before it is trusted", () => {
    expect(hasUsableListingIdentity({})).toBe(false);
    expect(hasUsableListingIdentity({ ListingKey: "" })).toBe(false);
    expect(hasUsableListingIdentity({ ListingKey: "1183681390" })).toBe(true);
  });

  it("does not accept ListingId or SourceSystemKey as identity", () => {
    // RETARGETED 2026-08-24 (21b0adc0). `ListingKey` is String(20)
    // Nullable=false on live `$metadata`; `ListingId` is separately nullable
    // and `SourceSystemKey` is provider lineage. Letting either stand in is the
    // same class of invention as the `index + 1` id this file exists to forbid
    // — a borrowed identifier is still not the row's identity.
    expect(hasUsableListingIdentity({ ListingId: "RLS20000001" })).toBe(false);
    expect(hasUsableListingIdentity({ SourceSystemKey: "1183681390" })).toBe(false);
  });

  it("still uses the provider identity when one exists", () => {
    const byKey = mapTrestleToCrmListing({ ListingKey: "1183681390" }, 7) as Record<string, unknown>;
    expect(byKey.id).toBe("1183681390");
  });
});
