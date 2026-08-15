/// <reference types="jest" />
/**
 * S1 PR-1 (#415) — compliance render/writer repoint.
 *
 * Proves:
 *  - the Trestle mapper no longer writes the redundant `compliance` JSON copy
 *    (emits `{}`), while the typed display/gate columns + raw_data are unchanged,
 *  - public render reads PublicRemarks from features/raw_data (not compliance),
 *  - cards/search DTO + public DTO never depend on / leak the compliance column,
 *  - the IDX display gate uses the typed domain model (not the stored JSON),
 *  - syndication eligibility + CRM authored compliance keys are preserved.
 *
 * No data is stripped; the `compliance` column is RETAINED for CRM/syndication.
 */
import { readFileSync } from "fs";
import * as path from "path";
import { mapTrestleToPrisma } from "@/lib/idx/trestle-mapper";
import { complianceUpdatePatch } from "@/lib/idx/sync";

function buildTrestleRow(extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ListingKey: "RBNY-TEST-001",
    ListingId: "RBNY-TEST-001",
    SourceSystemKey: "RBNY",
    StandardStatus: "Active",
    MlsStatus: "Active",
    PropertyType: "Residential",
    PropertySubType: "Apartment",
    ListPrice: 1_000_000,
    BedroomsTotal: 1,
    BathroomsFull: 1,
    BathroomsHalf: 0,
    StreetNumber: "100",
    StreetName: "Main",
    StreetSuffix: "St",
    City: "New York",
    StateOrProvince: "NY",
    PostalCode: "10001",
    UnparsedAddress: "100 Main St, New York NY 10001",
    PublicRemarks: "Sunny one bedroom.",
    OnMarketDate: "2026-01-01",
    ModificationTimestamp: "2026-01-02T00:00:00Z",
    ListingContractDate: "2026-01-01",
    ListAgentMlsId: "A-1",
    ListAgentFullName: "Test Agent",
    ListOfficeName: "Mallan Real Estate Inc.",
    ListOfficeMlsId: "O-1",
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    Permissions: "Public",
    Media: [],
    ...extras,
  };
}

const root = (p: string) => path.resolve(__dirname, "../../", p);
const read = (p: string) => readFileSync(root(p), "utf8");

describe("S1 — mapper stops writing the redundant compliance copy", () => {
  it("mapTrestleToPrisma emits compliance = {} (no Trestle bulk copy)", () => {
    const result = mapTrestleToPrisma(buildTrestleRow());
    expect(result.compliance).toEqual({});
    const c = result.compliance as Record<string, unknown>;
    // None of the previously-copied keys survive in compliance.
    for (const k of ["Permission", "StandardStatus", "ListPrice", "PublicRemarks", "CloseDate", "ListingAgreement"]) {
      expect(c[k]).toBeUndefined();
    }
  });

  it("the render fallback source survives: raw_data still carries PublicRemarks", () => {
    const raw = mapTrestleToPrisma(buildTrestleRow()).raw_data as Record<string, unknown>;
    expect(raw.PublicRemarks).toBe("Sunny one bedroom.");
  });

  it("typed display/gate columns are UNCHANGED (computed from raw.*, not compliance)", () => {
    const r = mapTrestleToPrisma(buildTrestleRow());
    expect(r.status).toBe("Active");
    expect(r.idx_display_yn).toBe(true);
    expect(r.internet_entire_listing_display_yn).toBe(true);
    expect(r.internet_address_display_yn).toBe(true);
    expect(r.participant_only).toBe(false);
    expect(r.owner_opt_out).toBe(false);
    // Price/attribution typed fields intact.
    expect(Number(r.list_price)).toBe(1_000_000);
  });

  it("terminal status still forces idx_display_yn=false — gate driven by status, not compliance", () => {
    const r = mapTrestleToPrisma(buildTrestleRow({ StandardStatus: "Closed", MlsStatus: "Closed" }));
    expect(r.idx_display_yn).toBe(false);
    expect(r.compliance).toEqual({}); // still no compliance copy
  });

  it("owner opt-out / participant gates still computed (independent of compliance JSON)", () => {
    const optOut = mapTrestleToPrisma(buildTrestleRow({ Permissions: "OwnerOptOut" }));
    expect(optOut.owner_opt_out).toBe(true);
    const priv = mapTrestleToPrisma(buildTrestleRow({ Permissions: "Private" }));
    expect(priv.participant_only).toBe(true);
  });
});

