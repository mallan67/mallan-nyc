/// <reference types="jest" />
/**
 * A listing's type decides which fields are live; the fields it does not use are LOCKED. Locking must never destroy what the agent entered.
 *
 * The contract these tests pin, through the REAL create / edit / read routes over an in-memory store (not a hand merge):
 *   - the agent's entries in a locked box are PRESERVED in the record (the form's own storage, raw_data, keyed by the box's own id), and come back when the type does;
 *   - a locked box is never sent as an instruction to clear (no blank value for it, no empty list for the provider field it feeds);
 *   - the canonical provider fields (the Cotality names) are emitted only from boxes that are live for the type, so a value that is not applicable never reaches the public record or the REBNY payload;
 *   - clearing is a separate, explicit act: an agent who empties a LIVE box does clear it.
 *
 * Found by review of 2fba14a3: the first version of the lock set the locked boxes aside as BLANKS while the form was read, so the PATCH merge ({ ...stored, ...body }) wrote "" over the stored value:
 * Co-op -> Condo -> Save -> Reload -> Co-op lost the shares.
 */
import { buildPrismaMock, makeRequest } from "./helpers";
import { bootAddForm, sleep, type BootedForm } from "./add-form-harness";
import { completeForm, waitUntil, pickRadio } from "./sale-form-filler";

// ── an in-memory listing table behind the REAL routes ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const { prisma: innerPrismaMock, calls } = buildPrismaMock();
const rows = new Map<string, any>();
let seq = 900;
const rawQuery = jest.fn(async () => [{ max_seq: rows.size }]);
const rawExecute = jest.fn(async (..._a: unknown[]) => 0);
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
jest.mock("@/lib/cache/public-cache", () => ({ __esModule: true, safeRevalidateTags: jest.fn(), listingCacheTag: (id: string) => `listing:${id}`, buildingAndManifestInvalidationTags: () => [], SEARCH_CACHE_TAG: "search" }));
jest.mock("@/lib/search/listing-search-projection", () => ({ __esModule: true, dualWriteProjectionForListingId: jest.fn(async () => undefined) }));
jest.mock("@/lib/notifications/engine", () => ({ __esModule: true, createNotification: jest.fn(async () => undefined) }));

import { POST } from "@/app/api/crm/listings/route";
import { GET, PATCH } from "@/app/api/crm/listings/[id]/route";
import { dbListingToPublicDTO } from "@/lib/idx/db-to-public-dto";

jest.setTimeout(400000);
/* eslint-disable @typescript-eslint/no-explicit-any */
type Mocked = { listing: Record<string, any> };
const m = () => prismaMock as unknown as Mocked;
const bodies: Array<{ method: string; body: Record<string, any> }> = [];

beforeEach(() => {
  rows.clear(); seq = 900; bodies.length = 0;
  for (const k of Object.keys(calls)) delete calls[k];
  m().listing.create = jest.fn(async ({ data }: { data: Record<string, any> }) => { const id = BigInt(++seq); const row = { created_at: new Date(), updated_at: new Date(), ...data, id }; rows.set(String(id), row); return row; });
  m().listing.update = jest.fn(async ({ where, data }: { where: { id: bigint; modification_timestamp?: Date }; data: Record<string, any> }) => {
    const row = rows.get(String(where.id));
    if (!row || (where.modification_timestamp && +where.modification_timestamp !== +row.modification_timestamp)) throw Object.assign(new Error("record not found"), { code: "P2025" });
    Object.assign(row, data, { updated_at: new Date() });
    return row;
  });
  m().listing.findUnique = jest.fn(async ({ where }: { where: { id?: bigint; listing_id?: string } }) => (where.id !== undefined ? rows.get(String(where.id)) : [...rows.values()].find((r) => r.listing_id === where.listing_id)) ?? null);
  m().listing.findFirst = jest.fn(async () => null);
  m().listing.findMany = jest.fn(async () => []);
});

