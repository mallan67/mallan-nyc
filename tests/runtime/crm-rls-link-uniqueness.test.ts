/// <reference types="jest" />
/**
 * One RLS ID, one Mallan listing (Maya, 2026-11-03).
 *
 * "Pull from Cotality" records the listing's Cotality ListingId (the RLS ID, RLS20123633) as raw_data.saleRlsId. The pull route answers "already linked" for a second pull, but two
 * tabs (or two agents) can pull the same RLS ID before either has saved. So the rule is enforced where the link is WRITTEN: POST /api/crm/listings and PATCH /api/crm/listings/:id
 * check inside their transaction, behind an advisory lock, and the second save is refused (409) with the listing that already holds the link.
 */
import { buildPrismaMock, makeRequest, readJson } from "./helpers";

const { prisma: innerPrismaMock, calls } = buildPrismaMock();
const rawQuery = jest.fn(async () => [{ max_seq: null }]);
const rawExecute = jest.fn(async (..._a: unknown[]) => 0);
const transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
const prismaMock: Record<string, unknown> = new Proxy(innerPrismaMock as unknown as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return rawQuery;
    if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return rawExecute;
    if (prop === "$transaction") return transaction;
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

import { POST } from "@/app/api/crm/listings/route";
import { PATCH } from "@/app/api/crm/listings/[id]/route";
import { rlsLinkOf } from "@/lib/listings/rls-link";

type Mocked = { listing: Record<string, jest.Mock> };
const m = () => prismaMock as unknown as Mocked;

const draft = {
  listing_type: "sale", listingAgreement: "ExclusiveRightToSell", status: "Draft", ListPrice: 1200000,
  StreetNumber: "800", StreetName: "2nd", StreetSuffix: "Avenue", UnitNumber: "806", City: "New York", StateOrProvince: "NY",
  PropertyType: "Residential", PropertySubType: "Condominium",
};

function crmListing(overrides: Record<string, unknown> = {}) {
  return {
    id: BigInt(901), listing_id: "SL-0901", mls_id: null, agent_id: "agent-1", owner_client_id: null, status: "Draft", listing_type: "sale", rls_eligible: true,
    list_price: 1200000, living_area: null, bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, property_type: "Residential", property_sub_type: "Condominium",
    raw_data: { ListPrice: 1200000, StreetNumber: "800", StreetName: "2nd", PublicRemarks: "Bright two bedroom." }, features: {}, address: { StreetNumber: "800", StreetName: "2nd" },
    media: [], internet_entire_listing_display_yn: true, internet_address_display_yn: true, internet_automated_valuation_display_yn: true, internet_consumer_comment_yn: true,
    participant_only: false, owner_opt_out: false, status_changed_at: null, first_active_date: null, days_on_market: 0, expiration_date: null, last_synced_from_trestle: null,
    created_at: new Date("2026-03-01T00:00:00Z"), updated_at: new Date("2026-03-02T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  rawExecute.mockClear();
  transaction.mockClear();
  m().listing.create = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...crmListing(), ...args.data, id: BigInt(901) }));
  m().listing.findMany = jest.fn(async () => []);
  m().listing.findUnique = jest.fn(async () => crmListing());
  m().listing.findFirst = jest.fn(async () => null);
});

const taken = () => { m().listing.findFirst = jest.fn(async () => ({ id: BigInt(9), listing_id: "SL-0009" })); };
const patch = (body: Record<string, unknown>) => PATCH(makeRequest({ method: "PATCH", body }), { params: Promise.resolve({ id: "SL-0901" }) });
const lockCalls = () => rawExecute.mock.calls.filter((c) => /pg_advisory_xact_lock/.test((c[0] as TemplateStringsArray).join("?")));

describe("rlsLinkOf — what counts as an RLS ID", () => {
  it("reads RLS20123633 in any case and with spaces, and nothing at all as no link", () => {
    expect(rlsLinkOf({ saleRlsId: " rls20123633 " })).toEqual({ rls: "RLS20123633" });
    for (const none of [{}, { saleRlsId: "" }, { saleRlsId: "  " }, { saleRlsId: null }]) expect(rlsLinkOf(none)).toEqual({ rls: null });
  });
  it("the ListingKey (1194314473), a Mallan SL ID and free text are not RLS IDs", () => {
    for (const bad of ["1194314473", "SL-0009", "RLS", "RLS12", "RLS1234567890123", "RLS2012363X", "hello"]) expect(rlsLinkOf({ saleRlsId: bad }).error).toMatch(/RLS ID/);
  });
});

