/**
 * Live Cotality contract checks, run against a RECORDED live response fixture
 * (tests/fixtures/cotality-live-contract-2026-10-15.json = GET /odata/$metadata +
 * GET /odata/CustomProperty?$top=500&$select=ListingKey,CustomFields).
 * The integration run against the live API itself is separate (see the Form 1 progress log).
 */
import fixture from "../fixtures/cotality-live-contract-2026-10-15.json";
import {
  checkPayloadAgainstContract,
  parseMetadata,
  parseCustomKeys,
  __setCotalityContractForTest,
  type CotalityContract,
} from "@/lib/idx/cotality-contract";
import {
  buildMallanValidationView,
  validateListing,
  verifyAgainstLiveCotality,
} from "@/lib/compliance/rebny-validator";

const contract: CotalityContract = {
  fetchedAt: Date.now(),
  fields: new Map(Object.entries(fixture.fields as Record<string, { type: string; enumName?: string; multi?: boolean }>)),
  enums: new Map(Object.entries(fixture.enums as Record<string, string[]>).map(([k, v]) => [k, new Set(v)])),
  customKeys: new Set(fixture.customKeys as string[]),
};

describe("live Cotality contract (recorded fixture)", () => {
  it("accepts live fields, live enum members and observed CustomFields keys", () => {
    const f = checkPayloadAgainstContract(contract, {
      StandardStatus: "Active",
      MlsStatus: "Active",
      PropertyType: "Residential",
      PropertySubType: "Apartment",
      CommonInterest: "Condominium",
      View: ["Park", "ParkGreenbelt"].slice(1),
      UnparsedAddress: "100 Claremont Avenue #20B, New York, NY 10027",
      ElevatorsTotal: "2",
      BuildingTaxLot: "0123",
      saleBldgName: "ignored (Mallan-only, lower-case)",
    });
    expect(f).toEqual([]);
  });

  it("flags an invalid enum value (StandardStatus 'Draft')", () => {
    const f = checkPayloadAgainstContract(contract, { StandardStatus: "Draft" });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ field: "StandardStatus", problem: "invalid-value" });
  });

  it("flags invalid members of a multi-select picklist", () => {
    const f = checkPayloadAgainstContract(contract, { View: ["ParkGreenbelt", "RooftopsSky"] });
    expect(f.map((x) => x.detail).join()).toMatch(/RooftopsSky/);
    expect(f).toHaveLength(1);
  });

  it("flags a field that is not in Property $metadata and not an observed custom key", () => {
    const f = checkPayloadAgainstContract(contract, { BathroomsTotal: 2.5, CoBrokeAgreement: "Ucba" });
    expect(f.map((x) => x.field).sort()).toEqual(["BathroomsTotal", "CoBrokeAgreement"]);
    expect(f.every((x) => x.problem === "unknown-field")).toBe(true);
  });

  it("flags an unknown CustomFields-style key", () => {
    const f = checkPayloadAgainstContract(contract, { ElevatorsTotal: "1", TotallyMadeUpKeyYN: true });
    expect(f).toHaveLength(1);
    expect(f[0].field).toBe("TotallyMadeUpKeyYN");
  });

  it("parses $metadata and CustomFields samples", () => {
    const xml =
      '<Schema><EntityType Name="Property"><Property Name="X" Type="Edm.String"/><Property Name="V" Type="Cotality.DataStandard.RESO.DD.Enums.Multi.View"/></EntityType>' +
      '<EnumType Name="View" IsFlags="true"><Member Name="City"/></EnumType></Schema>';
    const m = parseMetadata(xml);
    expect(m.fields.get("V")).toMatchObject({ enumName: "View", multi: true });
    expect([...(m.enums.get("View") ?? [])]).toEqual(["City"]);
    expect([...parseCustomKeys({ value: [{ CustomFields: '{"A":"1"}' }, { CustomFields: "not json" }] })]).toEqual(["A"]);
  });
});

describe("REBNY rules evaluated against stamped, live-resolved fields", () => {
  const base = {
    StreetNumber: "100", StreetName: "Claremont", UnparsedAddress: "100 Claremont Avenue #20B, New York, NY 10027",
    BathroomsFull: 2, BathroomsHalf: 0,
  };
  it("stamps server-owned fields so the REBNY rules that require them still run on a stamped value", () => {
    const { view, skipRequired } = buildMallanValidationView(base, { listingId: "SL-0001", status: "Draft", createdAt: new Date("2026-10-15T00:00:00Z") });
    expect(view.StandardStatus).toBe("Incomplete");
    expect(view.SourceSystemKey).toBe("SL-0001");
    expect(view.OriginalEntryTimestamp).toBe("2026-10-15T00:00:00.000Z");
    expect(view.UnParsedAddress).toBe(base.UnparsedAddress);
    expect(view.BathroomsTotal).toBe(2);
    const r = validateListing(view, { skipRequired });
    const text = r.errors.join("\n");
    expect(text).not.toMatch(/Required field missing: (StandardStatus|SourceSystemKey|OriginalEntryTimestamp|UnParsedAddress|BathroomsTotal) /);
    // REBNY rules for fields the agent must supply are still evaluated
    expect(text).toMatch(/Required field missing: ListPrice/);
  });
  it("keeps Fair Housing flag-only on a draft but blocking otherwise", () => {
    const data = { ...base, PublicRemarks: "no children allowed" };
    expect(validateListing(data, { fairHousingAsWarning: true }).errors.join()).not.toMatch(/Fair Housing/);
    expect(validateListing(data).errors.join()).toMatch(/Fair Housing/);
  });
});

describe("verifyAgainstLiveCotality draft vs publish", () => {
  afterEach(() => __setCotalityContractForTest(null));
  it("draft: problems are warnings; publish: problems are errors", async () => {
    __setCotalityContractForTest(contract);
    const d = await verifyAgainstLiveCotality({ StandardStatus: "Draft" }, "draft");
    expect(d.errors).toEqual([]);
    expect(d.warnings).toHaveLength(1);
    const p = await verifyAgainstLiveCotality({ StandardStatus: "Draft" }, "publish");
    expect(p.errors).toHaveLength(1);
  });
  it("publish refuses (explicitly) when the contract is unreachable and the cache is cold", async () => {
    __setCotalityContractForTest(null);
    const saved = { id: process.env.IDX_CLIENT_ID, s: process.env.IDX_CLIENT_SECRET, k: process.env.IDX_API_KEY };
    delete process.env.IDX_CLIENT_ID; delete process.env.IDX_CLIENT_SECRET; delete process.env.IDX_API_KEY; delete process.env.IDX_API_SECRET;
    try {
      const p = await verifyAgainstLiveCotality({ StandardStatus: "Active" }, "publish");
      expect(p.unavailable).toBe(true);
      expect(p.errors[0]).toMatch(/Publishing is refused/);
      const d = await verifyAgainstLiveCotality({ StandardStatus: "Active" }, "draft");
      expect(d.errors).toEqual([]);
      expect(d.warnings[0]).toMatch(/verified when you publish/);
    } finally {
      if (saved.id) process.env.IDX_CLIENT_ID = saved.id;
      if (saved.s) process.env.IDX_CLIENT_SECRET = saved.s;
      if (saved.k) process.env.IDX_API_KEY = saved.k;
    }
  });
});
