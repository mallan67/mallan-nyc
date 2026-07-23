/**
 * BUILDING PAYLOAD PARITY (2026-07-23, Maya's front-end-safety requirement).
 *
 * Proves the new shared cached accessor (lib/buildings/public-building-data)
 * returns an IDENTICAL complete public JSON payload to the EXACT production
 * route frozen from main c4ade4bd (tests/fixtures/legacy-buildings-route-…),
 * for the same fixtures and the same mocked failure modes — not merely
 * success:true.
 *
 * Field classes covered (each also asserted explicitly): listing IDs ·
 * sale/rental/coming-soon classification · counts · prices · photos ·
 * building name/address · building facts · amenities · pet policy · ACRIS
 * history · VOW/suppressed behavior (MLS closed rows withheld,
 * gatedRecordsCount) · compliance attribution · metadata-driving fields ·
 * null and error behavior (DB down, Cotality down, both down).
 *
 * All data is fixtures + mocks. NO production traffic, NO Neon.
 */
import { NextRequest } from "next/server";

// ── tag-aware memoizing stand-in for the Next data cache ───────────────────
jest.mock("next/cache", () => {
  const store = new Map<string, { value: unknown; tags: string[] }>();
  return {
    unstable_cache:
      (fn: (...a: unknown[]) => Promise<unknown>, keyParts: string[], opts?: { tags?: string[] }) =>
      async (...args: unknown[]) => {
        const k = JSON.stringify([keyParts, args]);
        const hit = store.get(k);
        if (hit) return hit.value;
        const value = await fn(...args);
        store.set(k, { value, tags: opts?.tags ?? [] });
        return value;
      },
    revalidateTag: jest.fn(),
  };
});

// ── scenario-parameterized fixtures ────────────────────────────────────────
// Each scenario uses a distinct street number so cache entries never collide.
// Failure modes per scenario: DB down (5xx from prisma), Trestle down, both.
const FAIL_DB = new Set(["500", "700"]);
const FAIL_TRESTLE = new Set(["600", "700"]);

function dbRows(num: string) {
  // Rich DB layer: a CRM exclusive (SL- prefix, exists ONLY in Neon), an IDX
  // twin of a Trestle record (deduped by mlsId in the merge), and a CLOSED
  // row with raw_data (legacy pushed it as source:'mls' — always withheld by
  // the public visibility contract; the new module drops the layer — parity
  // must hold either way).
  return [
    {
      id: `dbid-${num}-crm`,
      listing_id: "SL-2001",
      status: "Active",
      list_price: 3200000,
      bedrooms_total: 3,
      bathrooms_full: 2,
      bathrooms_half: 1,
      living_area: 1850,
      property_type: "Residential",
      property_sub_type: "Condominium",
      listing_type: "sale",
      address: {
        StreetNumber: num, StreetName: "EAST 90TH STREET", PostalCode: "10128",
        UnitNumber: "PH2", BuildingName: "",
      },
      features: { CommonInterest: "Condominium", YearBuilt: 1999, StoriesTotal: 23 },
      media: [
        { MediaURL: "https://img.example/fp.jpg", MediaCategory: "FloorPlan", Order: 0 },
        { MediaURL: "https://img.example/crm-hero.jpg", MediaCategory: "Photo", Order: 1 },
      ],
      raw_data: null,
    },
    {
      id: `dbid-${num}-closed`,
      listing_id: "RLS-CLOSED-1",
      status: "Closed",
      list_price: 1500000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 700,
      property_type: "Residential",
      property_sub_type: "Condominium",
      listing_type: "sale",
      address: {
        StreetNumber: num, StreetName: "EAST 90TH STREET", PostalCode: "10128",
        UnitNumber: "4C", BuildingName: "",
      },
      features: { CommonInterest: "Condominium" },
      media: [],
      raw_data: { ClosePrice: 1495000, CloseDate: "2025-11-02" },
    },
  ];
}

