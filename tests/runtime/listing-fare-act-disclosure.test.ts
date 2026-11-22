/// <reference types="jest" />
/**
 * Regression pin — the rental fee note on the rental listing detail page.
 *
 * Maya, 2026-11-22: "remove extra disclosures that do not need to be there. the only suggestion for
 * rentals is for the prospective tenants check the application fees/ move-in/move-out fee. Deposit is
 * 1 month by law so no need to include that. no need to over load with things that no one else does."
 * The box under the fee rows is therefore ONE sentence: no heading, no statutory label, no attribution
 * sentence, no offer of Mallan's services, no deposit.
 *
 * Why a source-pin (kept from the 2026-05-20 exclusive-launch readiness audit, PR #166): source-grep alone
 * does not prove rendering, and a future PR could move the note outside the `isRental` conditional and
 * silently put it on sale listings. This test locks (a) the sentence exists, (b) it is the only text in its
 * box, (c) it sits inside the `isRental && (...)` section.
 *
 * Law: NYC Local Law 119/2024 (FARE Act), Admin. Code §§20-699.20 to .25. Section 20-699.22(a) requires a
 * rental listing to disclose any fee the prospective tenant must pay IN THE LISTING; the fee rows the feed
 * supplies (Move-In Costs and the rest) do that. The compliance gate of 2026-11-21 read the certified text
 * and found no sentence or notice that a listing must carry beyond those fees, so this note is Maya's
 * wording, not a statutory notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const LISTING_DETAIL_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "app",
  "listing",
  "[...slug]",
  "page.tsx",
);

const SEARCH_PAGE_PATH = path.resolve(__dirname, "..", "..", "app", "search", "page.tsx");

// The one sentence. If a code change rewords it, update this test in the same PR.
const FEE_NOTE_SENTENCE =
  "Prospective tenants should check the application, move-in and move-out fees before viewing.";

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ");
}

// Index of the sentence in the RAW source, tolerant of JSX line-wrapping between words.
function indexOfFlexible(raw: string, sentence: string): number {
  const pattern = sentence
    .split(" ")
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const m = new RegExp(pattern).exec(raw);
  return m ? m.index : -1;
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

describe("Rental fee note — source-side regression pin (A4 audit follow-up; one sentence since 2026-11-22)", () => {
  let source: string;

  beforeAll(() => {
    expect(fs.existsSync(LISTING_DETAIL_PATH)).toBe(true);
    source = fs.readFileSync(LISTING_DETAIL_PATH, "utf8");
  });

  it("has the one-sentence fee note", () => {
    expect(normalizeWhitespace(source)).toContain(FEE_NOTE_SENTENCE);
  });

  it("the sentence is the ONLY text in its box (no heading, no attribution sentence, nothing else)", () => {
    const text = normalizeWhitespace(source);
    const boxes = text.match(/<div className="mt-4 p-3 bg-\[#F8F7F4\] rounded-lg border border-black\/5">/g) ?? [];
    expect(boxes).toHaveLength(1);
    const m = /<div className="mt-4 p-3 bg-\[#F8F7F4\] rounded-lg border border-black\/5"> <p className="[^"]*"> (.*?) <\/p> <\/div>/.exec(text);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(FEE_NOTE_SENTENCE);
  });

  it("the note does not mention a deposit (Maya, 2026-11-22: it is one month by law)", () => {
    expect(FEE_NOTE_SENTENCE.toLowerCase()).not.toContain("deposit");
  });

  it("note sits INSIDE the `{isRental && (...)` rental conditional (structural paren-depth check)", () => {
    // Codex PR #169 review pin (2026-05-21): a position-only check does not prove structural containment. A
    // refactor could move the note to a position AFTER the rental block's `)}` closes but BEFORE a later
    // marker, silently putting it on sale listings. This uses a real paren-depth scanner that tracks code /
    // string / comment state, finds the matching `)` of the `{isRental && (` opening, and asserts the note
    // lies strictly BETWEEN the open and the matching close.
    const rentalGateMarker = "{isRental && (";
    const rentalGateIdx = source.indexOf(rentalGateMarker);
    expect(rentalGateIdx).toBeGreaterThan(-1);

    const openParenIdx = rentalGateIdx + rentalGateMarker.length - 1;
    expect(source[openParenIdx]).toBe("(");

    const closeParenIdx = findMatchingParen(source, openParenIdx);
    expect(closeParenIdx).toBeGreaterThan(openParenIdx);
    expect(source[closeParenIdx + 1]).toBe("}");

    const noteIdx = indexOfFlexible(source, FEE_NOTE_SENTENCE);
    expect(noteIdx).toBeGreaterThan(openParenIdx);
    expect(noteIdx).toBeLessThan(closeParenIdx);
  });

  it("structural containment scanner correctly rejects out-of-block placement (negative test)", () => {
    // Self-test of findMatchingParen: build a synthetic source where the note is intentionally placed AFTER
    // the matching `)` of `{isRental && (`. The structural check above must reject this; if it doesn't, the
    // scanner is broken and the positive assertion above is meaningless.
    const synthetic = [
      "{isRental && (",
      "  <section>",
      "    <p>real rental content</p>",
      "  </section>",
      ")}",
      `<p>${FEE_NOTE_SENTENCE}</p>`,
    ].join("\n");

    const gateMarker = "{isRental && (";
    const gateIdx = synthetic.indexOf(gateMarker);
    const openParenIdx = gateIdx + gateMarker.length - 1;
    const closeParenIdx = findMatchingParen(synthetic, openParenIdx);
    const noteIdx = synthetic.indexOf(FEE_NOTE_SENTENCE);

    expect(closeParenIdx).toBeGreaterThan(openParenIdx);
    expect(noteIdx).toBeGreaterThan(closeParenIdx);
    expect(noteIdx).not.toBeLessThan(closeParenIdx);
  });

  it("paren-depth scanner correctly handles nested parens + strings + comments (unit test)", () => {
    // Synthetic JSX with nested parens, string-literal parens, line+block comments — all of which would fool a
    // naive position-based check.
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

    expect(closeParenIdx).toBeGreaterThan(openParenIdx);
    expect(synthetic.slice(closeParenIdx, closeParenIdx + 2)).toBe(")}");
    expect(synthetic.indexOf("<p>inside</p>")).toBeGreaterThan(openParenIdx);
    expect(synthetic.indexOf("<p>inside</p>")).toBeLessThan(closeParenIdx);
    expect(synthetic.indexOf("<p>outside</p>")).toBeGreaterThan(closeParenIdx);
  });

  it("note sits adjacent to the move-in cost / fee fields it refers to", () => {
    // The note must be structurally adjacent to the fee rows (moveInCosts, ongoingFees, tenantPaysDescription).
    // 4 KB is generous headroom for a future refactor while still catching a move to a different section.
    const tenantPaysIdx = source.indexOf("listing.tenantPaysDescription");
    expect(tenantPaysIdx).toBeGreaterThan(-1);

    const noteIdx = indexOfFlexible(source, FEE_NOTE_SENTENCE);
    expect(noteIdx).toBeGreaterThan(tenantPaysIdx);
    expect(noteIdx - tenantPaysIdx).toBeLessThan(4096);
  });

  it("the extra statements Maya removed do not come back (heading, attribution, verify-with-agent, broker-fee sentence, old claims)", () => {
    // 2026-11-21 and 2026-11-22: each of these was removed on Maya's instruction. The old claims were also
    // false: "via the REBNY Listing Service" and "the listing broker has not provided this information" are
    // untrue when the agent wrote the fees in the description or the row is Mallan's own.
    const text = normalizeWhitespace(source);
    for (const phrase of [
      "Fee Disclosure (NYC Local Law 119",
      "are provided by the listing broker",
      "please verify them with the agent",
      "ask the listing agent",
      "not required to pay a broker fee",
      "specifically engaged a broker",
      "has not provided this information",
      "via the REBNY Listing Service",
      "Contact the listing office directly",
    ]) {
      expect(text).not.toContain(phrase);
    }
  });
});

describe("No offer of Mallan's services on the listing page (Maya, 2026-11-21)", () => {
  const read = (...parts: string[]) =>
    normalizeWhitespace(fs.readFileSync(path.resolve(__dirname, "..", "..", ...parts), "utf8"));

  it("the listing page does not say Mallan does not represent the owner or offer a service for a fee", () => {
    // Removed on Maya's decision after the 2026-11-21 legal research (LL 119 section 20-699.21(a)(2), (c), (e)):
    // a tenant who calls or writes is given the agency disclosure and a representation agreement directly.
    const text = read("app", "listing", "[...slug]", "page.tsx");
    for (const phrase of [
      "does not represent the owner",
      "Working with Mallan",
      "tenant agent, we can provide",
      "tenantAgentNotice",
      "showsTenantAgentNotice",
    ]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("the helper that gated that paragraph is gone", () => {
    expect(fs.existsSync(path.resolve(__dirname, "..", "..", "lib", "listings", "tenant-agent-notice.ts"))).toBe(false);
  });
});

describe("General rental search carries no FARE strip (Maya, 2026-11-22)", () => {
  it("the amber FARE strip was removed from the search page", () => {
    // It had no statutory basis (the certified Local Law 119 text requires fees to be disclosed in the listing
    // itself), and its second sentence was inaccurate: the fee badge is on Grid and List cards only.
    const search = normalizeWhitespace(fs.readFileSync(SEARCH_PAGE_PATH, "utf8"));
    expect(search).not.toContain("FARE Act (NYC LL 119/2024)");
    expect(search).not.toContain("may only be charged to the party who hires the broker");
    expect(search).not.toContain("is displayed on each listing card and detail page");
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
// This pin guarantees the note stays correctly placed for future
// refactors. The 2× duplicate-render finding is tracked as a Class-C
// follow-up (cosmetic, not legal exposure).
