/// <reference types="jest" />
/**
 * CANCELLATION DATE — ROUTE INTEGRATION (2026-08-20)
 *
 * `tests/runtime/crm-cancellation-date-form-chain.test.ts` proves the six links
 * now exist in `public/crm/SALE-FORM-REDESIGN.html` and that the form-shaped
 * payload clears `assertRlsCompliantPayload` in isolation. This file closes the
 * link a source audit cannot reach: the actual HTTP handler, invoked, with
 * Prisma and auth mocked (no DB, no network, no live Cotality call).
 *
 * The fixture is an OTHERWISE-COMPLETE RLS-eligible sale create — every field
 * `lib/compliance/rls-rules.json` marks required is filled, and every other
 * BLOCKER the gate raises on a Manhattan condo has been satisfied. That is what
 * makes the measurement sharp rather than merely true:
 *
 *   WITHOUT CancellationDate → 422, and CF-CANCELLED-001 is the *only* blocker
 *                              left. Nothing else stands between the agent and
 *                              a successful cancel; the missing form input is
 *                              the whole of the remaining distance.
 *   WITH    CancellationDate → the gate passes and `listing.create` runs, with
 *                              the value in `raw_data` verbatim and in NO typed
 *                              column — which is why this needs no migration.
 *
 * The canonical field name is cross-checked against the form's own collector
 * assignment, so the two files cannot drift into agreeing about nothing.
 */
import { readFileSync } from "fs";
import * as path from "path";

import { makeRequest, readJson } from "./helpers";
import { statusSpellings } from "@/lib/compliance/listing-status-vocabulary";
import rlsRules from "@/lib/compliance/rls-rules.json";

// ─── Prisma mock ────────────────────────────────────────────────────────────
// Hand-rolled rather than `buildPrismaMock()` because the create path runs
// inside `prisma.$transaction(tx => …)` and calls `tx.$executeRaw` /
// `tx.$queryRaw` for the advisory-locked listing-id sequence. The transaction
// callback must receive a client whose raw helpers answer, or the route fails
// at ID generation and never reaches the assertion this file exists to make.
const calls: Record<string, unknown[][]> = {};
function record(key: string, args: unknown[]) {
  (calls[key] ??= []).push(args);
}

function makeModel(model: string) {
  const cache: Record<string, unknown> = {};
  return new Proxy(cache, {
    get(target, method: string) {
      if (method in target) return target[method];
      const fn = jest.fn(async (...args: unknown[]) => {
        record(`${model}.${method}`, args);
        if (model === "agent" && method === "findUnique") {
          return {
            id: 1n,
            full_name: "Maya Allan",
            first_name: "Maya",
            last_name: "Allan",
            email: "broker@example.test",
            phone: "646-258-4460",
          };
        }
        if (method === "findMany") return [];
        if (method === "count") return 0;
        if (method === "create" || method === "update" || method === "upsert") {
          const data = (args[0] as { data?: Record<string, unknown> })?.data ?? {};
          return { id: 1n, listing_id: "SL-0001", ...data };
        }
        return null;
      });
      target[method] = fn;
      return fn;
    },
  });
}

const modelCache = new Map<string, unknown>();
const prismaMock: unknown = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === "$transaction") {
        return jest.fn(async (cb: unknown) =>
          typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prismaMock) : null,
        );
      }
      if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return jest.fn(async () => 0);
      // The listing-id sequence query. `max_seq: null` = no prior SL- rows.
      if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return jest.fn(async () => [{ max_seq: null }]);
      if (prop.startsWith("$")) return jest.fn(async () => null);
      if (!modelCache.has(prop)) modelCache.set(prop, makeModel(prop));
      return modelCache.get(prop);
    },
  },
);

jest.mock("@/lib/prisma", () => ({ __esModule: true, default: prismaMock }));
jest.mock("@/lib/auth/readonly-guard", () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock("@/lib/auth", () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: 1n, userType: "agent", role: "AGENT" })),
  isAuthError: () => false,
}));

import { POST } from "@/app/api/crm/listings/route";

// ─── Fixture ────────────────────────────────────────────────────────────────

const FORM_PATH = path.resolve(__dirname, "../../public/crm/SALE-FORM-REDESIGN.html");
const formSrc = readFileSync(FORM_PATH, "utf-8");

/** Both stored spellings of the cancel state, from the shared vocabulary. */
const CANCEL_SPELLINGS = statusSpellings("Cancelled");

/** Every field `rls-rules.json` marks unconditionally required. */
const REQUIRED_FIELDS = (rlsRules.fields as Array<{ field: string; requirements: string }>)
  .filter((f) => /^yes\b/i.test(String(f.requirements).trim()))
  .map((f) => f.field);

/**
 * The semantically meaningful values. Everything else is filled by `autofill`
 * below, so the fixture tracks `rls-rules.json` instead of going stale when a
 * field is added there.
 */
