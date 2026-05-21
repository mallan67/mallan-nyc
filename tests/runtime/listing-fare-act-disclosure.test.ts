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

// Find the position of the `)` that matches the `(` at `openParenIdx`,
// tracking JSX/TSX paren-depth while respecting string literals and
// comments. Returns the position of the closing `)`, or -1 if no match
// is found before EOF.
//
// Added 2026-05-21 to address Codex PR #169 review feedback: the prior
// placement assertion only checked positional order, which a refactor
// could silently break. This scanner gives real structural containment.
//
// Handles: nested parens (depth tracking); line comments (// to newline);
// block comments (slash-star to star-slash, including the JSX-comment
// form embedded as a brace-wrapped block); string literals (single-,
// double-quote, and backtick template); escaped chars inside strings
// (backslash + next char is skipped).
//
// NOT handled (intentionally — none of these appear in the JSX rental
// block we're scanning): template literal interpolation paren-depth
// inside `${...}`. If a `${expr}` inside a backtick string ever contains
// an unbalanced paren, this scanner will get the wrong answer. The
// listing detail page never has this shape inside the rental block; if
// it ever does, this test will fail loudly with a clear assertion
// message and the scanner can be upgraded then.
function findMatchingParen(source: string, openParenIdx: number): number {
  if (source[openParenIdx] !== "(") {
    throw new Error(
      `findMatchingParen: expected '(' at index ${openParenIdx}, got '${source[openParenIdx]}'`,
    );
  }

  type Mode =
    | "code"
    | "line-comment"
    | "block-comment"
    | "string-single"
    | "string-double"
    | "string-template";

  let depth = 1;
  let i = openParenIdx + 1;
  let mode: Mode = "code";

  while (i < source.length && depth > 0) {
    const c = source[i];
    const next = i + 1 < source.length ? source[i + 1] : "";

    if (mode === "code") {
      if (c === "/" && next === "/") {
        mode = "line-comment";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        mode = "block-comment";
        i += 2;
        continue;
      }
      if (c === '"') { mode = "string-double"; i++; continue; }
      if (c === "'") { mode = "string-single"; i++; continue; }
      if (c === "`") { mode = "string-template"; i++; continue; }
      if (c === "(") depth++;
      else if (c === ")") depth--;
    } else if (mode === "line-comment") {
      if (c === "\n") mode = "code";
    } else if (mode === "block-comment") {
      if (c === "*" && next === "/") {
        mode = "code";
        i += 2;
        continue;
      }
    } else if (mode === "string-single") {
      if (c === "\\") { i += 2; continue; }
      if (c === "'") mode = "code";
    } else if (mode === "string-double") {
      if (c === "\\") { i += 2; continue; }
      if (c === '"') mode = "code";
    } else if (mode === "string-template") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") mode = "code";
      // Note: we intentionally do not parse `${...}` interpolation. See
      // the function docstring for why this is safe in the current file.
    }

    i++;
  }

  return depth === 0 ? i - 1 : -1;
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

  it("disclosure block sits INSIDE the `{isRental && (...)` rental conditional (structural paren-depth check)", () => {
    // Codex PR #169 review pin (2026-05-21): the previous version of this
    // test only checked that the disclosure appeared AFTER `{isRental && (`
    // and BEFORE a later `BUILDING INFO` marker — which does NOT prove
    // structural containment. A refactor could move the disclosure to a
    // position AFTER the rental block's `)}` closes but BEFORE
    // `BUILDING INFO`, silently breaking the rental gating (the
    // disclosure would render on sale listings too, and the rental-fee-
    // context disclaimer would be detached from the fee fields it
    // disclaims).
    //
    // This version uses a real JSX paren-depth scanner that tracks
    // code / string / comment state, finds the matching `)` of the
    // `{isRental && (` opening, and asserts the disclosure heading lies
    // strictly BETWEEN the open and the matching close. A future
    // refactor that moves the disclosure outside the rental block now
    // fails this test loudly.

    const rentalGateMarker = "{isRental && (";
    const rentalGateIdx = source.indexOf(rentalGateMarker);
    expect(rentalGateIdx).toBeGreaterThan(-1);

    // Position of the `(` character (last char of the marker).
    const openParenIdx = rentalGateIdx + rentalGateMarker.length - 1;
    expect(source[openParenIdx]).toBe("(");

    // Find the matching `)` that closes the JSX expression. The
    // character immediately after should be `}` (the close of the JSX
    // expression brace block).
    const closeParenIdx = findMatchingParen(source, openParenIdx);
    expect(closeParenIdx).toBeGreaterThan(openParenIdx);
    expect(source[closeParenIdx + 1]).toBe("}");

    // The disclosure heading MUST sit strictly between the open and the
    // matching close. If a future refactor moves it outside the
    // conditional (even by one character past `)}`), this assertion
    // fails because disclosureIdx will be > closeParenIdx.
    const disclosureIdx = source.indexOf(FARE_DISCLOSURE_HEADING);
    expect(disclosureIdx).toBeGreaterThan(openParenIdx);
    expect(disclosureIdx).toBeLessThan(closeParenIdx);
  });

  it("structural containment scanner correctly rejects out-of-block placement (negative test)", () => {
    // Self-test of findMatchingParen: build a synthetic source where the
    // FARE phrase is intentionally placed AFTER the matching `)` of
    // `{isRental && (`. The structural check used above must reject
    // this; if it doesn't, the scanner is broken and the positive
    // assertion above is meaningless.
    const synthetic = [
      "{isRental && (",
      "  <section>",
      "    <p>real rental content</p>",
      "  </section>",
      ")}",
      "<p>Fee Disclosure (NYC Local Law 119/2024): leaked outside</p>",
    ].join("\n");

    const gateMarker = "{isRental && (";
    const gateIdx = synthetic.indexOf(gateMarker);
    const openParenIdx = gateIdx + gateMarker.length - 1;
    const closeParenIdx = findMatchingParen(synthetic, openParenIdx);
    const disclosureIdx = synthetic.indexOf(FARE_DISCLOSURE_HEADING);

    expect(closeParenIdx).toBeGreaterThan(openParenIdx);
    expect(disclosureIdx).toBeGreaterThan(closeParenIdx);
    // The same assertion shape as the real test — but here it MUST fail
    // the `disclosureIdx < closeParenIdx` predicate. Asserting the
    // negation proves the scanner is doing real containment work.
    expect(disclosureIdx).not.toBeLessThan(closeParenIdx);
  });

  it("paren-depth scanner correctly handles nested parens + strings + comments (unit test)", () => {
    // Synthetic JSX with nested parens, string-literal parens, line+block
    // comments — all of which would fool a naive position-based check.
    const synthetic =
      "{isRental && (\n" +
      "  // ) this paren in a line comment must not count\n" +
      "  /* ) and this one in a block comment also must not count */\n" +
      "  <button onClick={() => doThing(')')}>{'(' + 'x' + ')'}</button>\n" +
      "  /* close-paren in template: */\n" +
      "  {`backtick )) string`}\n" +
      "  <p>inside</p>\n" +
      ")}<p>outside</p>";

    const gateMarker = "{isRental && (";
    const gateIdx = synthetic.indexOf(gateMarker);
    const openParenIdx = gateIdx + gateMarker.length - 1;
    const closeParenIdx = findMatchingParen(synthetic, openParenIdx);

    // The matching close must be the `)` immediately before `}<p>outside</p>`
    // — NOT any of the in-comment or in-string parens.
    expect(closeParenIdx).toBeGreaterThan(openParenIdx);
    expect(synthetic.slice(closeParenIdx, closeParenIdx + 2)).toBe(")}");
    // The synthetic "inside" content should be between open and close.
    expect(synthetic.indexOf("<p>inside</p>")).toBeGreaterThan(openParenIdx);
    expect(synthetic.indexOf("<p>inside</p>")).toBeLessThan(closeParenIdx);
    // The synthetic "outside" content must be AFTER the close.
    expect(synthetic.indexOf("<p>outside</p>")).toBeGreaterThan(closeParenIdx);
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