function trestleRecords(num: string) {
  // scenario 800: a RENTAL BUILDING — every record carries that ownership form
  const buildingCI = num === "800" ? "RentalBuilding" : "Condominium";
  const base = {
    BuildingName: "Century Tower",
    YearBuilt: 1999,
    StoriesTotal: 23,
    NumberOfUnitsInCommunity: 128,
    CommonInterest: buildingCI,
    StructureType: "HighRise",
    NewConstructionYN: false,
    TaxAnnualAmount: 21729.84,
    BuildingFeatures: "Doorman,Elevator",
    AssociationAmenities: "Gym,Roof Deck",
    PetsAllowed: "Cats OK,Dogs OK",
    Heating: "Central",
    Cooling: "Central Air",
    Flooring: "Hardwood",
    InteriorFeatures: "Washer Dryer",
    Appliances: "Dishwasher",
    AssociationFee: 1450,
    AssociationFeeFrequency: "Monthly",
    AssociationFeeIncludes: "Water,Heat",
    View: "City",
  };
  return [
    {
      ...base,
      ListingId: `TRE-${num}-S1`, ListingKey: `KEY-${num}-S1`,
      ListPrice: 2400000, BedroomsTotal: 2, BathroomsFull: 2, BathroomsHalf: 0,
      LivingArea: 1400, UnitNumber: "12B",
      PropertySubType: "Condominium", PropertyType: "Residential",
      StandardStatus: "Active", MlsStatus: "Active", ListOfficeName: "Other Brokerage LLC",
      Media: [
        { MediaURL: "https://img.cotality.example/fp1.jpg", MediaCategory: "FloorPlan", Order: 0 },
        { MediaURL: "https://img.cotality.example/hero1.jpg", MediaCategory: "Photo", Order: 1, PreferredPhotoYN: true },
      ],
    },
    {
      ...base,
      ListingId: `TRE-${num}-R1`, ListingKey: `KEY-${num}-R1`,
      CommonInterest: null, // rentals carry no ownership form — card stays 'Apartment'
      ListPrice: 6500, BedroomsTotal: 1, BathroomsFull: 1, BathroomsHalf: 0,
      LivingArea: 800, UnitNumber: "7A",
      PropertySubType: "Apartment", PropertyType: "Residential Lease",
      StandardStatus: "Active", MlsStatus: "Active", ListOfficeName: "Rental Group Inc",
      Media: [{ MediaURL: "https://img.cotality.example/rent1.jpg", MediaCategory: "Photo", Order: 0 }],
    },
    {
      ...base,
      ListingId: `TRE-${num}-CS1`, ListingKey: `KEY-${num}-CS1`,
      ListPrice: 1990000, BedroomsTotal: 2, BathroomsFull: 1, BathroomsHalf: 1,
      LivingArea: 1200, UnitNumber: "9F",
      PropertySubType: "Condominium", PropertyType: "Residential",
      StandardStatus: "ComingSoon", MlsStatus: "ComingSoon", ListOfficeName: "Mallan Real Estate Inc.",
      Media: [],
    },
    {
      ...base,
      ListingId: `TRE-${num}-C1`, ListingKey: `KEY-${num}-C1`,
      ListPrice: 1800000, ClosePrice: 1750000, CloseDate: "2026-01-15",
      BedroomsTotal: 2, BathroomsFull: 2, BathroomsHalf: 0,
      LivingArea: 1300, UnitNumber: "3A",
      PropertySubType: "Condominium", PropertyType: "Residential",
      StandardStatus: "Closed", MlsStatus: "Closed", ListOfficeName: "Other Brokerage LLC",
      Media: [],
    },
  ];
}

// ── prisma mock: answers BOTH query shapes from the same fixture set ───────
const listingFindMany = jest.fn(async (q: Record<string, any>) => {
  const conds: Array<Record<string, any>> = q?.where?.AND ?? [];
  const shardCond = conds.find((c) => c?.address?.string_starts_with);
  if (shardCond) {
    // NEW manifest shard query (keyset-paginated, orderBy listing_id asc)
    const shard: string = shardCond.address.string_starts_with;
    if (FAIL_DB.has(shard + "00")) throw new Error("simulated Neon outage");
    const all = dbRows(shard + "00").sort((a, b) => (a.listing_id < b.listing_id ? -1 : 1));
    let start = 0;
    if (q?.cursor?.listing_id) {
      start = all.findIndex((r) => r.listing_id === q.cursor.listing_id) + (q.skip ?? 0);
    }
    return all.slice(start, start + (q.take ?? all.length));
  }
  // LEGACY per-building query (address JSON path equals, orderBy list_price desc)
  const numCond = conds.find((c) => c?.address?.path?.[0] === "StreetNumber" && c?.address?.equals);
  const num: string = numCond?.address?.equals ?? "";
  if (FAIL_DB.has(num)) throw new Error("simulated Neon outage");
  return dbRows(num).sort((a, b) => Number(b.list_price) - Number(a.list_price)).slice(0, 50);
});
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listing: { findMany: (...a: unknown[]) => listingFindMany(...(a as [Record<string, unknown>])) },
  },
}));

jest.mock("@/lib/idx/auth", () => ({ getAccessToken: jest.fn(async () => "test-token") }));