const EXPLICIT: Record<string, unknown> = {
  PropertyType: "Residential",
  PropertySubType: "Condominium",
  CommonInterest: "Condominium",
  ListingAgreement: "ExclusiveRightToSell",
  CoBrokeAgreement: "REBNY Universal Co-broke",
  UnparsedAddress: "400 East 90th Street, Apt 17C, New York, NY 10128",
  StreetNumber: "400",
  StreetName: "East 90th",
  City: "New York",
  CityRegion: "Manhattan",
  CountyOrParish: "New York",
  StateOrProvince: "NY",
  PostalCode: "10128",
  TaxLot: "56",
  YearBuilt: 1965,
  LivingArea: 850,
  LivingAreaUnits: "Square Feet",
  PercentOfCommonElements: 0.5,
  TaxMonthlyAmount: 900,
  AssociationFee: 1200,
  AssociationFeeFrequency: "Monthly",
  FlipTax: "2% of sale price",
  MaximumFinancingPercent: 80,
  MaximumFinancingRemarks: "Standard financing permitted.",
  TaxAbatementYN: false,
  SpecialListingConditions: "Standard",
  PropertyCondition: "Excellent",
  SponsorUnitYN: false,
  NewConstructionYN: false,
  NewDevelopmentYN: false,
  Concessions: "No",
  AttendanceType: ["Full-Time Doorman"],
  BuildingLaundryFeatures: ["Common Area"],
  BuildingPetsAllowed: ["Allowed"],
  SyndicateTo: ["Zillow"],
  PublicRemarks: "Sunny renovated one-bedroom near the park.",
  ListPrice: 1_250_000,
  OffMarketDate: "2026-08-01",
};

function autofill(field: string): unknown {
  if (field in EXPLICIT) return EXPLICIT[field];
  if (/YN$/.test(field)) return true;
  if (/Date$|Timestamp$/.test(field)) return "2026-08-01";
  if (/Total$|Price$|Area$|Elevators|Bathrooms|Bedrooms|Year|Number|Fee$|Amount$/.test(field)) return 1;
  return "X";
}

/** A complete, otherwise-compliant RLS cancel create in the CRM's own shape. */
function cancelCreateBody(spelling: string, extra: Record<string, unknown> = {}) {
  const body: Record<string, unknown> = { listing_type: "sale", type: "Sale", ...EXPLICIT };
  body.MlsStatus = spelling;
  for (const f of REQUIRED_FIELDS) if (body[f] === undefined) body[f] = autofill(f);
  return { ...body, ...extra };
}

type Blocker = { code: string; field?: string; severity?: string };
type Body = { error?: string; blockers?: Blocker[]; validation?: { errors?: string[] } };

function blockers(body: Body): Blocker[] {
  return body.blockers ?? [];
}

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
});

// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/crm/listings — the cancel create needs CancellationDate", () => {
  it("premise: the form emits canonical CancellationDate (chain link 4)", () => {
    // The route and the form must agree on the field NAME or this whole file is
    // measuring a payload no browser ever sends.
    expect(formSrc).toMatch(/data\.CancellationDate\s*=\s*data\.saleCancellationDate\s*\|\|/);
  });

  it("premise: the fixture is otherwise complete — nothing else fails validateListing", async () => {
    const res = await POST(
      makeRequest({ method: "POST", body: cancelCreateBody("Cancelled", { CancellationDate: "2026-08-01" }) }),
    );
    const json = await readJson<Body>(res);
    expect(json.validation?.errors ?? []).toEqual([]);
  });

  for (const spelling of CANCEL_SPELLINGS) {
    it(`FAIL-CLOSED — '${spelling}' with NO CancellationDate → 422, and it is the ONLY blocker`, async () => {
      const res = await POST(makeRequest({ method: "POST", body: cancelCreateBody(spelling) }));
      const json = await readJson<Body>(res);
      expect({
        spelling,
        status: res.status,
        blockers: blockers(json).map((b) => ({ code: b.code, field: b.field, severity: b.severity })),
      }).toEqual({
        spelling,
        status: 422,
        blockers: [{ code: "CF-CANCELLED-001", field: "CancellationDate", severity: "BLOCKER" }],
      });
      expect(calls["listing.create"]).toBeUndefined();
    });

    it(`FAIL-CLOSED — '${spelling}' with a BLANK CancellationDate → still the same 422`, async () => {
      // The repaired collector emits `data.saleCancellationDate || ''`, so an
      // untouched input arrives as an EMPTY STRING. rls-enforcement §8 treats ""
      // as missing. If that ever stopped holding, the new input would hand the
      // gate something that satisfies it while the agent typed nothing.
      const res = await POST(
        makeRequest({ method: "POST", body: cancelCreateBody(spelling, { CancellationDate: "" }) }),
      );
      const json = await readJson<Body>(res);
      expect({
        spelling,
        status: res.status,
        blockers: blockers(json).map((b) => b.code),
      }).toEqual({ spelling, status: 422, blockers: ["CF-CANCELLED-001"] });
      expect(calls["listing.create"]).toBeUndefined();
    });

    it(`UNBLOCKED — '${spelling}' WITH CancellationDate reaches listing.create`, async () => {
      const res = await POST(
        makeRequest({ method: "POST", body: cancelCreateBody(spelling, { CancellationDate: "2026-08-01" }) }),
      );
      const json = await readJson<Body>(res);
      expect({
        spelling,
        rejectedByGate: res.status === 422,
        blockers: blockers(json).map((b) => b.code),
      }).toEqual({ spelling, rejectedByGate: false, blockers: [] });
      expect(calls["listing.create"]).toBeDefined();
    });
  }

  it("PERSISTED — the value reaches listings.raw_data verbatim, with no typed column", async () => {
    await POST(
      makeRequest({ method: "POST", body: cancelCreateBody("Cancelled", { CancellationDate: "2026-08-01" }) }),
    );
    const createArgs = calls["listing.create"];
    expect(createArgs).toBeDefined();
    const data = (createArgs![0][0] as { data: Record<string, unknown> }).data;
    const raw = data.raw_data as Record<string, unknown>;
    expect(raw.CancellationDate).toBe("2026-08-01");
    // No column was invented for it — this is the whole no-migration claim.
    expect(data).not.toHaveProperty("cancellation_date");
    expect(data).not.toHaveProperty("CancellationDate");
    // And the CRM read path (GET → sanitizeForCRM → SALE_FIELD_MAP src:'raw')
    // reads exactly this key back. Pinned in the form-chain test, link 6.
  });
});
