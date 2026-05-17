/// <reference types="jest" />
/**
 * Source-pin tests for scripts/reconcile-projection-idx-display.ts that
 * enforce Codex's PR #148 feedback: execute mode must NEVER silently
 * succeed when reconciliation is incomplete.
 *
 * The script supports two modes:
 *   --execute  → real writes
 *   (default)  → dry-run, read-only
 *
 * Required behaviors (regression-pinned here):
 *   1. EXECUTE mode + stats.errors > 0           → process.exitCode = 1
 *   2. EXECUTE mode + post-flight any-gate drift → process.exitCode = 1
 *   3. DRY-RUN mode must NOT promote drift to non-zero exit
 *      (drift left in place is the whole point of dry-run)
 *   4. Per-row try/catch must remain so one bad row doesn't abort the batch
 *   5. Failure summary must be printed when execute mode didn't fully
 *      reconcile so an operator sees the problem without reading logs
 *
 * Pure source-regex test — fast, deterministic, no DB required.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "reconcile-projection-idx-display.ts");

describe("reconcile-projection-idx-display — Codex PR #148 exit-code contract", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(SCRIPT_PATH, "utf8");
  });

  it("script file exists at the expected path", () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });

  it("guards the exit-code logic under `if (EXECUTE)` — dry-run never trips it", () => {
    // The whole exit-code block must sit inside the EXECUTE guard so a
    // dry-run with drift > 0 does not produce a non-zero exit. This is
    // Codex requirement (3).
    expect(src).toMatch(/if\s*\(\s*EXECUTE\s*\)\s*\{[\s\S]*?process\.exitCode\s*=\s*1/);
  });

  it("promotes stats.errors > 0 to a non-zero exit code (Codex requirement 1)", () => {
    // Match the predicate that detects per-row errors in execute mode.
    expect(src).toMatch(/stats\.errors\s*>\s*0/);
  });

  it("promotes post-flight residual drift > 0 to a non-zero exit code (Codex requirement 2)", () => {
    // Match the predicate that detects residual drift after writes.
    // post.any_gate is the post-flight gate-field drift total.
    expect(src).toMatch(/post\.any_gate\s*>\s*0/);
  });

  it("sets process.exitCode = 1 only via process.exitCode assignment, never process.exit()", () => {
    // process.exit() would skip the prisma.$disconnect() finally hook
    // and abruptly terminate. Use process.exitCode = 1 + return so the
    // outer .finally() block still runs.
    expect(src).toMatch(/process\.exitCode\s*=\s*1/);
    // Defensive: no naked process.exit(1) calls that would skip finally
    expect(src).not.toMatch(/process\.exit\s*\(\s*1\s*\)/);
  });

  it("prints a clearly-marked failure summary when execute mode did not converge (Codex requirement 6)", () => {
    // Operator-visible failure banner so the problem isn't buried.
    expect(src).toMatch(/EXECUTE MODE FAILED/);
  });

  it("includes a row-error failure-summary message when stats.errors > 0", () => {
    expect(src).toMatch(/row error\(s\)/);
  });

  it("includes a residual-drift failure-summary message when post-flight drift > 0", () => {
    expect(src).toMatch(/drift row\(s\) remain/);
  });

  it("preserves the per-row try/catch around dualWriteProjectionForListingId (Codex requirement 5)", () => {
    // A single bad row must increment stats.errors but the loop must
    // continue. Pattern: try { ...dualWrite... } catch { stats.errors++ }
    expect(src).toMatch(
      /try\s*\{[\s\S]*?dualWriteProjectionForListingId\s*\([\s\S]*?\}\s*catch[\s\S]*?stats\.errors\+\+/,
    );
  });

  it("the per-row catch logs the failing row's listing_id for operator triage", () => {
    expect(src).toMatch(/\[error\s*\$\{stats\.scanned\}\]\s*\$\{row\.listing_id\}/);
  });

  it("dry-run mode is documented and required — execute is opt-in via --execute flag", () => {
    expect(src).toMatch(/const\s+EXECUTE\s*=\s*args\.includes\(\s*["']--execute["']\s*\)/);
  });

  it("dry-run path increments stats.reconciled (planned) without calling dualWriteProjectionForListingId", () => {
    // The !EXECUTE branch must increment the planned counter but NOT
    // hit the write helper. Codex requirement 4 (dry-run stays safe).
    const dryRunBranch = src.match(/if\s*\(\s*!EXECUTE\s*\)\s*\{[\s\S]*?continue;/);
    expect(dryRunBranch).not.toBeNull();
    expect(dryRunBranch![0]).not.toMatch(/dualWriteProjectionForListingId\s*\(/);
    expect(dryRunBranch![0]).toMatch(/stats\.reconciled\+\+/);
  });

  it("post-flight totalDriftCount() is called AFTER the loop so residual drift is measured", () => {
    // The drift check must happen after writes complete. Verified via
    // ordering: the totalDriftCount call labeled "post" appears between
    // the loop body and the Summary section.
    const postDriftCall = src.indexOf("const post = await totalDriftCount()");
    const summaryHeader = src.indexOf("─── Summary ───");
    const exitCodeBlock = src.indexOf("EXECUTE MODE FAILED");
    expect(postDriftCall).toBeGreaterThan(0);
    expect(summaryHeader).toBeGreaterThan(postDriftCall);
    expect(exitCodeBlock).toBeGreaterThan(summaryHeader);
  });

  it("outer .catch promotes ANY unhandled script error to exit 1 (covers dry-run script failures)", () => {
    // The promise chain at the bottom of the file must have a .catch
    // that sets exitCode = 1 for unhandled errors. This is the only way
    // a dry-run can exit non-zero (per Codex requirement 3, drift alone
    // never trips dry-run).
    expect(src).toMatch(/\.catch\s*\(\s*\(err\)[\s\S]*?process\.exitCode\s*=\s*1/);
  });

  it("prisma.$disconnect runs in .finally so connections close even on failure", () => {
    expect(src).toMatch(/\.finally\s*\([\s\S]*?prisma\.\$disconnect/);
  });
});

describe("reconcile-projection-idx-display — Codex contract NOT-conditions", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(SCRIPT_PATH, "utf8");
  });

  it("does NOT exit 0 silently when execute encountered errors — the EXECUTE block has a failures.length check that gates the failure path", () => {
    // Confirm there is a failures array that's populated conditionally
    // and then checked for length before setting exit code. This is the
    // structural guarantee that the failure summary always runs when
    // appropriate.
    expect(src).toMatch(/const\s+failures(\s*:\s*string\[\])?\s*=\s*\[\]/);
    expect(src).toMatch(/failures\.push\s*\(/);
    expect(src).toMatch(/failures\.length\s*>\s*0/);
  });

  it("does NOT use process.exit() anywhere in the run() body (would skip finally hooks)", () => {
    // Defensive: process.exit() can be used in argument-parsing code
    // before run() starts. Inside run() it must NEVER appear.
    // Crude but effective: scan the whole file for any process.exit(
    // call with a non-zero argument. There should be zero.
    const matches = src.match(/process\.exit\s*\(\s*[1-9]/g);
    expect(matches).toBeNull();
  });

  it("the script's failure summary is operator-readable plain English, not just a regex/code string", () => {
    // Sanity: the failure summary should mention what to do next.
    expect(src).toMatch(/Action:\s*investigate/i);
  });
});
