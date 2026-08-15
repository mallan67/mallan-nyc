/// <reference types="jest" />
/**
 * Featured/Public Site Tier A P0 — static source-pattern guards.
 *
 * Five compliance/UX fixes the regex inspects:
 *
 *   A-1. Listing-detail "Inquire" CTA must route through the audited
 *        InquiryForm (#inquiry anchor), not a mailto: bypass that
 *        skips TCPA/CAN-SPAM consent capture, the UCBA C1 Inquiry
 *        row, and the AuditEvent.
 *
 *   A-2. All three DTO paths (raw → public, db → public, listing
 *        detail page DB-direct) must set unitNumber: null in the
 *        suppressed-address branch. A unit number plus building
 *        knowledge is enough to re-identify a listing whose owner
 *        opted out of address display.
 *
 *   A-3. The IDXDisclaimer compact variant must include the
 *        brokerage name (NY DOS 19 NYCRR §175.25). The compact
 *        variant ships on the homepage Featured section, which IS
 *        real estate advertising under the regulation.
 *
 *   A-4. PATCH /api/featured-config must write an AuditEvent on
 *        every config change so public-display configuration
 *        history is retained per NY SHIELD Act + REBNY.
 *
 *   A-5. PATCH /api/featured-config must cap pinnedListingIds and
 *        display_limit so a runaway request can't render hundreds
 *        of cards on the homepage or lock up the DB.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const LISTING_PAGE = path.join(REPO_ROOT, "app", "listing", "[...slug]", "page.tsx");
const DBDTO = path.join(REPO_ROOT, "lib", "idx", "db-to-public-dto.ts");
const PUBDTO = path.join(REPO_ROOT, "lib", "idx", "public-dto.ts");
const IDXDISCLAIMER = path.join(REPO_ROOT, "app", "components", "IDXDisclaimer.tsx");
const FEATURED_CONFIG = path.join(REPO_ROOT, "app", "api", "featured-config", "route.ts");

function readFile(p: string): string {
  return fs.readFileSync(p, "utf8");
}

describe("Featured/Public Tier A P0 — A-1 listing-detail mailto bypass removed", () => {
  let src: string;
  beforeAll(() => {
    src = readFile(LISTING_PAGE);
  });

  it("does NOT contain a mailto:contact@mallan.nyc anchor with subject=Inquiry", () => {
    expect(src).not.toMatch(/mailto:contact@mallan\.nyc[^"'`]*subject=[^"'`]*Inquiry/i);
  });

  it("the Inquire CTA routes to the in-page #inquiry anchor", () => {
    expect(src).toMatch(/href="#inquiry"[\s\S]*?Inquire/);
  });

  it("the Inquire fix attribution comment is present", () => {
    expect(src).toMatch(/Featured\/Public Tier A P0/);
    expect(src).toMatch(/audited InquiryForm/);
  });

  it("the InquiryForm anchor target div is still present (sanity)", () => {
    expect(src).toMatch(/<div id="inquiry">/);
    expect(src).toMatch(/<InquiryForm/);
  });
});

describe("Featured/Public Tier A P0 — A-2 unitNumber suppressed when address is suppressed", () => {
  it("lib/idx/db-to-public-dto.ts suppressed branch sets unitNumber: null", () => {
    const src = readFile(DBDTO);
    // The suppressed branch: streetName === 'Address Undisclosed' implies unitNumber: null
    expect(src).toMatch(
      /streetName:\s*['"]Address Undisclosed['"][\s\S]{0,160}?unitNumber:\s*null/
    );
  });

  it("lib/idx/public-dto.ts suppressed branch sets unitNumber: null", () => {
    const src = readFile(PUBDTO);
    expect(src).toMatch(
      /streetName:\s*['"]Address Undisclosed['"][\s\S]{0,160}?unitNumber:\s*null/
    );
  });

  it("app/listing/[...slug]/page.tsx DELEGATES suppression to the canonical builder", () => {
    // CONTRACT MOVED (DTO collapse). The page no longer composes its own
    // suppressed address block — it calls dbListingToPublicDTO, which owns
    // `unitNumber: null` under suppression (asserted directly above against
    // db-to-public-dto.ts). Demanding the page ALSO contain that literal would
    // be demanding the duplication this change removed.
    const src = readFile(LISTING_PAGE);
    expect(src).toMatch(/dbListingToPublicDTO\(dbListing[,)]/);
    // ...and it must not grow the suppressed block back.
    expect(src).not.toMatch(
      /streetName:\s*['"]Address Undisclosed['"][\s\S]{0,160}?unitNumber:\s*null/
    );
  });
});

describe("Featured/Public Tier A P0 — A-3 brokerage name in compact IDXDisclaimer", () => {
  let src: string;
  beforeAll(() => {
    src = readFile(IDXDISCLAIMER);
  });

  it("compact variant includes the brokerage name", () => {
    // Slice the compact branch and verify the brokerage line is inside it.
    const compactMatch = src.match(/if\s*\(\s*variant\s*===\s*['"]compact['"]\s*\)\s*\{[\s\S]*?^\s*\}\s*$/m);
    expect(compactMatch).not.toBeNull();
    const compactBlock = compactMatch![0];
    expect(compactBlock).toMatch(/Mallan Real Estate Inc\./);
    expect(compactBlock).toMatch(/Licensed Real Estate Broker/);
  });

  it("full variant still contains the brokerage attribution (regression guard)", () => {
    expect(src).toMatch(/Mallan Real Estate Inc\.[\s\S]*?licensed[\s\S]*?real estate broker/i);
  });

  it("search variant still contains the brokerage attribution (regression guard)", () => {
    // IDXSearchDisclaimer shipped this line before; it must remain.
    expect(src).toMatch(/Mallan Real Estate Inc\. — Licensed Real Estate Broker/);
  });

  it("Featured/Public Tier A P0 attribution comment is present", () => {
    expect(src).toMatch(/Featured\/Public Tier A P0/);
    expect(src).toMatch(/175\.25/);
  });
});

describe("Featured/Public Tier A P0 — A-4 AuditEvent on PATCH /api/featured-config", () => {
  let src: string;
  beforeAll(() => {
    src = readFile(FEATURED_CONFIG);
  });

  it("PATCH writes an AuditEvent row", () => {
    expect(src).toMatch(/prisma\.auditEvent\.create/);
  });

  it("AuditEvent action is featured_config_update", () => {
    expect(src).toMatch(/action:\s*['"]featured_config_update['"]/);
  });

  it("AuditEvent entity_type is featured_config", () => {
    expect(src).toMatch(/entity_type:\s*['"]featured_config['"]/);
  });

  it("AuditEvent records cap-applied flags so over-cap requests are visible in audit", () => {
    expect(src).toMatch(/pinned_ids_capped/);
    expect(src).toMatch(/display_limit_capped/);
  });

  it("audit failure does not block the save (graceful catch)", () => {
    expect(src).toMatch(/auditEvent\.create[\s\S]*?\.catch\(\(\)\s*=>\s*\{[\s\S]*?\}\)/);
  });
});

describe("Featured/Public Tier A P0 — A-5 PATCH input caps", () => {
  let src: string;
  beforeAll(() => {
    src = readFile(FEATURED_CONFIG);
  });

  it("pinnedListingIds is capped at 12", () => {
    expect(src).toMatch(/PINNED_IDS_CAP\s*=\s*12/);
    expect(src).toMatch(/\.slice\(0,\s*PINNED_IDS_CAP\)/);
  });

  it("display_limit is capped at 24 (max) and 1 (min)", () => {
    expect(src).toMatch(/DISPLAY_LIMIT_MAX\s*=\s*24/);
    expect(src).toMatch(/DISPLAY_LIMIT_MIN\s*=\s*1/);
    expect(src).toMatch(/Math\.min\(Math\.max\(/);
  });

  it("Featured/Public Tier A P0 attribution comment is present on the caps + audit sites", () => {
    // Two distinct attribution comments: one over the cap block, one over the audit.
    const matches = src.match(/Featured\/Public Tier A P0/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
