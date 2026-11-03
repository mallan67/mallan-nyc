/// <reference types="jest" />
/**
 * The Sale form's Active checklist against the BACKEND's actual publish contract (Maya + review, 2026-11-02).
 *
 * Method: drive the REAL Sale form, post what it really posts (submitSalesListing -> MallanAPI.listings.create), and feed that payload to the REAL backend: the REBNY
 * validator the status route uses (validateListing + publishBlockingErrors) and the real PATCH /api/crm/listings/[id]/status handler. Nothing here asserts a message the
 * browser shows; it asserts what the server accepts or refuses.
 *
 * Found this way (and now in the form's checklist): Unit / Apt Number, Total Units in the building, Annual RE Taxes for a condo, a real answer to the garage question
 * (GarageYN is required to publish and is not one of the 5 fields the system writes), and a condo's OWN tax lot.
 */
import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: innerPrismaMock, calls } = buildPrismaMock();
const rawQuery = jest.fn(async () => [{ max_seq: null }]);
const rawExecute = jest.fn(async () => 0);
const prismaMock: Record<string, unknown> = new Proxy(innerPrismaMock as unknown as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return rawQuery;
    if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return rawExecute;
    if (prop === "$transaction") return jest.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
    return target[prop];
  },
});
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));
jest.mock("@/lib/auth/readonly-guard", () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: "agent-1", userType: "agent", role: "BROKER" })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock("@/lib/cache/public-cache", () => ({
  __esModule: true,
  safeRevalidateTags: jest.fn(),
  listingCacheTag: (id: string) => `listing:${id}`,
  buildingAndManifestInvalidationTags: () => [],
  SEARCH_CACHE_TAG: "search",
}));
jest.mock("@/lib/search/listing-search-projection", () => ({ __esModule: true, dualWriteProjectionForListingId: jest.fn(async () => undefined) }));
jest.mock("@/lib/notifications/engine", () => ({ __esModule: true, createNotification: jest.fn(async () => undefined) }));

import { PATCH as STATUS_PATCH } from "@/app/api/crm/listings/[id]/status/route";
import { POST as CREATE_POST } from "@/app/api/crm/listings/route";
import { validateListing, publishBlockingErrors } from "@/lib/compliance/rebny-validator";
import { REBNY_FIELD_TABLES } from "@/lib/compliance/rebny-field-tables";
import { postedByTheForm } from "./sale-form-filler";

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const systemGenerated = (REBNY_FIELD_TABLES as any).requiredFields.systemGenerated as string[];
const backendBlocking = (body: Record<string, unknown>, status = "Active") =>
  publishBlockingErrors(validateListing({ ...body, MlsStatus: status } as any), systemGenerated)
    .filter((e) => /Required field missing|Conditional field required/.test(e));
const mentions = (errs: string[], field: string) => errs.some((e) => new RegExp(`\\b${field}\\b`).test(e));

describe("the form's checklist and the backend's publish contract agree", () => {
  it("a complete condo: the checklist is satisfied AND the backend finds nothing required missing", async () => {
    const r = await postedByTheForm();
    expect(r.errors).toEqual([]);
    expect(r.gate).toEqual([]);
    expect(backendBlocking(r.body)).toEqual([]);
  });

  it("an answered GarageYN = false (No chosen) satisfies both: the form sends false and the backend accepts it", async () => {
    const r = await postedByTheForm({ garage: "No" });
    expect(r.body.GarageYN).toBe(false);
    expect(r.gate).toEqual([]);
    expect(mentions(backendBlocking(r.body), "GarageYN")).toBe(false);
  });

  it("an unanswered garage: the checklist names it AND the backend would refuse (GarageYN is required to publish)", async () => {
    const r = await postedByTheForm({ garage: "unanswered" });
    expect(r.gate).toContain("Garage Spaces Assigned (answer Yes or No)");
    expect(r.body).not.toHaveProperty("GarageYN");
    expect(mentions(backendBlocking(r.body), "GarageYN")).toBe(true);
  });

  it("a condo with only the building's lot: the checklist asks for the unit lot AND the backend refuses (TaxLot)", async () => {
    const r = await postedByTheForm({ omit: ["saleUnitTaxLot"] });
    expect(r.gate).toContain("Tax Lot (unit)");
    expect(r.body.TaxLot || "").toBe("");
    expect(r.body.BuildingTaxLot).toBe("7502");
    expect(mentions(backendBlocking(r.body), "TaxLot")).toBe(true);
  });

  it.each([
    ["Unit / Apt Number", "saleUnitNumber", "UnitNumber"],
    ["Total Units in Building", "saleBldgTotalUnits", "NumberOfUnitsTotal"],
    ["Annual RE Taxes", "saleRETaxes", "TaxAnnualAmount"],
  ])("%s: when it is empty the checklist names it AND the backend refuses (%s)", async (label, id, field) => {
    const r = await postedByTheForm({ omit: [id] });
    expect(r.gate).toContain(label);
    expect(mentions(backendBlocking(r.body), field)).toBe(true);
  });
});

