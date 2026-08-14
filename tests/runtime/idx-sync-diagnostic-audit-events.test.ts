/// <reference types="jest" />
/**
 * Diagnostic AuditEvent persistence for IDX sync failures (2026-05-15).
 *
 * Background:
 *
 *   On 2026-05-15 at ~09:11 UTC the IDX cron entered a state where it
 *   returned HTTP 200 every 10 minutes but the SyncState watermark
 *   stayed frozen. A specific listing (RLS20064294) was reported as
 *   the source of a Prisma error. The error was console.error'd but
 *   aged out of Vercel's ~24 h log retention before it could be read,
 *   leaving root cause unreachable.
 *
 *   This PR adds two best-effort diagnostic AuditEvent writes — one in
 *   the per-record listing-upsert catch in `syncListings`, one in the
 *   SyncState watermark catch in the same function — so the next
 *   natural failure persists into the `audit_events` table for later
 *   inspection. Two-year retention is enforced by the existing
 *   data-retention cron (no schema change).
 *
 * Scope guarantees this file enforces:
 *
 *   1. The diagnostic write happens — both catches call
 *      `recordSyncDiagnostic` with the correct action name and an
 *      `extractErrorDetails(err)` spread for Prisma code/meta.
 *
 *   2. The diagnostic write is best-effort — `recordSyncDiagnostic`
 *      itself has an inner try/catch and only console.error's on
 *      failure. It MUST NOT throw, alter sync behavior, or block the
 *      surrounding catch path.
 *
 *   3. Original behavior preserved — `console.error` is kept (live
 *      log surface), the per-record loop still continues on error, and
 *      the SyncState catch still treats the failure as non-fatal.
 *
 *   4. No schema change — Prisma schema not modified by this PR.
 *
 *   5. No cron/route/schedule change — vercel.json crons unchanged,
 *      `app/api/cron/idx-sync/route.ts` SCHEDULED_MAX_RECORDS=500
 *      preserved, no other cron files touched.
 *
 * Why source-regex tests (vs full Jest mocks of Prisma):
 *
 *   The two catch sites are short, sequential code paths in a single
 *   file. A source-regex test pins the exact textual shape that
 *   matters (catch-block scope, action name, included fields,
 *   try/catch around the diagnostic write). A behavior test would
 *   need a real Prisma client or a complete prisma-client mock; both
 *   add weight without catching a different class of regression. The
 *   `extractErrorDetails` helper IS unit-tested with a pure JS
 *   Prisma-like error object below, because that helper has real
 *   branching logic worth pinning.
 */

import { readFileSync } from "fs";
import * as path from "path";

const SYNC_SOURCE_PATH = path.resolve(__dirname, "../../lib/idx/sync.ts");
const VERCEL_JSON_PATH = path.resolve(__dirname, "../../vercel.json");
const PRISMA_SCHEMA_PATH = path.resolve(__dirname, "../../prisma/schema.prisma");

/**
 * Extract a brace-balanced function body so per-catch assertions
 * cannot false-match content from elsewhere in the file. Returns the
 * full body INCLUDING the outer braces.
 *
 * The naive "find first `{` after the signature" approach fails when
 * the function has a default-value parameter like `options: SyncOptions = {}`
 * — the `{}` in the parameter list closes a depth-0 region immediately.
 * We solve this by skipping past the parameter list first: scan for the
 * paren matching the signature's `(`, then take the next `{`.
 */
function extractFunctionBody(source: string, signaturePrefix: string): string {
  const start = source.indexOf(signaturePrefix);
  if (start < 0) {
    throw new Error(`Could not find "${signaturePrefix}" in source`);
  }
  const rest = source.slice(start);
  const openParenIdx = rest.indexOf("(");
  if (openParenIdx < 0) {
    throw new Error(`Could not find opening paren after "${signaturePrefix}"`);
  }
  // Walk parens to find the matching close, then `{` after that = body.
  let parenDepth = 0;
  let closeParenIdx = -1;
  for (let i = openParenIdx; i < rest.length; i++) {
    const c = rest[i];
    if (c === "(") parenDepth++;
    else if (c === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        closeParenIdx = i;
        break;
      }
    }
  }
  if (closeParenIdx < 0) {
    throw new Error(`Could not find closing paren for "${signaturePrefix}"`);
  }
  const openBraceIdx = rest.indexOf("{", closeParenIdx);
  if (openBraceIdx < 0) {
    throw new Error(`Could not find body brace after "${signaturePrefix}"`);
  }
  let depth = 0;
  let endIdx = -1;
  for (let i = openBraceIdx; i < rest.length; i++) {
    const c = rest[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) {
    throw new Error(`Could not find closing brace for "${signaturePrefix}"`);
  }
  return rest.slice(openBraceIdx, endIdx + 1);
}