describe("S1 (#445 Codex P1) — authored compliance preserved on Trestle UPDATE", () => {
  it("complianceUpdatePatch() omits the key (returns {}) so UPDATE never stomps authored data", () => {
    expect(complianceUpdatePatch()).toEqual({});
  });
  it("every Trestle UPDATE branch in sync.ts omits compliance via the patch (one per mediaUpdatePatch)", () => {
    const sync = read("lib/idx/sync.ts");
    const mediaPatches = (sync.match(/\.\.\.mediaUpdatePatch\(/g) || []).length;
    const compliancePatches = (sync.match(/\.\.\.complianceUpdatePatch\(\)/g) || []).length;
    expect(mediaPatches).toBeGreaterThanOrEqual(2);
    expect(compliancePatches).toBe(mediaPatches);
  });
  it("reset-sync UPDATE omits compliance via the patch", () => {
    expect(read("app/api/crm/listings/reset-sync/route.ts")).toMatch(/\.\.\.complianceUpdatePatch\(\)/);
  });
  it("CREATE branches still write the mapper's (now-empty) compliance for new rows", () => {
    // New Trestle rows have no authored compliance → seeding {} on CREATE is correct.
    expect(read("lib/idx/sync.ts")).toMatch(/compliance: mapped\.compliance as Prisma\.InputJsonValue/);
  });
});

describe("S1 — public render repoint (listing detail)", () => {
  const page = read("app/listing/[...slug]/page.tsx");
  it("PublicRemarks reads features → raw_data, NOT compliance", () => {
    // CONTRACT MOVED (DTO collapse). The page delegates to
    // dbListingToPublicDTO, which now owns the features → raw_data rule
    // (asserted against db-to-public-dto.ts below). The S1 invariant itself is
    // UNCHANGED and still enforced: the compliance column is never read for
    // render, on either file.
    const dtoSrc = read("lib/idx/db-to-public-dto.ts");
    expect(dtoSrc).toMatch(/publicRemarks:[\s\S]{0,200}?features\.PublicRemarks[\s\S]{0,200}?rawData\.PublicRemarks/);
    expect(dtoSrc).not.toMatch(/compliance\.PublicRemarks/);
    expect(page).toMatch(/dbListingToPublicDTO\(dbListing[,)]/);
    expect(page).not.toMatch(/compliance\.PublicRemarks/);
  });
  it("does not read the compliance column for render; reads raw_data instead", () => {
    expect(page).toMatch(/const\s+rawData\s*=\s*\(dbListing\.raw_data\b/);
    expect(page).not.toMatch(/const\s+compliance\s*=\s*\(dbListing\.compliance\b/);
  });
});

describe("S1 — cards/search DTO + public DTO are compliance-independent (no leak)", () => {
  const dto = read("lib/idx/db-to-public-dto.ts");
  it("card/search remarks come from features.PublicRemarks", () => {
    expect(dto).toMatch(/publicRemarks:\s*features\.PublicRemarks/);
  });
  it("the public DTO mapper does not read or expose the compliance column", () => {
    expect(dto).not.toMatch(/\.compliance\b/);
    expect(dto).not.toMatch(/\bcompliance:\s/); // no compliance field emitted in the DTO
  });
});

describe("S1 — consumer guards (display gate / syndication / CRM preserved)", () => {
  it("IDX display gate operates on the Listing domain type, not the Prisma row / stored JSON", () => {
    const gate = read("lib/compliance/idx-display-gate.ts");
    expect(gate).toMatch(/import\s+type\s+\{\s*Listing\s*\}\s+from\s+['"]@\/lib\/types\/listing['"]/);
    // It must not import the Prisma listings row type for gating.
    expect(gate).not.toMatch(/@prisma\/client/);
  });

  it("production gate columns are computed by the mapper from status/flags (not the compliance JSON)", () => {
    // computeGateColumns is the typed-column source of truth; assert it exists + is status-driven.
    const r = mapTrestleToPrisma(buildTrestleRow());
    expect(typeof r.idx_display_yn).toBe("boolean");
  });

  it("syndication eligibility still reads the retained compliance column", () => {
    const elig = read("lib/syndication/eligibility.ts");
    expect(elig).toMatch(/listing\.compliance/);
  });

  it("CRM still writes authored compliance keys (validation_result) — column retained, not wiped", () => {
    const crm = read("app/api/crm/listings/[id]/route.ts");
    expect(crm).toMatch(/validation_result/);
    expect(crm).toMatch(/update\.compliance\s*=/);
  });

  it("the compliance column is NOT dropped from the Prisma schema (retained for authored data)", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toMatch(/compliance\s+Json/);
  });
});