describe("POST /api/crm/listings — creating a listing that carries an RLS link", () => {
  it("a free RLS ID is saved (upper case) after the check ran behind a lock inside the transaction", async () => {
    const res = await POST(makeRequest({ method: "POST", body: { ...draft, saleRlsId: "rls20123633", saleRlsListingKey: "1194314473" } }));
    expect(res.status).toBe(201);
    const data = m().listing.create.mock.calls[0][0].data as { raw_data: Record<string, unknown> };
    expect(data.raw_data.saleRlsId).toBe("RLS20123633");
    expect(m().listing.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ listing_id: { startsWith: "SL-" }, raw_data: { path: ["saleRlsId"], equals: "RLS20123633" } }),
    }));
    expect(lockCalls().length).toBeGreaterThanOrEqual(2);                          // the listing-id lock and the RLS-link lock
  });

  it("an RLS ID another Mallan listing already holds is refused (409) with that listing named, and nothing is created", async () => {
    taken();
    const res = await POST(makeRequest({ method: "POST", body: { ...draft, saleRlsId: "RLS20123633" } }));
    expect(res.status).toBe(409);
    const json = await readJson<{ error: string; existing: { id: string; listing_id: string } }>(res);
    expect(json.existing).toEqual({ id: "9", listing_id: "SL-0009" });
    expect(json.error).toMatch(/RLS20123633 is already linked to SL-0009/);
    expect(m().listing.create).not.toHaveBeenCalled();
  });

  it("something that is not an RLS ID is refused (400) before anything is written", async () => {
    const res = await POST(makeRequest({ method: "POST", body: { ...draft, saleRlsId: "1194314473" } }));
    expect(res.status).toBe(400);
    expect(m().listing.create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("a listing without an RLS link costs no extra lookup or lock", async () => {
    const res = await POST(makeRequest({ method: "POST", body: draft }));
    expect(res.status).toBe(201);
    expect(m().listing.findFirst).not.toHaveBeenCalled();
    expect(lockCalls().length).toBe(1);                                            // only the listing-id lock
  });
});

describe("PATCH /api/crm/listings/:id — saving a listing that carries an RLS link", () => {
  it("linking a free RLS ID checks the other listings, excluding this one, inside the update's transaction", async () => {
    const res = await patch({ saleRlsId: "RLS20123633", saleRlsListingKey: "1194314473" });
    expect(res.status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(m().listing.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { not: BigInt(901) }, raw_data: { path: ["saleRlsId"], equals: "RLS20123633" } }),
    }));
    expect(lockCalls().length).toBe(1);
    expect((m().listing.update.mock.calls[0][0].data as { raw_data: Record<string, unknown> }).raw_data.saleRlsId).toBe("RLS20123633");
  });

  it("an RLS ID another listing holds is refused (409) and this listing is not changed", async () => {
    taken();
    const res = await patch({ saleRlsId: "RLS20123633" });
    expect(res.status).toBe(409);
    expect((await readJson<{ existing: { listing_id: string } }>(res)).existing.listing_id).toBe("SL-0009");
    expect(m().listing.update).not.toHaveBeenCalled();
  });

  it("saving a listing that already carries its own RLS ID again is an ordinary save: no check, no lock, no transaction", async () => {
    m().listing.findUnique = jest.fn(async () => crmListing({ raw_data: { ListPrice: 1200000, saleRlsId: "RLS20123633" } }));
    taken();                                                                       // would be refused if the check ran
    const res = await patch({ saleRlsId: "RLS20123633", PublicRemarks: "Bright two bedroom with a terrace." });
    expect(res.status).toBe(200);
    expect(m().listing.findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("an edit without any RLS link is an ordinary save", async () => {
    const res = await patch({ PublicRemarks: "Bright two bedroom with a terrace." });
    expect(res.status).toBe(200);
    expect(m().listing.findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("something that is not an RLS ID is refused (400)", async () => {
    expect((await patch({ saleRlsId: "SL-0009" })).status).toBe(400);
    expect(m().listing.update).not.toHaveBeenCalled();
  });
});

// ── Two saves at the same moment ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The checks above prove the route asks, behind a lock, inside its transaction. This proves the RACE: an in-memory store with a real queued lock (the way pg_advisory_xact_lock
// serialises transactions: the second waits until the first has committed), reads and writes that take time, and two requests released together.
const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("two saves of the same RLS ID at the same moment", () => {
  type Row = { id: bigint; listing_id: string; raw_data: Record<string, unknown> };
  let store: Row[];

  function installStore(rows: Row[], locking: boolean) {
    store = rows;
    const chain = new Map<number, Promise<void>>();
    transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const releases: Array<() => void> = [];
      const tx = new Proxy(prismaMock, {
        get(target, prop: string) {
          if (prop === "$executeRaw") {
            return async (_strings: TemplateStringsArray, lockId: number) => {
              if (!locking) return 0;
              const prev = chain.get(lockId) ?? Promise.resolve();
              let release!: () => void;
              chain.set(lockId, new Promise<void>((r) => (release = r)));
              await prev;                                    // wait for the holder's transaction to end
              releases.push(release);
              return 0;
            };
          }
          return target[prop];
        },
      });
      try { return await cb(tx); } finally { releases.forEach((r) => r()); }   // the lock is released when the transaction ends
    });
    m().listing.findFirst = jest.fn(async (args: { where: { raw_data: { equals: string }; id?: { not: bigint } } }) => {
      await nap(10);
      return store.find((r) => r.listing_id.startsWith("SL-") && r.raw_data.saleRlsId === args.where.raw_data.equals && (!args.where.id || r.id !== args.where.id.not)) ?? null;
    });
    m().listing.findUnique = jest.fn(async (args: { where: { id?: bigint; listing_id?: string } }) => {
      const r = store.find((x) => (args.where.id !== undefined ? x.id === args.where.id : x.listing_id === args.where.listing_id));
      return r ? crmListing({ id: r.id, listing_id: r.listing_id, raw_data: r.raw_data }) : null;
    });
    m().listing.create = jest.fn(async (args: { data: Record<string, any> }) => {
      await nap(20);
      const row = { id: BigInt(1000 + store.length), listing_id: String(args.data.listing_id), raw_data: args.data.raw_data as Record<string, unknown> };
      store.push(row);
      return { ...crmListing(), ...args.data, id: row.id };
    });
    m().listing.update = jest.fn(async (args: { where: { id: bigint }; data: Record<string, any> }) => {
      await nap(20);
      const row = store.find((x) => x.id === args.where.id)!;
      if (args.data.raw_data) row.raw_data = args.data.raw_data;
      return { ...crmListing({ id: row.id, listing_id: row.listing_id }), ...args.data, id: row.id };
    });
  }
  afterEach(() => { transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock)); });

  const linked = () => store.filter((r) => r.raw_data.saleRlsId === "RLS20123633");
  const create = () => POST(makeRequest({ method: "POST", body: { ...draft, saleRlsId: "RLS20123633" } }));
  const link = (id: string) => PATCH(makeRequest({ method: "PATCH", body: { saleRlsId: "RLS20123633" } }), { params: Promise.resolve({ id }) });
  const row = (id: number, raw: Record<string, unknown> = {}): Row => ({ id: BigInt(id), listing_id: `SL-0${id}`, raw_data: { ListPrice: 1200000, ...raw } });

  it("control: with no lock, two tabs creating at once both get through (the race is real in this setup)", async () => {
    installStore([], false);
    const statuses = (await Promise.all([create(), create()])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201]);
    expect(linked().length).toBe(2);
  });

  it("two creates at once: exactly one is saved, the other is refused (409) and names the winner", async () => {
    installStore([], true);
    const [a, b] = await Promise.all([create(), create()]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(linked().length).toBe(1);
    const loser = a.status === 409 ? a : b;
    expect((await readJson<{ existing: { listing_id: string } }>(loser)).existing.listing_id).toBe(linked()[0].listing_id);
  });

  it("three creates at once: still exactly one", async () => {
    installStore([], true);
    const statuses = (await Promise.all([create(), create(), create()])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
    expect(linked().length).toBe(1);
  });

  it("control: with no lock, two listings linking the same RLS ID at once both get through", async () => {
    installStore([row(901), row(902)], false);
    const statuses = (await Promise.all([link("901"), link("902")])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200]);
    expect(linked().length).toBe(2);
  });

  it("two different listings linking the same RLS ID at once: exactly one is linked, the other is refused (409)", async () => {
    installStore([row(901), row(902)], true);
    const statuses = (await Promise.all([link("901"), link("902")])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(linked().length).toBe(1);
  });

  it("a create and an edit at the same moment: one wins, never both", async () => {
    installStore([row(901)], true);
    const statuses = (await Promise.all([create(), link("901")])).map((r) => r.status).sort();
    expect(statuses[1]).toBe(409);                                            // 200 or 201 for the winner, 409 for the loser
    expect([200, 201]).toContain(statuses[0]);
    expect(linked().length).toBe(1);
  });
});