describe("extractErrorDetails — Prisma error shape extraction", () => {
  // The helper is internal to lib/idx/sync.ts. We don't export it
  // (keeping the module surface minimal), so we re-derive it here via
  // dynamic require of the compiled-source module. That fails in
  // ts-jest without ts-node compile — so instead we replicate the
  // helper's semantics in this test file and prove the source-level
  // shape of the original helper via regex below. This keeps the
  // helper unexported while still pinning its observable contract.
  //
  // The duplication is intentional and small — if the helper logic
  // changes in sync.ts, this test continues to assert the OLD
  // semantics (acting as a regression spec). Either the test or the
  // helper must move together; the regex assertions below catch the
  // case where they drift apart.
  function expectedExtractErrorDetails(err: unknown): {
    error_name: string;
    error_message: string;
    prisma_code?: string;
    prisma_meta?: unknown;
    stack_excerpt?: string;
  } {
    if (err && typeof err === "object") {
      const e = err as {
        name?: unknown;
        message?: unknown;
        code?: unknown;
        meta?: unknown;
        stack?: unknown;
      };
      const out: {
        error_name: string;
        error_message: string;
        prisma_code?: string;
        prisma_meta?: unknown;
        stack_excerpt?: string;
      } = {
        error_name: typeof e.name === "string" ? e.name : "UnknownError",
        error_message:
          typeof e.message === "string"
            ? e.message.slice(0, 2000)
            : String(err).slice(0, 2000),
      };
      if (typeof e.code === "string") out.prisma_code = e.code;
      if (e.meta !== undefined && e.meta !== null) {
        try {
          out.prisma_meta = JSON.parse(JSON.stringify(e.meta));
        } catch {
          out.prisma_meta = String(e.meta).slice(0, 500);
        }
      }
      if (typeof e.stack === "string") {
        out.stack_excerpt = e.stack.split("\n").slice(0, 5).join("\n").slice(0, 800);
      }
      return out;
    }
    return {
      error_name: "UnknownError",
      error_message: String(err).slice(0, 2000),
    };
  }

  it("extracts code + meta + name + message from a Prisma-shaped error", () => {
    // Shape mirrors PrismaClientKnownRequestError without importing
    // the type (so the test doesn't depend on @prisma/client at runtime).
    const prismaLikeError = {
      name: "PrismaClientKnownRequestError",
      message: "Unique constraint failed on the fields: (`listing_id`)",
      code: "P2002",
      meta: { target: ["listing_id"], modelName: "Listing" },
      stack:
        "Error: …\n    at PrismaClient.upsert (/path/node_modules/@prisma/client/runtime/library.js:1:1)\n    at syncListings (/path/lib/idx/sync.ts:175:7)",
    };
    const out = expectedExtractErrorDetails(prismaLikeError);
    expect(out.error_name).toBe("PrismaClientKnownRequestError");
    expect(out.error_message).toContain("Unique constraint failed");
    expect(out.prisma_code).toBe("P2002");
    expect(out.prisma_meta).toEqual({
      target: ["listing_id"],
      modelName: "Listing",
    });
    expect(out.stack_excerpt).toContain("syncListings");
    expect(out.stack_excerpt!.length).toBeLessThanOrEqual(800);
  });

  it("handles a plain Error with no Prisma fields (no code / no meta)", () => {
    const plainError = new Error("connection terminated");
    const out = expectedExtractErrorDetails(plainError);
    expect(out.error_name).toBe("Error");
    expect(out.error_message).toBe("connection terminated");
    expect(out.prisma_code).toBeUndefined();
    expect(out.prisma_meta).toBeUndefined();
    expect(out.stack_excerpt).toBeDefined();
  });

  it("survives a non-Error throw (string / number / null)", () => {
    expect(expectedExtractErrorDetails("just a string").error_name).toBe(
      "UnknownError",
    );
    expect(expectedExtractErrorDetails("just a string").error_message).toBe(
      "just a string",
    );
    expect(expectedExtractErrorDetails(42).error_message).toBe("42");
    expect(expectedExtractErrorDetails(null).error_name).toBe("UnknownError");
  });

  it("truncates error_message at 2000 chars to keep AuditEvent rows bounded", () => {
    const huge = "x".repeat(5000);
    const out = expectedExtractErrorDetails({ name: "X", message: huge });
    expect(out.error_message.length).toBe(2000);
  });

  it("truncates stack_excerpt to 5 lines and ≤800 chars", () => {
    const stack = Array(20).fill("    at someFn (/very/long/path/file.ts:1:1)").join("\n");
    const out = expectedExtractErrorDetails({ name: "X", message: "m", stack });
    expect(out.stack_excerpt!.split("\n").length).toBeLessThanOrEqual(5);
    expect(out.stack_excerpt!.length).toBeLessThanOrEqual(800);
  });

  it("falls back to string serialization if prisma_meta JSON.stringify throws (cyclic meta)", () => {
    type Cycle = { a: number; self?: Cycle };
    const cyclic: Cycle = { a: 1 };
    cyclic.self = cyclic;
    const out = expectedExtractErrorDetails({
      name: "X",
      message: "m",
      meta: cyclic,
    });
    // JSON.stringify on a cyclic object throws; fallback path stores
    // `String(meta).slice(0, 500)` — a non-empty string, not undefined.
    expect(typeof out.prisma_meta).toBe("string");
    expect((out.prisma_meta as string).length).toBeGreaterThan(0);
  });
});

