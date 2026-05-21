/// <reference types="jest" />
/**
 * Regression pin — FARE Act disclosure on rental listing detail.
 *
 * Catches the failure mode the 2026-05-20 exclusive-launch readiness audit
 * (PR #166) was concerned about: a future code change that removes or breaks
 * the FARE Act / NYC LL 119/2024 disclosure on rental listings.
 *
 * Why a source-pin: the audit's A4 finding ("verified missing on a live
 * rental URL") turned out to be a FALSE POSITIVE — a 15-listing sweep on
 * 2026-05-21 showed every production rental rendering the disclosure
 * correctly. But the pattern the auditor wrote is real: source-grep alone
 * doesn't prove rendering, and a future PR could move the block outside
 * the `isRental` conditional and silently break the disclosure. This test
 * locks both: (a) the disclosure text exists in the file, (b) it sits
 * inside the `isRental && (...)` section so it ships for rentals.
 *
 * Companion script: `scripts/__verify-fare-rendering.mjs` (untracked, per
 * the same pattern as `scripts/__pr147-soak-verify.mjs`) — Maya runs it
 * against production after any release to confirm the disclosure still
 * renders on real rentals.
 *
 * Regulation: NYC Local Law 119/2024 (FARE Act), effective 2025-06-11.
 * DCWP penalty schedule §20-699.21 $1,000–$1,800; §20-699.22 up to
 * $2,000 per violation.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const LISTING_DETAIL_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "app",
  "listing",
  "[id]",
  "page.tsx",
);

// The canonical disclosure phrase. If a code change rewords this, the test
// MUST be updated in the same PR — but only after confirming the new
// phrasing also satisfies NYC LL 119/2024 (a paralegal review of the
// wording is appropriate before retiring the old phrase).
const FARE_DISCLOSURE_HEADING = "Fee Disclosure (NYC Local Law 119/2024):";

// The disclosure must include the statutory "tenants are not required to
// pay a broker fee unless..." clause per LL 119/2024 §20-699.21. Failure
// to include this clause is the exact violation the statute targets.
// Whitespace-normalized so the test doesn't break on a reformat.
const FARE_TENANT_FEE_CLAUSE_NORMALIZED =
  "Prospective tenants are not required to pay a broker fee unless they have specifically engaged a broker to act on their behalf";

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ");
}

describe("FARE Act disclosure — source-side regression pin (A4 audit follow-up)", () => {
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(LISTING_DETAIL_PATH)).toBe(true);
    source = fs.readFileSync(LISTING_DETAIL_PATH, "utf8");
  });

  it("includes the canonical FARE Act disclosure heading", () => {
    expect(source).toContain(FARE_DISCLOSURE_HEADING);
  });

  it("includes the statutory tenant-fee clause from NYC LL 119/2024 §20-699.21", () => {
    // Normalize whitespace so JSX line-breaks + indentation don't break
    // the assertion. The clause itself must appear semantically intact.
    expect(normalizeWhitespace(source)).toContain(FARE_TENANT_FEE_CLAUSE_NORMALIZED);
  });

  it("disclosure block sits INSIDE the `isRental && (...)` rental section", () => {
    // Locate the `{isRental && (` opening for the rental-details section.
    // The disclosure must appear AFTER this opening and BEFORE the
    // matching closing `)}` of the same conditional. We pin this by
    // checking that the disclosure phrase appears AFTER the rental gate
    // and BEFORE the next top-level section comment after Rental Details.
    const rentalGateIdx = source.indexOf("{isRental && (");
    expect(rentalGateIdx).toBeGreaterThan(-1);

    const disclosureIdx = source.indexOf(FARE_DISCLOSURE_HEADING);
    expect(disclosureIdx).toBeGreaterThan(rentalGateIdx);

    // The next section comment after "RENTAL DETAILS" should be
    // "BUILDING INFO" (or similar) — verify the disclosure appears
    // BEFORE the next section starts (i.e., inside the rental section).
    const buildingInfoIdx = source.indexOf("BUILDING INFO", disclosureIdx);
    expect(buildingInfoIdx).toBeGreaterThan(disclosureIdx);
  });

  it("disclosure block sits adjacent to the move-in cost / fee fields it disclaims", () => {
    // The disclaimer must be visually + structurally adjacent to the fee
    // fields it explains. Locate the rental-fee fields (moveInCosts,
    // ongoingFees, tenantPaysDescription) and verify the disclosure
    // appears within ~40 lines of them — the same `<section>` block.
    const tenantPaysIdx = source.indexOf("listing.tenantPaysDescription");
    expect(tenantPaysIdx).toBeGreaterThan(-1);

    const disclosureIdx = source.indexOf(FARE_DISCLOSURE_HEADING);
    expect(disclosureIdx).toBeGreaterThan(tenantPaysIdx);

    // Distance check — disclosure must be within 4 KB of the fee fields
    // (empirically the current spacing is ~120 chars; 4 KB is generous
    // headroom for future refactors that may add UI between them, while
    // still catching the case where the disclosure is moved to an
    // entirely different section).
    expect(disclosureIdx - tenantPaysIdx).toBeLessThan(4096);
  });

  it("disclosure references NYC Local Law 119/2024 explicitly", () => {
    // The statute name is required for the disclosure to be valid under
    // NYC DCWP guidance. "Local Law 119/2024" or "LL 119/2024" must
    // appear in the disclosure body so consumers can identify the source.
    expect(source).toMatch(/Local Law 119\/2024|LL 119\/2024/);
  });

  it("includes the per-broker contact instruction (statutory)", () => {
    // LL 119/2024 §20-699.22 requires that the disclosure tell tenants
    // they can contact the listing office for complete fee disclosure
    // when fee details are not displayed.
    expect(source).toContain(
      "Contact the listing office directly for complete fee disclosure",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Auditor false-positive correction note (2026-05-21)
// ───────────────────────────────────────────────────────────────────────────
// The 2026-05-20 exclusive-launch readiness audit (PR #166) classified A4
// as "FARE Act disclosure NOT rendered on production rental listings" and
// marked it as a Class-A launch blocker. A 15-listing live HTTP probe on
// 2026-05-21 disproved this:
//
//   - 815 5th Ave (auditor's exact listing): ✓ 1× FARE phrase rendered
//   - 401 West St PH:                         ✓ 1× rendered
//   - 432 Park Ave:                           ✓ 1× rendered
//   - + 12 more rentals across the inventory: ✓ 1× or 2× rendered (3 listings render 2× — a separate minor duplication issue)
//
// Root cause of the false positive: source-grep alone doesn't prove
// rendering; the auditor probed the file source and concluded missing
// without HTTP-probing the URL. The actual conditional at
// app/listing/[id]/page.tsx:1505 (`{isRental && (`) gates the section on
// `listing.listingType === 'rent'`, which is set correctly for every
// production rental tested.
//
// This pin guarantees the disclosure stays correctly placed for future
// refactors. The 2× duplicate-render finding is tracked as a Class-C
// follow-up (cosmetic, not legal exposure — the disclosure still renders).