// ── the form wired to the real routes ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const answer = async (res: Response) => {
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error || `refused (${res.status})`), { status: res.status, details: body, data: body });
  return body;
};
function wire(f: BootedForm) {
  const api = (f.w as any).MallanAPI.listings;
  api.create = async (payload: Record<string, any>) => { bodies.push({ method: "POST", body: payload }); return answer(await POST(makeRequest({ method: "POST", body: payload }))); };
  api.update = async (id: string, payload: Record<string, any>) => { bodies.push({ method: "PATCH", body: payload }); return answer(await PATCH(makeRequest({ method: "PATCH", body: payload }), { params: Promise.resolve({ id: String(id) }) })); };
  api.updateStatus = async () => ({});
}
const loadedForm = (f: BootedForm) => waitUntil(() => (f.w as any)._saleEditLoad === "loaded" && (f.w as any)._saleAutoSaveReady === true);
async function openNew(type: string, values: Record<string, string> = {}) {
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
  wire(f);
  await completeForm(f, { type, values });
  return f;
}
async function reopen(id: string) {
  const listing = await answer(await GET(makeRequest({ method: "GET" }), { params: Promise.resolve({ id }) }));          // what the form loads: the real read route
  const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, search: `?id=${id}`, listing });
  wire(f);
  await loadedForm(f);
  return f;
}
async function save(f: BootedForm) {
  const w: any = f.w; const before = bodies.length;
  w.parseSaleAddress?.();
  (f.d.getElementById("saleStatus") as HTMLSelectElement).value = "Draft";
  await w.submitSalesListing();
  await waitUntil(() => bodies.length > before && !w._saleSendInFlight);
  await sleep(250);
}
const type = (f: BootedForm, radio: string) => { pickRadio(f, "salePropertyType", radio); (f.w as any).applySalesFieldRules(); };
const box = (f: BootedForm, id: string) => f.d.getElementById(id) as HTMLInputElement;
const typeIn = (f: BootedForm, id: string, v: string) => { const el = box(f, id); el.value = v; el.dispatchEvent(new f.w.Event("input", { bubbles: true })); el.dispatchEvent(new f.w.Event("change", { bubbles: true })); };
const stored = (id: string) => rows.get(id)!;
const idOf = () => String([...rows.keys()][0]);
const payload = (f: BootedForm) => (f.w as any).collectSaleFormData();
const publicJson = (id: string) => JSON.stringify(dbListingToPublicDTO(stored(id) as any));

describe("Co-op -> Condo -> Save -> Reload -> Co-op", () => {
  it("keeps the co-op shares through a Condo save and brings them back; a co-op value never reaches the public record while it is a Condo", async () => {
    const f1 = await openNew("Coop", { saleUnitShares: "4417" });
    try {
      typeIn(f1, "saleUnitShares", "4417");
      await save(f1);
    } finally { f1.close(); }
    const id = idOf();
    expect(stored(id).raw_data.saleUnitShares).toBe("4417");

    const f2 = await reopen(id);
    try {
      expect(box(f2, "saleUnitShares").value).toBe("4417");
      type(f2, "Condo");
      expect(box(f2, "saleUnitShares").disabled).toBe(true);
      typeIn(f2, "salePercentCommon", "3.77");
      await save(f2);
      const patch = bodies[bodies.length - 1] ?? { body: {} };
    } finally { f2.close(); }

    // what the agent entered is still in the record, and the Condo save did not send the co-op box as a blank
    expect(stored(id).raw_data.saleUnitShares).toBe("4417");
    expect(stored(id).raw_data.salePercentCommon).toBe("3.77");
    const condoSaves = bodies.filter((b) => b.method === "PATCH" && "salePercentCommon" in b.body);
    expect(condoSaves.length).toBeGreaterThan(0);
    for (const b of condoSaves) expect(b.body.saleUnitShares).toBe("4417");                          // preserved as it was, never "" (an instruction to clear)
    expect(JSON.stringify(stored(id).features ?? {})).not.toContain("4417");                       // not applicable to a condo: nowhere in the provider fields
    expect(publicJson(id)).not.toContain("4417");

    const f3 = await reopen(id);
    try {
      expect(box(f3, "salePercentCommon").value).toBe("3.77");
      type(f3, "Coop");
      expect(box(f3, "saleUnitShares").value).toBe("4417");                                          // back again
      expect(box(f3, "saleUnitShares").disabled).toBe(false);
      expect(payload(f3).PercentOfCommonElements).toBeUndefined();                                  // a co-op does not send the condo-only provider field ...
      expect(payload(f3).salePercentCommon).toBe("3.77");                                           // ... and keeps the agent's entry
    } finally { f3.close(); }
  });
});