jest.mock("@/lib/buildings/acris-building-sales", () => ({
  boroughFromPostalCode: jest.fn(() => "1"),
  lookupBBL: jest.fn(async () => "1015550001"),
  fetchAcrisSales: jest.fn(async () => [
    { id: "acris-1", closePrice: 2100000, closeDate: "2024-05-01", unit: "12B" },
    { id: "acris-2", closePrice: 995000, closeDate: "2022-09-14", unit: "4C" },
  ]),
}));

// the legacy fixture ALSO imports the (dormant) building upsert — neutralize
jest.mock("@/lib/buildings/upsert", () => ({
  upsertBuildingFromRecords: jest.fn(async () => {
    throw new Error("must never be called (BuildingKeyNumeric absent)");
  }),
}));

// Trestle OData fetch: serve the scenario's records by StreetNumber in $filter
beforeAll(() => {
  global.fetch = jest.fn(async (url: unknown) => {
    const u = String(url);
    // URLSearchParams encodes spaces as '+' — normalize before matching
    const m = /StreetNumber\s+eq\s+'(\d+)'/.exec(decodeURIComponent(u.replace(/\+/g, " ")));
    const num = m?.[1] ?? "";
    if (FAIL_TRESTLE.has(num)) throw new Error("simulated Cotality outage");
    return {
      ok: true,
      json: async () => ({ value: trestleRecords(num) }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

const { GET: legacyGET } = require("../fixtures/legacy-buildings-route-c4ade4bd");
const { getBuildingDataCached } = require("@/lib/buildings/public-building-data");

async function legacyPayload(num: string, bn?: string) {
  const sp = new URLSearchParams({ streetNumber: num, streetName: "East 90th Street", postalCode: "10128" });
  if (bn) sp.set("buildingName", bn);
  const res = await legacyGET(new NextRequest(`https://mallan.nyc/api/buildings?${sp}`));
  return { status: res.status, body: await res.json() };
}
/** Maya-directed divergence (2026-07-23): unit-card propertyType now maps
 *  through mapPropertyTypeToDisplay (Condo/Co-op/Condop — never raw
 *  'Apartment' for ownership units). EVERYTHING ELSE stays byte-identical
 *  to production, so the deep-equal strips ONLY that field and explicit
 *  assertions below pin the new mapping. */
function stripDirectedDivergence(p: Record<string, any>) {
  const clone = JSON.parse(JSON.stringify(p));
  for (const u of clone.activeUnits ?? []) delete u.propertyType;
  for (const s of clone.saleHistory ?? []) delete s.propertyType;
  return clone;
}

async function newPayload(num: string, bn?: string) {
  const body = await getBuildingDataCached({
    streetNumber: num, streetName: "East 90th Street", postalCode: "10128", buildingName: bn ?? null,
  });
  return JSON.parse(JSON.stringify(body));
}

describe("building payload parity — legacy production route vs new shared accessor", () => {
  it("FULL-PAYLOAD parity on the rich fixture (CRM exclusive + sale + rental + coming-soon + closed + ACRIS)", async () => {
    const legacy = await legacyPayload("400");
    const fresh = await newPayload("400");
    expect(legacy.status).toBe(200);
    // the complete public JSON shape — not merely success:true
    expect(stripDirectedDivergence(fresh)).toEqual(stripDirectedDivergence(legacy.body));
  });

  it("explicit field classes on the SAME payloads (IDs, classification, counts, prices, photos, facts, amenities, pets, ACRIS, VOW, attribution)", async () => {
    const { body } = await legacyPayload("400");
    const fresh = await newPayload("400");

    // listing IDs + sale/rental/coming-soon classification
    const ids = (fresh.activeUnits as Array<Record<string, unknown>>).map((u) => u.mlsId).sort();
    expect(ids).toEqual((body.activeUnits as Array<Record<string, unknown>>).map((u) => u.mlsId).sort());
    expect(ids).toContain("SL-2001"); // CRM exclusive present via the manifest layer
    const byId = Object.fromEntries((fresh.activeUnits as Array<Record<string, any>>).map((u) => [u.mlsId, u]));
    expect(byId["TRE-400-S1"].listingType).toBe("sale");
    // Maya 2026-07-23: ownership units display Condo/Co-op/Condop — never raw Apartment
    expect(byId["TRE-400-S1"].propertyType).toBe("Condo");
    expect(byId["TRE-400-CS1"].propertyType).toBe("Condo");
    // Maya rule: a rental INSIDE A CONDO BUILDING shows Condo (building ownership form)
    expect(byId["TRE-400-R1"].propertyType).toBe("Condo");
    expect(byId["TRE-400-R1"].listingType).toBe("rent");
    expect(byId["TRE-400-CS1"].status).toBe("ComingSoon");

    // counts + stats + prices
    expect(fresh.stats).toEqual(body.stats);
    expect(byId["TRE-400-S1"].listPrice).toBe(2400000);
    expect(byId["SL-2001"].listPrice).toBe(3200000);

    // photos: preferred-photo/classifier logic — never a floorplan hero
    expect(byId["TRE-400-S1"].photoUrl).toContain(encodeURIComponent("https://img.cotality.example/hero1.jpg"));
    expect(byId["SL-2001"].photoUrl).toContain(encodeURIComponent("https://img.example/crm-hero.jpg"));

    // building name/address + facts
    expect(fresh.building.name).toBe("Century Tower");
    expect(fresh.building.address).toBe(body.building.address);
    expect(fresh.building.yearBuilt).toBe(1999);
    expect(fresh.building.storiesTotal).toBe(23);
    expect(fresh.building.totalUnits).toBe(128);

    // amenities + pet policy
    expect(fresh.building.amenities).toEqual(body.building.amenities);
    expect(fresh.building.petPolicy).toEqual(body.building.petPolicy);

    // ACRIS-only public sale history (VOW: every MLS closed row withheld)
    expect((fresh.saleHistory as Array<Record<string, unknown>>).length).toBe(2);
    for (const s of fresh.saleHistory as Array<Record<string, unknown>>) {
      expect(s.source).toBe("acris");
    }
    expect(fresh.gatedRecordsCount).toBe(body.gatedRecordsCount);

    // compliance attribution
    expect(fresh._compliance.attribution).toContain("REBNY Listing Service");
    expect(fresh._compliance).toEqual(body._compliance);
  });

  it("NULL/ERROR parity — Neon down: both degrade identically to the live Cotality/ACRIS layers", async () => {
    const legacy = await legacyPayload("500");
    const fresh = await newPayload("500");
    expect(legacy.status).toBe(200);
    expect(stripDirectedDivergence(fresh)).toEqual(stripDirectedDivergence(legacy.body));
    // the CRM-only listing is absent in BOTH (DB layer down) — same degrade
    const ids = (fresh.activeUnits as Array<Record<string, unknown>>).map((u) => u.mlsId);
    expect(ids).not.toContain("SL-2001");
    expect(ids).toContain("TRE-500-S1");
  });

  it("NULL/ERROR parity — Cotality down: both serve the DB layer identically", async () => {
    const legacy = await legacyPayload("600");
    const fresh = await newPayload("600");
    expect(legacy.status).toBe(200);
    expect(stripDirectedDivergence(fresh)).toEqual(stripDirectedDivergence(legacy.body));
    const ids = (fresh.activeUnits as Array<Record<string, unknown>>).map((u) => u.mlsId);
    expect(ids).toContain("SL-2001");
    expect(ids).not.toContain("TRE-600-S1");
  });

  it("NULL/ERROR parity — both layers down: identical empty-building shape (ACRIS only)", async () => {
    const legacy = await legacyPayload("700");
    const fresh = await newPayload("700");
    expect(legacy.status).toBe(200);
    expect(stripDirectedDivergence(fresh)).toEqual(stripDirectedDivergence(legacy.body));
    expect((fresh.activeUnits as unknown[]).length).toBe(0);
  });

  it("buildingName decoration parity: bn= fills a missing name identically (post-cache in the new module)", async () => {
    // Trestle down for 600 → no BuildingName from feed; DB rows carry none.
    const legacy = await legacyPayload("600", "The Grand Alias");
    const fresh = await newPayload("600", "The Grand Alias");
    expect(stripDirectedDivergence(fresh)).toEqual(stripDirectedDivergence(legacy.body));
    expect(fresh.building.name).toBe("The Grand Alias");
  });

  it("Maya rule: rentals in a RENTAL BUILDING display 'Rental Building' on the card", async () => {
    const fresh = await newPayload("800");
    const rental = (fresh.activeUnits as Array<Record<string, any>>).find((u) => u.mlsId === "TRE-800-R1");
    expect(rental?.propertyType).toBe("Rental Building");
    // and ownership units in that scenario inherit the building form too
    const sale = (fresh.activeUnits as Array<Record<string, any>>).find((u) => u.mlsId === "TRE-800-S1");
    expect(sale?.propertyType).toBe("Rental Building");
  });

  it("metadata-driving fields match (name, counts the page/generateMetadata renders)", async () => {
    const { body } = await legacyPayload("400");
    const fresh = await newPayload("400");
    expect(fresh.building.name).toBe(body.building.name);
    expect(fresh.stats.totalActive).toBe(body.stats.totalActive);
    expect(fresh.stats.totalSales).toBe(body.stats.totalSales);
    expect(fresh.building.postalCode).toBe(body.building.postalCode);
  });
});
