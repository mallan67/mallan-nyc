/// <reference types="jest" />
/**
 * Portals Tier A P0 — static source-pattern guards.
 *
 * Two compliance fixes the regex inspects:
 *
 *   A-1. PortalEvent buyer_lead_id masking. The seller's dashboard reads
 *        from PortalEvent.metadata. The offers GET response masks the
 *        buyer to "Buyer (via your agent)". The PortalEvent metadata
 *        MUST mirror that masking — leaking the raw buyer_lead_id via
 *        the activity-feed side channel breaches REBNY Art. III §2.
 *
 *   A-3. /api/portal/me must delegate the field allowlist to
 *        sanitizeLeadForPortal so the route cannot drift away from the
 *        central client-self-view rules. Hand-written responses are a
 *        regression risk.
 *
 * These tests are fast, run on every push, and would have caught both
 * regressions during the audit phase.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const OFFERS_ROUTE = path.join(REPO_ROOT, "app", "api", "portal", "offers", "route.ts");
const ME_ROUTE = path.join(REPO_ROOT, "app", "api", "portal", "me", "route.ts");
const DOCUMENTS_ROUTE = path.join(REPO_ROOT, "app", "api", "portal", "documents", "route.ts");

function readFile(p: string): string {
  return fs.readFileSync(p, "utf8");
}

describe("Portals Tier A P0 — A-1 PortalEvent buyer_lead_id masking", () => {
  let src: string;
  beforeAll(() => {
    src = readFile(OFFERS_ROUTE);
  });

  it("does NOT include buyer_lead_id in the offer_view PortalEvent metadata", () => {
    // Slice from the offer_view recordPortalEvent block to the closing brace.
    // The buyer_lead_id assignment was on the SELLER-SIDE event, which
    // immediately follows `eventType: "offer_view"`.
    const sellerSideMatch = src.match(
      /eventType: "offer_view"[\s\S]*?metadata: \{[\s\S]*?\},/m
    );
    expect(sellerSideMatch).not.toBeNull();
    const sellerSideBlock = sellerSideMatch![0];
    expect(sellerSideBlock).not.toMatch(/buyer_lead_id\s*:/);
  });

  it("uses the same masked wording as the offers GET response", () => {
    const sellerSideMatch = src.match(
      /eventType: "offer_view"[\s\S]*?metadata: \{[\s\S]*?\},/m
    );
    expect(sellerSideMatch).not.toBeNull();
    const sellerSideBlock = sellerSideMatch![0];
    expect(sellerSideBlock).toMatch(/from:\s*"Buyer \(via your agent\)"/);
  });

  it("offers GET response still masks the buyer (regression guard)", () => {
    expect(src).toMatch(/name:\s*"Buyer \(via your agent\)"/);
    expect(src).not.toMatch(/\{\s*id:\s*a\.lead\.id\.toString\(\),\s*name:\s*"Buyer \(via your agent\)"/);
  });

  it("offers GET response formats seller comment instead of returning raw JSON", () => {
    expect(src).toMatch(/formatSellerOfferComment\(a\.comment\)/);
    expect(src).not.toMatch(/comment:\s*a\.comment/);
  });

  it("buyer-side PortalEvent (offer_submit) still uses raw lead identity (own data, not leaked)", () => {
    // Buyer-side metadata is for the buyer's OWN activity feed — not a leak.
    // Confirm the buyer-side block exists and remains intact.
    const buyerSideMatch = src.match(
      /eventType: "offer_submit"[\s\S]*?metadata: \{[\s\S]*?\},/m
    );
    expect(buyerSideMatch).not.toBeNull();
  });

  it("REBNY Art. III §2 confidentiality comment is present on the masking site", () => {
    expect(src).toMatch(/REBNY Art\. III §2 confidentiality/);
  });
});

describe("Portals Tier A P0 — A-3 /api/portal/me sanitizer adoption", () => {
  let src: string;
  beforeAll(() => {
    src = readFile(ME_ROUTE);
  });

  it("imports sanitizeLeadForPortal from lib/compliance/dto", () => {
    expect(src).toMatch(
      /import\s*\{\s*sanitizeLeadForPortal\s*\}\s*from\s*"@\/lib\/compliance\/dto"/
    );
  });

  it("calls sanitizeLeadForPortal on the lead row", () => {
    expect(src).toMatch(/sanitizeLeadForPortal\s*\(/);
  });

  it("does NOT hand-write the response with internal-only fields the sanitizer strips", () => {
    // Hand-written shapes that bypass the helper would expose these.
    // The sanitizer strips them. Confirm none of these appear as response
    // body keys (they CAN appear as DB-read selectors — the test scopes
    // to NextResponse.json call sites only).
    const jsonResponseMatch = src.match(/NextResponse\.json\(\{[\s\S]*?\}\);/g);
    expect(jsonResponseMatch).not.toBeNull();
    const responseBlocks = jsonResponseMatch!.join("\n");
    // None of these should appear as response keys in a /api/portal/me payload.
    expect(responseBlocks).not.toMatch(/\bagent_id\s*:/);
    expect(responseBlocks).not.toMatch(/\bpassword_hash\s*:/);
    expect(responseBlocks).not.toMatch(/\bportal_token\s*:/);
    expect(responseBlocks).not.toMatch(/\bsource\s*:/);
    expect(responseBlocks).not.toMatch(/\binternal_notes\s*:/);
    expect(responseBlocks).not.toMatch(/\blead_score\s*:/);
    expect(responseBlocks).not.toMatch(/\bbuyer_rep_agreement\s*:/);
    expect(responseBlocks).not.toMatch(/\bpipeline_stage\s*:/);
  });

  it("Tier A P0 attribution comment is present", () => {
    expect(src).toMatch(/Portals Tier A P0/);
  });
});

describe("Portals Tier A P0 — A-2 documents fail-loud", () => {
  let src: string;
  beforeAll(() => {
    src = readFile(DOCUMENTS_ROUTE);
  });

  it("does NOT compare Listing.address (JSON) against Deal.property_address (string)", () => {
    // The previous unsafe pattern: ownedAddresses cast to string[] then
    // passed to Prisma `{ in: [...] }` against a string column. Verify
    // the route no longer references either side of that broken filter.
    expect(src).not.toMatch(/property_address\s*:\s*\{[\s\S]*?in\s*:/);
    expect(src).not.toMatch(/ownedAddresses/);
  });

  it("does NOT call prisma.document.findMany or any document fetch", () => {
    // Until schema is fixed, the route MUST NOT attempt any document
    // query — even an "agent-scoped only" fetch leaks across clients.
    expect(src).not.toMatch(/prisma\.document\.findMany/);
    expect(src).not.toMatch(/prisma\.document\.findFirst/);
  });

  it("returns the documented fail-loud code", () => {
    expect(src).toMatch(/PORTAL_DOCUMENTS_PENDING_CLIENT_SCOPE/);
  });

  it("uses HTTP 501 for the unavailable state (not 200 with empty array)", () => {
    expect(src).toMatch(/status:\s*501/);
  });

  it("documents the schema gap with TODO(SCHEMA-GAP-001)", () => {
    expect(src).toMatch(/TODO\(SCHEMA-GAP-001\)/);
  });

  it("explains why returning [] silently was unsafe", () => {
    // The comment block must call out the cross-client leak risk so a
    // future contributor doesn't "fix" the 501 by re-adding a silent
    // empty-array shortcut.
    expect(src).toMatch(/silently/i);
    expect(src).toMatch(/leaks?\b/i);
  });
});