describe("Condo -> Co-op -> Save -> Reload -> Condo", () => {
  it("keeps the condo-only percent of common elements through a Co-op save and brings it back; the RE tax is not a co-op fact", async () => {
    const f1 = await openNew("Condo", { saleRETaxes: "18852" });
    try {
      typeIn(f1, "salePercentCommon", "3.77");
      typeIn(f1, "saleRETaxes", "18852");
      await save(f1);
    } finally { f1.close(); }
    const id = idOf();
    expect(stored(id).raw_data.salePercentCommon).toBe("3.77");

    const f2 = await reopen(id);
    try {
      type(f2, "Coop");
      expect(box(f2, "salePercentCommon").disabled).toBe(true);
      expect(box(f2, "saleRETaxes").disabled).toBe(true);
      typeIn(f2, "saleUnitShares", "4417");
      const p = payload(f2);
      expect(p.TaxAnnualAmount).toBeUndefined();                                                    // no canonical tax for a co-op
      expect(p.PercentOfCommonElements).toBeUndefined();
      expect(p.saleRETaxes).toBe("18852");                                                          // the agent's entry is kept
      await save(f2);
    } finally { f2.close(); }

    expect(stored(id).raw_data.salePercentCommon).toBe("3.77");
    expect(stored(id).raw_data.saleRETaxes).toBe("18852");
    expect(stored(id).raw_data.saleUnitShares).toBe("4417");
    expect(publicJson(id)).not.toContain("3.77");                                                       // a condo-only value does not reach the public record of a co-op
    expect(publicJson(id)).not.toContain("18852");
    expect(stored(id).features.TaxAnnualAmount).toBeUndefined();                                        // the provider fields that do not apply are REMOVED (an explicit instruction) ...
    expect(stored(id).features.PercentOfCommonElements).toBeUndefined();
    expect(stored(id).raw_data.TaxAnnualAmount).toBeUndefined();
    expect(stored(id).raw_data.saleRETaxes).toBe("18852");                                               // ... and the agent's own entries are not
    for (const b of bodies.filter((x) => x.method === "PATCH" && "saleUnitShares" in x.body)) {
      expect(b.body.salePercentCommon).toBe("3.77");
      expect(b.body.saleRETaxes).toBe("18852");
      expect(b.body.TaxAnnualAmount).toBeUndefined();
    }

    const f3 = await reopen(id);
    try {
      type(f3, "Condo");
      expect([box(f3, "salePercentCommon").value, box(f3, "saleRETaxes").value]).toEqual(["3.77", "18852"]);
      expect(payload(f3).TaxAnnualAmount).toBe(18852);
      await save(f3);
    } finally { f3.close(); }
    expect(stored(id).features.TaxAnnualAmount).toBe(18852);                                              // back with the type: the provider fields are emitted again from the live boxes
    expect(stored(id).features.PercentOfCommonElements).toBe(3.77);
    expect(publicJson(id)).toContain("18852");
  });

  it("clearing a box that is LIVE still clears it (deletion is the agent's explicit act, not a side effect of a type change)", async () => {
    const f1 = await openNew("Condo");
    try { typeIn(f1, "salePercentCommon", "3.77"); await save(f1); } finally { f1.close(); }
    const id = idOf();
    const f2 = await reopen(id);
    try { typeIn(f2, "salePercentCommon", ""); await save(f2); } finally { f2.close(); }
    expect(stored(id).raw_data.salePercentCommon).toBe("");
  });
});

