/**
 * Line-ending-portable source reading for STRUCTURAL SOURCE-INSPECTION tests.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several tests assert on the literal text of a source file (that a signature
 * exists, that a removed symbol is gone, and so on). On Windows the repository
 * is checked out with `core.autocrlf=true`, so those files carry CRLF endings:
 *
 *   lib/buildings/public-building-data.ts -> 1343 CRLF, 0 bare LF
 *
 * An assertion written as an `\n`-joined multi-line string therefore CANNOT
 * match, even though the implementation is correct:
 *
 *   LF-needle   present: false   <- test fails on Windows
 *   CRLF-needle present: true    <- implementation is fine
 *
 * That produced a permanently red suite locally while CI (LF checkout) passed —
 * a platform artifact masquerading as a code defect.
 *
 * THE RULE
 * --------
 * Normalize the SOURCE TEXT to LF inside the test harness before making a
 * structural assertion. This is a test-side concern only:
 *
 *   - do NOT normalize production source at runtime to satisfy tests;
 *   - do NOT change `core.autocrlf`;
 *   - do NOT rewrite repository line endings.
 *
 * Use `readSource()` for every structural source-inspection assertion. If a test
 * genuinely needs to assert on raw bytes or on line endings themselves, read the
 * file directly and say so explicitly — that is the intentional exception.
 */

import fs from 'fs';

/** Collapse CRLF and lone CR to LF. Leaves already-LF text untouched. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Read a source file as UTF-8 with line endings normalized to LF, so structural
 * assertions behave identically on a CRLF (Windows) and an LF (CI) checkout.
 */
export function readSource(filePath: string): string {
  return normalizeEol(fs.readFileSync(filePath, 'utf8'));
}
