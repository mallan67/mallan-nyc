/**
 * Focused replacement tests for five CRM/listing protections whose EXACT failure
 * was previously only asserted (loosely) by the retired Sentinel-L scanner. Each
 * asserts the specific defect the rule guarded — named after the real defect,
 * not the rule code. Source-contract scans (static forms / route files); no
 * DB/network.
 *
 * Migrated from Sentinel-L rules: S-AGENT-006, S-BACKSEARCH-009, S-BUILDING-005,
 * S-SAVED-012, S-MEDIA-004 (see the retention matrix).
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("listing-agent value is not overwritten from the session during edit hydration", () => {
  const form = read("public/crm/SALE-FORM-REDESIGN.html");
  it("guards the listing-agent write behind an existing-value check", () => {
    // Session/logged-in agent must NOT clobber a saved listing agent on edit:
    // the write is short-circuited when the field already holds a value.
    const hasEmptyGuard =
      /if\s*\(\s*existingAgent\s*&&\s*existingAgent\.value\s*\)\s*return/.test(form) ||
      /if\s*\(\s*!listingAgentEl\s*\|\|\s*!listingAgentEl\.value\s*\)/.test(form);
    expect(hasEmptyGuard).toBe(true);
  });
});

describe("backend CRM listing search does not use public display-gate columns as access gates", () => {
  const route = read("app/api/crm/listings/route.ts");
  it("filters by broker ownership (agent_id), not by public display gates", () => {
    expect(route).toMatch(/where\b[\s\S]{0,400}agent_id/);
    for (const gateCol of [
      "internet_entire_listing_display_yn",
      "internet_address_display_yn",
      "owner_opt_out",
      "participant_only",
    ]) {
      // The public display-gate column must never appear as a KEY inside a
      // Prisma `where: { ... }` filter (that would hide drafts/internal from
      // authorized brokers). It may still appear in select/gate-compute.
      const asWhereKey = new RegExp(`where\\s*:\\s*\\{[^}]*\\b${gateCol}\\s*:`);
      expect(route).not.toMatch(asWhereKey);
    }
  });
});

describe("building search response carries structured direction + postal atoms", () => {
  const route = read("app/api/buildings/search/route.ts");
  it("includes StreetDirPrefix and PostalCode in the building result shape", () => {
    expect(route).toContain("StreetDirPrefix");
    expect(route).toContain("PostalCode");
  });
});

describe("saved-search alert matching goes through the canonical Search executor", () => {
  const cron = read("app/api/cron/search-alerts/route.ts");
  it("membership comes from settledUniverseFor + rowsModifiedSince (gated at hydration), never a projection or a raw membership query", () => {
    expect(cron).toContain("settledUniverseFor");
    expect(cron).toContain("rowsModifiedSince");
    expect(cron).not.toContain("runProjectionListingSearch");
    expect(cron).not.toContain("listingSearchProjection");
    // no Listing read in the cron at all: delivery history (ClientListingAction / audit) lives in
    // lib/search/alert-delivery-history.ts and is consulted BEFORE the cap, never as membership
    expect(cron).not.toMatch(/prisma.listing.findMany/);
    expect(cron).toContain("loadDeliveryHistory");
    expect(cron).toContain("excludeDelivered");
    expect(cron).toContain("recordDelivery");
  });
});

describe("existing server media is not re-uploaded as new pending media", () => {
  const form = read("public/crm/SALE-FORM-REDESIGN.html");
  it("the upload payload is built from pendingMedia (new files), not existing server media", () => {
    expect(form).toContain("pendingMedia");
    // the existing-media collections must not be appended into the upload FormData
    expect(form).not.toMatch(/\b(?:existingMedia|serverMedia)\b[\s\S]{0,300}(?:new\s+FormData|\.append\([^)]*media|media\/upload)/);
  });
});