describe("Commercial Condo -> change the classification -> Save -> Reload -> restore", () => {
  it("keeps a commercial building's own facts (zoning, lot) through a Commercial Condo save, which locks them, and restores them when the kind returns", async () => {
    let zoning = "";
    const f1 = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    wire(f1);
    try {
      await completeForm(f1, { type: "Commercial" });
      pickRadio(f1, "saleCommercialOwnership", "WholeBuilding");                                    // a commercial BUILDING asks for its own scale facts
      (f1.w as any).applySalesFieldRules();
      zoning = (box(f1, "saleCommercialZoning") as unknown as HTMLSelectElement).options[1].value;
      typeIn(f1, "saleCommercialZoning", zoning);
      typeIn(f1, "saleCommercialLotSize", "2500");
      await save(f1);
    } finally { f1.close(); }
    const id = idOf();
    expect(stored(id).raw_data.saleCommercialZoning).toBe(zoning);

    const f2 = await reopen(id);
    try {
      pickRadio(f2, "saleCommercialOwnership", "CommercialCondo");                                  // reclassified: one UNIT in a building
      (f2.w as any).applySalesFieldRules();
      expect(box(f2, "saleCommercialZoning").value).toBe(zoning);                                    // not cleared with the box
      expect(box(f2, "saleCommercialZoning").disabled).toBe(true);                                   // locked
      expect(payload(f2).saleCommercialZoning).toBe(zoning);                                         // kept in the record as the agent entered it
      await save(f2);
    } finally { f2.close(); }
    expect(stored(id).raw_data.saleCommercialZoning).toBe(zoning);
    expect(stored(id).raw_data.saleCommercialLotSize).toBe("2500");

    const f3 = await reopen(id);
    try {
      expect(box(f3, "saleCommercialZoning").value).toBe(zoning);
      pickRadio(f3, "saleCommercialOwnership", "WholeBuilding");
      (f3.w as any).applySalesFieldRules();
      expect(box(f3, "saleCommercialZoning").disabled).toBe(false);
      expect([box(f3, "saleCommercialZoning").value, box(f3, "saleCommercialLotSize").value]).toEqual([zoning, "2500"]);
    } finally { f3.close(); }
  });

  it("a Commercial Condo's classification and subtypes survive a change to Condo and back", async () => {
    const f1 = await bootAddForm("SALE-FORM-REDESIGN", { settle: 700 });
    wire(f1);
    try {
      await completeForm(f1, { type: "Commercial" });
      pickRadio(f1, "saleCommercialOwnership", "CommercialCondo");
      (f1.w as any).applySalesFieldRules();
      pickRadio(f1, "saleCommSubtype", "MedicalOffice");
      await save(f1);
    } finally { f1.close(); }
    const id = idOf();
    const f2 = await reopen(id);
    try { type(f2, "Condo"); await save(f2); } finally { f2.close(); }
    const f3 = await reopen(id);
    try {
      type(f3, "Commercial");
      const owned = (f3.d.querySelector('input[name="saleCommercialOwnership"]:checked') as HTMLInputElement | null)?.value;
      const subs = [...f3.d.querySelectorAll('input[name="saleCommSubtype"]:checked')].map((c) => (c as HTMLInputElement).value);
      expect({ owned, subs }).toEqual({ owned: "CommercialCondo", subs: ["MedicalOffice"] });
    } finally { f3.close(); }
  });
});

describe("conflicting living-area values", () => {
  const conflicting = (living_area: string | null) => ({
    id: "7", listing_id: "SL-0099", status: "Draft", listing_type: "sale", property_type: "Residential", living_area, address: {}, features: {}, agent_info: {}, media: [],
    raw_data: { salePropertyType: "Condo", saleUnitSqFt: "1000", saleLivingArea: "1482", saleInteriorSqFt: "1200" },
  });
  const open = async (listing: Record<string, any>) => { const f = await bootAddForm("SALE-FORM-REDESIGN", { settle: 800, search: "?id=7", listing }); await loadedForm(f); return f; };
  const three = (f: BootedForm) => ["saleInteriorSqFt", "saleUnitSqFt", "saleLivingArea"].map((id) => box(f, id).value);

  it("the typed canonical value wins on load: all three boxes show it, and it is what is sent", async () => {
    const f = await open(conflicting("1482"));
    try {
      expect(three(f)).toEqual(["1482", "1482", "1482"]);
      expect(payload(f).LivingArea).toBe(1482);
    } finally { f.close(); }
  });

  it("with no typed value, the box that is live for the type wins, and the three agree", async () => {
    const f = await open(conflicting(null));
    try {
      expect(new Set(three(f)).size).toBe(1);
      expect(payload(f).LivingArea).toBe(Number(three(f)[0]));
    } finally { f.close(); }
  });
});