describe("the real PATCH /api/crm/listings/[id]/status transition on what the form posted", () => {
  function listingRow(raw: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
    return {
      id: BigInt(901), listing_id: "SL-0901", mls_id: null, agent_id: "agent-1", status: "Draft", listing_type: "sale", rls_eligible: true,
      raw_data: raw, features: null, address: { StreetNumber: raw.StreetNumber, StreetName: raw.StreetName },
      internet_entire_listing_display_yn: true, internet_address_display_yn: true, internet_automated_valuation_display_yn: true, internet_consumer_comment_yn: true,
      participant_only: false, owner_opt_out: false, status_changed_at: null, first_active_date: null, days_on_market: 0, expiration_date: null, ...overrides,
    };
  }
  const transition = async (raw: Record<string, unknown>, to: string, overrides: Record<string, unknown> = {}) => {
    delete calls["listing.update"];
    (prismaMock as any).listing.findUnique = jest.fn(async () => listingRow(raw, overrides));
    const res = await STATUS_PATCH(makeRequest({ method: "PATCH", body: { status: to } }), { params: Promise.resolve({ id: "901" }) });
    return { res, json: await readJson<{ error?: string; validation?: { errors: string[] } }>(res) };
  };

  it("Draft -> Active with everything the checklist asks for: the server accepts and updates", async () => {
    const { body } = await postedByTheForm();
    const { res } = await transition(body, "Active");
    expect(res.status).toBe(200);
    expect(calls["listing.update"]?.length ?? 0).toBe(1);
  });

  it("Draft -> Active without the garage answer: the server refuses (422) and names GarageYN; nothing is updated", async () => {
    const { body } = await postedByTheForm({ garage: "unanswered" });
    const { res, json } = await transition(body, "Active");
    expect(res.status).toBe(422);
    expect((json.validation?.errors ?? []).some((e) => /GarageYN/.test(e))).toBe(true);
    expect(calls["listing.update"]).toBeUndefined();
  });

  it("Draft -> Active for a condo with no unit tax lot: refused (422), TaxLot named", async () => {
    const { body } = await postedByTheForm({ omit: ["saleUnitTaxLot"] });
    const { res, json } = await transition(body, "Active");
    expect(res.status).toBe(422);
    expect((json.validation?.errors ?? []).some((e) => /TaxLot/.test(e))).toBe(true);
    expect(calls["listing.update"]).toBeUndefined();
  });

  it("Draft -> ComingSoon is gated the same way (incomplete: refused)", async () => {
    const { body } = await postedByTheForm({ garage: "unanswered" });
    const { res } = await transition(body, "ComingSoon");
    expect(res.status).toBe(422);
  });

  it("a move back to Draft (from Hold) is never gated, however incomplete", async () => {
    const { body } = await postedByTheForm({ garage: "unanswered", omit: ["saleUnitTaxLot"] });
    const { res } = await transition(body, "Draft", { status: "Hold" });
    expect(res.status).toBe(200);
  });

  it("an InHouse / internal-only listing (rls_eligible = false, not on RLS) is not REBNY-gated at Active", async () => {
    const { body } = await postedByTheForm({ garage: "unanswered", omit: ["saleUnitTaxLot"] });
    const { json } = await transition(body, "Active", { rls_eligible: false });
    expect(json.error ?? "").not.toMatch(/REBNY/i);
    expect(calls["listing.update"]?.length ?? 0).toBe(1);
  });
});

