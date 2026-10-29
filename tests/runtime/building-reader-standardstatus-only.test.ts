/// <reference types="jest" />
/**
 * BUILDING READER — StandardStatus-only status cutover (2026-10-02).
 *
 * lib/buildings/public-building-data.ts previously classified Cotality
 * records as active/closed, and built the unit-card status label, by
 * reading `r.MlsStatus || r.StandardStatus` (MlsStatus FIRST) and falling
 * back to a fabricated 'Active' when both were absent — the exact
 * disproven Status-substitution pattern already removed everywhere else
 * in this convergence (Master Plan §0.6: StandardStatus and MlsStatus are
 * independent RESO enums; neither derived from the other, never
 * substituted). This is a standalone, minimal-mock test: it does not reuse
 * tests/runtime/building-payload-parity.test.ts's fixtures/mocks, to keep
 * this one behavioral question isolated and easy to audit.
 *
 * Required behavior (Maya, 2026-10-02):
 *   - active classification reads StandardStatus only;
 *   - closed classification reads StandardStatus only;
 *   - output status reads StandardStatus only;
 *   - missing StandardStatus must NOT become Active;
 *   - MlsStatus is never substituted.
 */
import { NextRequest } from "next/server";

jest.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>) => fn,
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: { listing: { findMany: jest.fn(async () => []) } },
}));

jest.mock("@/lib/idx/auth", () => ({ getAccessToken: jest.fn(async () => "test-token") }));

jest.mock("@/lib/buildings/acris-building-sales", () => ({
  boroughFromPostalCode: jest.fn(() => "1"),
  lookupBBL: jest.fn(async () => null),
  fetchAcrisSales: jest.fn(async () => []),
}));

jest.mock("@/lib/buildings/upsert", () => ({
  upsertBuildingFromRecords: jest.fn(async () => {
    throw new Error("must never be called (BuildingKeyNumeric absent)");
  }),
}));

type Rec = Record<string, unknown>;

const BASE = {
  BuildingName: "Status Cutover Test Tower",
  CommonInterest: "Condominium",
  ListPrice: 1000000,
  BedroomsTotal: 2,
  BathroomsFull: 1,
  BathroomsHalf: 0,
  LivingArea: 900,
  PropertySubType: "Condominium",
  PropertyType: "Residential",
  ListOfficeName: "Test Brokerage LLC",
  Media: [],
};

let fixtureRecords: Rec[] = [];

beforeAll(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ value: fixtureRecords }),
  })) as unknown as typeof fetch;
});

const { getBuildingDataCached } = require("@/lib/buildings/public-building-data");

async function unitsFor(num: string, record: Rec) {
  fixtureRecords = [
    {
      ...BASE,
      ListingId: `TRE-SS-${num}`,
      ListingKey: `KEY-SS-${num}`,
      UnitNumber: `U${num}`,
      ...record,
    },
  ];
  const payload = await getBuildingDataCached({
    streetNumber: num,
    streetName: "Status Test Street",
    postalCode: "10099",
  });
  return payload.activeUnits as Array<{ mlsId: string; status: string }>;
}

describe("building reader — StandardStatus-only status cutover", () => {
  // Pending (not ComingSoon/Closed) deliberately: it is neither an
  // ACTIVE_DISPLAY_STATUSES member nor a TERMINAL_VALUES member, so these
  // two cases are resolved ONLY by this file's active/closed split and
  // can't be confounded by checkDistributionGates's separate terminal-
  // status pre-filter (which already reads StandardStatus correctly and
  // would otherwise mask what this fix is actually proving).
  it("StandardStatus='Pending', MlsStatus='Active' → NOT active (StandardStatus governs; old code read MlsStatus first and would wrongly include it)", async () => {
    const units = await unitsFor("910", { StandardStatus: "Pending", MlsStatus: "Active" });
    expect(units.find((u) => u.mlsId === "TRE-SS-910")).toBeUndefined();
  });

  it("StandardStatus='Active', MlsStatus='Pending' → active (StandardStatus governs; old code read MlsStatus first and would wrongly exclude it)", async () => {
    const units = await unitsFor("911", { StandardStatus: "Active", MlsStatus: "Pending" });
    const unit = units.find((u) => u.mlsId === "TRE-SS-911");
    expect(unit).toBeDefined();
    expect(unit?.status).toBe("Active");
  });

  it("StandardStatus='ActiveUnderContract', MlsStatus='Active' → active, AUC label preserved (not collapsed to Active)", async () => {
    const units = await unitsFor("912", { StandardStatus: "ActiveUnderContract", MlsStatus: "Active" });
    const unit = units.find((u) => u.mlsId === "TRE-SS-912");
    expect(unit).toBeDefined();
    expect(unit?.status).toBe("ActiveUnderContract");
  });

  it("StandardStatus absent, MlsStatus='Active' → NOT active (missing StandardStatus must never become Active)", async () => {
    const units = await unitsFor("913", { StandardStatus: null, MlsStatus: "Active" });
    expect(units.find((u) => u.mlsId === "TRE-SS-913")).toBeUndefined();
  });

  it("both StandardStatus and MlsStatus absent → NOT active (missing StandardStatus must never become Active)", async () => {
    const units = await unitsFor("914", { StandardStatus: null, MlsStatus: null });
    expect(units.find((u) => u.mlsId === "TRE-SS-914")).toBeUndefined();
  });
});