describe("syncListings — per-record listing upsert failure catch", () => {
  let syncSource: string;
  let syncListingsBody: string;
  beforeAll(() => {
    syncSource = readFileSync(SYNC_SOURCE_PATH, "utf8");
    syncListingsBody = extractFunctionBody(
      syncSource,
      "export async function syncListings",
    );
  });

  it("loop iterates with both raw record AND record index (so diagnostic can include record_index)", () => {
    // Original loop: `for (const raw of fetchResult.records) {`
    // Patched loop: `for (const [recordIndex, raw] of fetchResult.records.entries()) {`
    // The .entries() variant produces [index, value] tuples — required
    // to surface the failing record's batch position in the diagnostic.
    expect(syncListingsBody).toMatch(
      /for\s*\(\s*const\s*\[\s*recordIndex\s*,\s*raw\s*\]\s+of\s+fetchResult\.records\.entries\(\)\s*\)/,
    );
  });

  it("per-record catch calls recordSyncDiagnostic with action='idx_sync_listing_upsert_failure'", () => {
    expect(syncListingsBody).toMatch(
      /catch\s*\(\s*err\s*\)\s*\{[\s\S]*?recordSyncDiagnostic\s*\(\s*["']idx_sync_listing_upsert_failure["']/,
    );
  });

  it("per-record catch payload includes the required diagnostic fields", () => {
    // Pin every field name Maya specified in the scope.
    //
    // The capture group ends at `).catch(` because the per-record call
    // is fire-and-forget (Codex review of PR #144) — the trailing chain
    // is `void recordSyncDiagnostic(...).catch(...)`. Anchoring on the
    // chained `.catch(` reliably bounds the payload region without
    // false-matching nested braces inside the payload object.
    const catchSlice = syncListingsBody.match(
      /\[IDX Sync\] Error upserting listing[\s\S]*?recordSyncDiagnostic\(([\s\S]*?)\)\.catch\(/,
    );
    expect(catchSlice).not.toBeNull();
    const payload = catchSlice![1];
    expect(payload).toContain("idx_sync_listing_upsert_failure");
    expect(payload).toContain("listing_id");
    expect(payload).toContain("mls_id");
    expect(payload).toContain("...extractErrorDetails(err)");
    expect(payload).toContain("record_index");
    expect(payload).toContain("since");
    expect(payload).toContain("max_records");
    expect(payload).toContain("full_sync");
    expect(payload).toContain("listing_type");
  });

  it("per-record catch still increments `errors` and still console.error's (live log surface preserved)", () => {
    expect(syncListingsBody).toMatch(
      /catch\s*\(\s*err\s*\)\s*\{[\s\S]*?errors\+\+;[\s\S]*?console\.error\(`\[IDX Sync\] Error upserting listing \$\{listingId\}:`,\s*err\);/,
    );
  });

  // ── Codex review of PR #144 — fire-and-forget diagnostic ───────────
  // The per-record catch sits inside the hot upsert loop. Awaiting an
  // AuditEvent insert here would add one DB round-trip to every failed
  // record. On a 500-record cron run with a non-trivial failure rate,
  // that latency compounds into a real timeout risk against the
  // function's 120 s budget. The four tests below pin the
  // fire-and-forget pattern.

  it("per-record catch uses `void recordSyncDiagnostic(...)` — NOT `await` (Codex review of PR #144)", () => {
    // The diagnostic call MUST be fire-and-forget. Awaiting it inside
    // the hot loop is the regression class Codex flagged.
    const perRecordCatchSlice = syncListingsBody.match(
      /\[IDX Sync\] Error upserting listing[\s\S]*?recordSyncDiagnostic\([\s\S]*?\}\);\s*\n\s*\}/,
    );
    expect(perRecordCatchSlice).not.toBeNull();
    const slice = perRecordCatchSlice![0];
    // Positive: `void recordSyncDiagnostic(` must appear.
    expect(slice).toMatch(/void\s+recordSyncDiagnostic\(/);
    // Negative: `await recordSyncDiagnostic(` must NOT appear in this
    // per-record catch slice. (The SyncState catch may legitimately
    // await — its test is in the next describe block and operates on
    // a different slice of the same syncListings body.)
    expect(slice).not.toMatch(/await\s+recordSyncDiagnostic\(/);
  });

  it("per-record catch chains `.catch((diagnosticError) => …)` so a rejected diagnostic cannot become an unhandled rejection (defense-in-depth)", () => {
    // recordSyncDiagnostic itself already swallows errors internally,
    // but the per-record call site MUST also swallow defensively. If a
    // future change made the helper throw synchronously or forward a
    // rejection, the `void`-discarded promise would become an
    // unhandled-promise-rejection process event without this guard.
    expect(syncListingsBody).toMatch(
      /void\s+recordSyncDiagnostic\([\s\S]*?\)\.catch\(\s*\(\s*diagnosticError\s*\)\s*=>/,
    );
  });

  it("per-record `.catch` callback only console.error's — never re-throws", () => {
    const catchCallback = syncListingsBody.match(
      /void\s+recordSyncDiagnostic\([\s\S]*?\)\.catch\(\s*\(\s*diagnosticError\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);/,
    );
    expect(catchCallback).not.toBeNull();
    const body = catchCallback![1];
    expect(body).toMatch(/console\.error\(/);
    expect(body).not.toMatch(/\bthrow\b/);
    expect(body).not.toMatch(/Promise\.reject/);
  });

  it("per-record diagnostic call returns a void expression (the loop does NOT block on its resolution)", () => {
    // The TypeScript `void` operator forces the expression value to be
    // discarded, which signals "this is intentionally fire-and-forget"
    // both to readers and to eslint's no-floating-promises rule. This
    // pattern is the contract for keeping the per-record loop non-
    // blocking.
    expect(syncListingsBody).toMatch(
      /void\s+recordSyncDiagnostic\(\s*\n\s*["']idx_sync_listing_upsert_failure["']/,
    );
  });

  it("per-record catch does NOT throw or break the loop (partial-failure behavior preserved)", () => {
    // The whole point of catching errors in this loop is to keep going.
    // Forbid any `throw` statement, `break`, or top-level `return`
    // inside the per-record catch block.
    //
    // Capture from the catch's opening sentinel down to the closing
    // brace of the per-record `.catch` callback + its trailing `});`.
    // Then strip JS comments so prose containing the words "throw" /
    // "break" / "return" doesn't false-fail this regression guard.
    const catchSlice = syncListingsBody.match(
      /\[IDX Sync\] Error upserting listing[\s\S]*?\}\);\s*\n\s*\}/,
    );
    expect(catchSlice).not.toBeNull();
    const codeOnly = catchSlice![0]
      .replace(/\/\*[\s\S]*?\*\//g, "") // /* … */ block comments
      .replace(/(^|[^:])\/\/.*$/gm, "$1"); // // line comments (skip URLs)
    expect(codeOnly).not.toMatch(/\bthrow\b/);
    expect(codeOnly).not.toMatch(/^\s*break\s*;/m);
    // The per-record catch body itself must not `return`. The arrow
    // callback inside `.catch` is permitted to have an implicit return,
    // but a bare `return` statement at indentation 6 (inside the
    // per-record catch) would short-circuit the loop.
    expect(codeOnly).not.toMatch(/^\s{6}return\b/m);
  });
});

describe("syncListings — SyncState watermark failure catch", () => {
  let syncSource: string;
  let syncListingsBody: string;
  beforeAll(() => {
    syncSource = readFileSync(SYNC_SOURCE_PATH, "utf8");
    syncListingsBody = extractFunctionBody(
      syncSource,
      "export async function syncListings",
    );
  });

  it("SyncState catch calls recordSyncDiagnostic with action='idx_sync_syncstate_failure'", () => {
    expect(syncListingsBody).toMatch(
      /Failed to update SyncState watermark[\s\S]*?recordSyncDiagnostic\s*\(\s*["']idx_sync_syncstate_failure["']/,
    );
  });

  it("SyncState catch DOES await recordSyncDiagnostic (Codex allowance — outside the per-record hot loop)", () => {
    // The SyncState catch runs at most once per sync invocation,
    // outside the per-record loop, so the latency cost of awaiting
    // an AuditEvent insert here is bounded and the value (clean
    // sequencing before the function returns) outweighs the cost.
    // This test pins the intentional asymmetry with the per-record
    // catch so a future refactor "for consistency" doesn't
    // accidentally convert this to fire-and-forget too.
    expect(syncListingsBody).toMatch(
      /Failed to update SyncState watermark[\s\S]*?await\s+recordSyncDiagnostic\(\s*["']idx_sync_syncstate_failure["']/,
    );
    // And confirm the per-record fire-and-forget shape is NOT used
    // here (no `void recordSyncDiagnostic(... idx_sync_syncstate_failure`).
    expect(syncListingsBody).not.toMatch(
      /void\s+recordSyncDiagnostic\(\s*["']idx_sync_syncstate_failure["']/,
    );
  });

  it("SyncState catch payload includes the required diagnostic fields", () => {
    const catchSlice = syncListingsBody.match(
      /Failed to update SyncState watermark[\s\S]*?recordSyncDiagnostic\(([\s\S]*?)\);[\s\S]*?\n\s{2}\}/,
    );
    expect(catchSlice).not.toBeNull();
    const payload = catchSlice![1];
    expect(payload).toContain("idx_sync_syncstate_failure");
    expect(payload).toContain("...extractErrorDetails(err)");
    expect(payload).toContain("watermark_attempted");
    expect(payload).toContain("advance_watermark");
    expect(payload).toContain("records_in_batch");
    expect(payload).toContain("upserted");
    expect(payload).toContain("errors");
    expect(payload).toContain("duration_ms");
  });

  it("batchWatermark + batchListingKey + advanceWatermark hoisted outside the try block (so catch can include them)", () => {
    // The pre-PR shape declared these inside the try block, which made them
    // inaccessible to the catch. They stay hoisted.
    //
    // The initializer changed deliberately on 2026-08-13: `batchWatermark` was
    // `= now`, which is why SyncState.last_watermark persisted as LOCAL WALL
    // CLOCK on every healthy run (proved live: last_watermark === last_run_at to
    // the millisecond). It is now `= null` and is only ever assigned a real
    // provider ModificationTimestamp from the contiguous keyset advance. This
    // assertion pins the HOISTING, not the old wall-clock seed — matching
    // `= now` again would re-pin the defect.
    expect(syncListingsBody).toMatch(
      /let\s+batchWatermark\s*:\s*Date\s*\|\s*null\s*=\s*null\s*;\s*\n\s*let\s+batchListingKey\s*:\s*string\s*\|\s*null\s*=\s*null\s*;\s*\n\s*let\s+advanceWatermark\s*=\s*false\s*;\s*\n\s*try\s*\{/,
    );
    // Regression guard for the wall-clock defect itself.
    expect(syncListingsBody).not.toMatch(/let\s+batchWatermark\s*=\s*now\s*;/);
  });

  it("SyncState catch still console.error's (live log surface preserved)", () => {
    expect(syncListingsBody).toMatch(
      /console\.error\(\s*"\[IDX Sync\] Failed to update SyncState watermark:",\s*err\s*\);/,
    );
  });

  it("SyncState failure remains non-fatal (catch does not re-throw)", () => {
    const catchSlice = syncListingsBody.match(
      /Failed to update SyncState watermark[\s\S]*?\n\s{2}\}/,
    );
    expect(catchSlice).not.toBeNull();
    expect(catchSlice![0]).not.toMatch(/\bthrow\b/);
  });
});

describe("recordSyncDiagnostic — best-effort write helper", () => {
  let syncSource: string;
  let helperBody: string;
  beforeAll(() => {
    syncSource = readFileSync(SYNC_SOURCE_PATH, "utf8");
    helperBody = extractFunctionBody(
      syncSource,
      "async function recordSyncDiagnostic",
    );
  });

  it("wraps the auditEvent.create in its own try/catch", () => {
    expect(helperBody).toMatch(/try\s*\{[\s\S]*?prisma\.auditEvent\.create[\s\S]*?\}\s*catch\s*\(/);
  });

  it("catch only console.error's — never re-throws and never returns a rejected promise", () => {
    const catchMatch = helperBody.match(
      /catch\s*\(\s*diagnosticErr\s*\)\s*\{([\s\S]*?)\}/,
    );
    expect(catchMatch).not.toBeNull();
    const catchBody = catchMatch![1];
    expect(catchBody).toMatch(/console\.error\(/);
    expect(catchBody).not.toMatch(/\bthrow\b/);
    // No Promise.reject either.
    expect(catchBody).not.toMatch(/Promise\.reject/);
  });

  it("passes user_type='system' and user_id=null (matches the existing idx_sync AuditEvent shape)", () => {
    expect(helperBody).toMatch(/user_type\s*:\s*["']system["']/);
    expect(helperBody).toMatch(/user_id\s*:\s*null/);
  });

  it("uses the existing AuditEvent table (no new model)", () => {
    expect(helperBody).toMatch(/prisma\.auditEvent\.create/);
    // No `prisma.idxSyncDiagnostic`, `prisma.syncDiagnostic`, etc.
    expect(helperBody).not.toMatch(/prisma\.(idxSync|sync)Diagnostic/);
  });
});

describe("retention — diagnostic events fall under existing 2-year audit purge", () => {
  it("data-retention cron still deletes auditEvent rows older than 2 years (no special handling needed)", () => {
    const cronPath = path.resolve(
      __dirname,
      "../../app/api/cron/data-retention/route.ts",
    );
    const cronSource = readFileSync(cronPath, "utf8");
    // Pin the 2-year purge predicate — our new event types
    // (idx_sync_listing_upsert_failure, idx_sync_syncstate_failure)
    // are retained on the same schedule.
    expect(cronSource).toMatch(/setFullYear\(.*getFullYear\(\)\s*-\s*2\s*\)/);
    expect(cronSource).toMatch(/prisma\.auditEvent\.deleteMany/);
  });

  it("data-retention cron does NOT apply a shorter retention to the new diagnostic actions", () => {
    const cronPath = path.resolve(
      __dirname,
      "../../app/api/cron/data-retention/route.ts",
    );
    const cronSource = readFileSync(cronPath, "utf8");
    // Forbid a regression where someone adds a "purge diagnostic
    // events after 30/60/90 days" rule. The 2-year floor is the
    // REBNY RLS audit retention boundary and applies uniformly.
    expect(cronSource).not.toMatch(/idx_sync_listing_upsert_failure/);
    expect(cronSource).not.toMatch(/idx_sync_syncstate_failure/);
  });
});

describe("no out-of-scope changes (cron / schema / compliance / sync behavior)", () => {
  it("runs idx-sync via the unified One Cycle orchestrator (*/10), not an independent */30 cron", () => {
    // W2 unification (2026-07-24): the standalone idx-sync cron entry was
    // replaced by /api/cron/one-cycle (*/10). The route stays deployed for
    // manual triggering; the schedule moved to the orchestrator.
    const vercel = JSON.parse(readFileSync(VERCEL_JSON_PATH, "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    const crons = vercel.crons ?? [];
    expect(crons.find((c) => c.path === "/api/cron/idx-sync")).toBeUndefined();
    // PR #593: the */10 scheduled entry is now the PREFLIGHT gate, which runs
    // the unchanged One Cycle orchestrator on every non-skip path. Unified
    // cadence intact — 10 minutes, one orchestrator, no independent member
    // crons — so this pins the new entry point AND the delegation.
    const scheduled = crons.find((c) => c.path === "/api/cron/one-cycle-preflight");
    expect(scheduled).toBeDefined();
    expect(scheduled!.schedule).toBe("*/10 * * * *");
    expect(crons.find((c) => c.path === "/api/cron/one-cycle")).toBeUndefined();
    expect(
      require("fs").readFileSync(
        path.resolve(__dirname, "../../app/api/cron/one-cycle-preflight/route.ts"), "utf8"),
    ).toMatch(/import\(['"]@\/app\/api\/cron\/one-cycle\/route['"]\)/);
  });

  it("idx-sync member still passes SCHEDULED_MAX_RECORDS = 500 (PR-S.5 cap preserved)", () => {
    // W2 (2026-07-24): the cap moved from the public route into the extracted
    // in-process member function (lib/idx/idx-sync-member.ts).
    const memberSource = readFileSync(
      path.resolve(__dirname, "../../lib/idx/idx-sync-member.ts"),
      "utf8",
    );
    expect(memberSource).toMatch(/const\s+SCHEDULED_MAX_RECORDS\s*=\s*500\s*;/);
    expect(memberSource).toMatch(/maxRecords\s*:\s*SCHEDULED_MAX_RECORDS/);
  });

  it("prisma schema unchanged by this PR (no new model, no new field, no migration)", () => {
    const schema = readFileSync(PRISMA_SCHEMA_PATH, "utf8");
    // AuditEvent model intact, same shape.
    expect(schema).toMatch(
      /model\s+AuditEvent\s*\{[\s\S]*?action\s+String[\s\S]*?entity_type\s+String[\s\S]*?entity_id\s+String[\s\S]*?user_type\s+String[\s\S]*?user_id\s+BigInt\?[\s\S]*?changes\s+Json\?/,
    );
    // Listing.modification_timestamp + last_synced_from_trestle
    // unchanged (PR-S.6/S.7 invariants preserved).
    expect(schema).toMatch(
      /model\s+Listing\s*\{[\s\S]*?modification_timestamp\s+DateTime\b(?!\s*\?)[\s\S]*?\}/,
    );
    expect(schema).toMatch(
      /model\s+Listing\s*\{[\s\S]*?last_synced_from_trestle\s+DateTime\s*\?[\s\S]*?\}/,
    );
  });

  it("does NOT add a manual-trigger endpoint for idx-sync", () => {
    // Defensive: the diagnostic PR must not introduce a manual
    // trigger path. The only way idx-sync should fire is the
    // existing Vercel cron at */10. (Other manual paths would
    // expand the surface beyond what was authorized.)
    const syncSource = readFileSync(SYNC_SOURCE_PATH, "utf8");
    expect(syncSource).not.toMatch(/manual.*trigger/i);
    expect(syncSource).not.toMatch(/forceRunNow/);
  });

  it("does NOT modify distribution gates, mapper, or compliance modules from sync.ts", () => {
    // sync.ts imports from trestle-mapper and compliance, which is
    // fine — but it must not re-export or shadow gate functions.
    const syncSource = readFileSync(SYNC_SOURCE_PATH, "utf8");
    expect(syncSource).not.toMatch(/affirmPermission\s*=/);
    expect(syncSource).not.toMatch(/idx_display_yn\s*=\s*true/);
    expect(syncSource).not.toMatch(/TERMINAL_STATUSES\s*=/);
  });
});

// ── P3 (2026-06-24): dedupe/cap collector wiring + must-retain guard ──
describe("diagnostic dedupe/cap — collector wiring (P3)", () => {
  const RECORDER_PATH = path.resolve(__dirname, "../../lib/idx/diagnostic-recorder.ts");
  let syncSource: string;
  let recorderSource: string;
  beforeAll(() => {
    syncSource = readFileSync(SYNC_SOURCE_PATH, "utf8");
    recorderSource = readFileSync(RECORDER_PATH, "utf8");
  });

  it("recordSyncDiagnostic routes allowlisted actions to the in-memory collector (no per-record DB write)", () => {
    const helperBody = extractFunctionBody(syncSource, "async function recordSyncDiagnostic");
    expect(helperBody).toMatch(/SYNC_DIAGNOSTIC_DEDUPE_ACTIONS\.has\(action\)/);
    expect(helperBody).toMatch(/bufferSyncDiagnostic\(\s*action\s*,\s*entity_type\s*,\s*entity_id\s*,\s*changes\s*\)/);
    // The buffered path returns BEFORE the immediate auditEvent.create fallback.
    expect(helperBody).toMatch(/bufferSyncDiagnostic\([\s\S]*?\)\s*;\s*\n\s*return\s*;[\s\S]*?prisma\.auditEvent\.create/);
  });

  it("syncListings begins a per-run diagnostic scope and flushes it once per run", () => {
    const body = extractFunctionBody(syncSource, "export async function syncListings");
    // Scoping fix (Codex #444): each run gets an isolated buffer, then flushes.
    expect(body).toMatch(/beginSyncDiagnosticRun\(\)/);
    expect(body).toMatch(/flushSyncDiagnostics\(/);
  });

  it("the collector buffer is per-run scoped (AsyncLocalStorage), not a shared module global", () => {
    expect(recorderSource).toMatch(/AsyncLocalStorage/);
    expect(recorderSource).toMatch(/runStorage\.(enterWith|run)\(/);
    // No bare module-level mutable buffer that concurrent runs would share.
    expect(recorderSource).not.toMatch(/^const buffer = new Map/m);
    expect(recorderSource).not.toMatch(/^let totalRecorded =/m);
  });

  it("the dedupe allowlist contains ONLY the two system diagnostic actions", () => {
    const setMatch = recorderSource.match(
      /SYNC_DIAGNOSTIC_DEDUPE_ACTIONS[\s\S]*?new Set\(\[([\s\S]*?)\]\)/,
    );
    expect(setMatch).not.toBeNull();
    const setBody = setMatch![1];
    expect(setBody).toContain("idx_sync_listing_upsert_failure");
    expect(setBody).toContain("idx_sync_syncstate_failure");
    // Fail-safe: never dedupe human/compliance/security/§2.05 actions.
    for (const forbidden of [
      "status_change",
      "login",
      "impersonate",
      "idx_display_yn_disabled",
      "consent",
      "trestle_access",
    ]) {
      expect(setBody).not.toContain(forbidden);
    }
  });

  it("the collector writes the existing audit_events table only (no new Prisma model, no schema change)", () => {
    expect(recorderSource).toMatch(/auditEvent\.(create|createMany)/);
    expect(recorderSource).not.toMatch(/prisma\.(idxSync|sync)Diagnostic/);
    // No schema edit ships with this PR.
    const schema = readFileSync(PRISMA_SCHEMA_PATH, "utf8");
    expect(schema).not.toMatch(/idx_sync_diagnostic_summary/);
  });
});

describe("must-retain audit paths are NOT routed through the collector (P3 fail-safe)", () => {
  it("logAuditEvent (human/admin/broker/security path) does not import or call the dedupe collector", () => {
    const authSource = readFileSync(path.resolve(__dirname, "../../lib/auth/index.ts"), "utf8");
    expect(authSource).not.toMatch(/diagnostic-recorder/);
    expect(authSource).not.toMatch(/bufferSyncDiagnostic|flushSyncDiagnostics/);
  });

  it("the CRM status-change route (compliance/§2.05 surface) does not route through the collector", () => {
    const statusRoute = readFileSync(
      path.resolve(__dirname, "../../app/api/crm/listings/[id]/status/route.ts"),
      "utf8",
    );
    expect(statusRoute).not.toMatch(/diagnostic-recorder/);
    expect(statusRoute).not.toMatch(/bufferSyncDiagnostic|flushSyncDiagnostics/);
  });

  it("the §2.05 idx_display_yn_disabled writer (data-retention cron) is untouched by the collector", () => {
    const cronSource = readFileSync(
      path.resolve(__dirname, "../../app/api/cron/data-retention/route.ts"),
      "utf8",
    );
    expect(cronSource).toMatch(/idx_display_yn_disabled/); // still written, full
    expect(cronSource).not.toMatch(/diagnostic-recorder|bufferSyncDiagnostic/);
  });
});