describe("the real POST /api/crm/listings stores what the real form posted (SL-0009 was found with no address, unit or price)", () => {
  it("a completed condo: the row created carries the address, the unit, the price, the two tax lots and the garage answer", async () => {
    const { body } = await postedByTheForm({ garage: "No" });
    const create = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: BigInt(901), ...args.data }));
    (prismaMock as any).listing.create = create;
    const res = await CREATE_POST(makeRequest({ method: "POST", body }));
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data as Record<string, any>;
    const address = JSON.stringify(data.address ?? {});
    expect(address).toMatch(/800/);
    expect(address).toMatch(/806/);
    expect(address).toMatch(/10017/);
    expect(Number(data.list_price)).toBe(1200000);
    const raw = (data.raw_data ?? {}) as Record<string, any>;
    expect(String(raw.TaxLot)).toBe("1218");
    expect(String(raw.BuildingTaxLot)).toBe("7502");
    expect(raw.GarageYN).toBe(false);
    expect(data.status).toBe("Draft");
  });
});

describe("every property type: form -> real create route -> real status route to Active (sweep)", () => {
  // the Sale form's Property Type choices (the in-house listing types are exempt by design and covered in the gate tests)
  const TYPES = ["Condo", "Coop", "Condop", "SingleFamilyTownhouse", "MultiFamilyTownhouse", "SingleFamily", "MultiFamily", "MixedUse", "Loft", "Duplex", "Triplex", "Quadruplex", "Office", "Retail", "Land", "DeededParking", "Commercial"];

  /** The row the create route stored, read back by the status route, then moved to `to`. */
  async function toStatus(body: Record<string, any>, to: string) {
    const create = jest.fn(async (args: { data: Record<string, unknown> }) => ({ id: BigInt(901), ...args.data }));
    (prismaMock as any).listing.create = create;
    const created = await CREATE_POST(makeRequest({ method: "POST", body }));
    expect(created.status).toBe(201);
    const data = create.mock.calls[0][0].data as Record<string, any>;
    (prismaMock as any).listing.findUnique = jest.fn(async () => ({
      id: BigInt(901), listing_id: "SL-0901", mls_id: null, agent_id: "agent-1", listing_type: "sale", features: null, owner_opt_out: false, participant_only: false,
      status_changed_at: null, first_active_date: null, days_on_market: 0, expiration_date: null,
      internet_entire_listing_display_yn: true, internet_address_display_yn: true, internet_automated_valuation_display_yn: true, internet_consumer_comment_yn: true,
      ...data, status: "Draft",
    }));
    delete calls["listing.update"];
    const res = await STATUS_PATCH(makeRequest({ method: "PATCH", body: { status: to } }), { params: Promise.resolve({ id: "901" }) });
    const json = await readJson<{ error?: string; validation?: { errors: string[] } }>(res);
    return { http: res.status, rlsEligible: data.rls_eligible, refusals: (json.validation?.errors ?? []).filter((e) => /Required field missing|Conditional field required/.test(e)).map((e) => e.replace(/^\[REBNY\] /, "").replace(/ - .*/, "")) };
  }

  it.each(TYPES)("%s: a form that satisfies the checklist is not refused by the server for a missing required field", async (type) => {
    const r = await postedByTheForm({ type, garage: "No" });
    const out = await toStatus(r.body, "Active");
    expect(`${type}: checklist-still-asks=[${r.gate.join("; ")}] server-refuses=[${out.refusals.join("; ")}]`).toBe(`${type}: checklist-still-asks=[] server-refuses=[]`);
  });

  it("Draft -> ComingSoon: a form that satisfies the checklist for ComingSoon is not refused for a missing field", async () => {
    const r = await postedByTheForm({ type: "Condo", garage: "No", status: "ComingSoon" });
    const out = await toStatus(r.body, "ComingSoon");
    expect(`checklist-still-asks=[${r.gate.join("; ")}] server-refuses=[${out.refusals.join("; ")}]`).toBe("checklist-still-asks=[] server-refuses=[]");
  });
});
