/// <reference types="jest" />
/**
 * A1 (PR-A1-grid-fix, 2026-05-20) — source-pin for the listing-detail
 * mobile-overflow fix.
 *
 * Why a source-pin (companion to the Playwright spec at
 * `tests/e2e/listing-detail-mobile.spec.ts`):
 *   - The Playwright spec proves the rendered DOM has no horizontal
 *     overflow at 390 px — but it requires a running browser + dev/preview
 *     server and is not currently wired into the pr-check workflow.
 *   - This runtime test runs inside the regular `npm run ci` chain
 *     (Jest, no browser) and is fast (millisecond-level). It locks the
 *     class shape on the outer grid container so a future refactor cannot
 *     silently re-introduce the bug.
 *
 * Pre-fix (commit `dd9475cd` and earlier):
 *     <div className="grid lg:grid-cols-3 gap-8 lg:gap-10">
 * created a CSS Grid container on ALL viewports. At <lg (390 px) the
 * single implicit column stretched to fit the widest child; frontend-
 * auditor measured `gridTemplateColumns: "1640px"` at 390 px viewport
 * and `scrollX: 1266` masked only by `body { overflow-x: hidden }`.
 *
 * Post-fix:
 *     <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:gap-10">
 * stacks vertically on <lg (no horizontal columns), and becomes the
 * original 3-column grid at lg+ (byte-identical desktop behavior).
 *
 * Reference: docs/audits/exclusive-launch-readiness-audit-2026-05-20.md
 * Section 2, finding A1.
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

describe("A1 — listing-detail outer grid is mobile-stack at <lg", () => {
  let source = "";

  beforeAll(() => {
    source = fs.readFileSync(LISTING_DETAIL_PATH, "utf8");
  });

  test("listing detail file exists and is non-empty", () => {
    expect(source.length).toBeGreaterThan(0);
  });

  test("outer grid uses `flex flex-col` at <lg and `lg:grid lg:grid-cols-3` at lg+", () => {
    // The fix shape: `flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:gap-10`
    // — stacks vertically on <lg, 3-col grid at lg+.
    expect(source).toMatch(
      /className="flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:gap-10"/,
    );
  });

  test("no JSX className uses the pre-fix `grid lg:grid-cols-3` pattern", () => {
    // Pre-fix pattern: a literal `grid lg:grid-cols-3` at the start of
    // a className (no `lg:` prefix on `grid`) creates a Grid container at
    // every viewport — that is the bug. Allow `lg:grid lg:grid-cols-3` but
    // forbid the unprefixed `grid lg:grid-cols-3` in any actual className
    // (the audit's exact site).
    //
    // We scan all `className="..."` literals and reject any whose value
    // starts with or contains `grid lg:grid-cols-3` (unprefixed `grid`).
    // Comments / strings inside JS are excluded by only matching the
    // attribute syntax.
    const classNameRegex = /className="([^"]+)"/g;
    const offenders: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = classNameRegex.exec(source)) !== null) {
      const value = m[1];
      // Forbid unprefixed `grid` immediately followed by `lg:grid-cols-3`.
      // `lg:grid lg:grid-cols-3` is fine — `grid` there is prefixed.
      if (/(?:^|\s)grid\s+lg:grid-cols-3\b/.test(value)) {
        offenders.push(value);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("main column carries `min-w-0` so flex/grid children cannot blow out the track", () => {
    // Flex items default to `min-width: auto`, which lets a child like a
    // long-image carousel push the column past its parent. `min-w-0` is
    // the canonical Tailwind fix.
    expect(source).toMatch(/lg:col-span-2\s+min-w-0/);
  });

  test("sidebar column also carries `min-w-0` (defensive)", () => {
    expect(source).toMatch(/lg:col-span-1\s+min-w-0/);
  });

  test("sidebar remains `hidden lg:block` so it does not stack on mobile inside the flex container", () => {
    // At <lg the outer is now `flex flex-col`. If the sidebar were
    // visible at <lg it would add a second vertical stack item; but it's
    // `hidden lg:block` so mobile gets only the main column + the
    // separate `lg:hidden` mobile inquiry form section at the bottom.
    expect(source).toMatch(/lg:col-span-1\s+min-w-0\s+hidden\s+lg:block/);
  });
});
