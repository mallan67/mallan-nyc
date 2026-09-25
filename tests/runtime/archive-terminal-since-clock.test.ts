/// <reference types="jest" />
/**
 * Archive Eligibility Clock PR-1 (#415) — clock plumbing wiring.
 *
 * Pins: schema column + index; the shared helper is wired into every terminal-status
 * writer (sync create+update, agent-history, CRM status route, feed-reconcile create +
 * ghost-withdraw, listing-expiration, import-closed); the migration is additive; the
 * backfill defaults to dry-run. PR-2 (#415) repoints the T+180 archive eligibility behind
 * the existing flag to terminal_since (flag-OFF stays legacy; flag stays env-gated, never
 * hardcoded true) — pinned in the "archive predicate repoint (PR-2)" block below.
 */
import { readFileSync } from "fs";
import * as path from "path";
const root = (p: string) => path.resolve(__dirname, "../../", p);
const read = (p: string) => readFileSync(root(p), "utf8");

describe("schema + migration", () => {
  it("Listing has terminal_since column + index", () => {
    const s = read("prisma/schema.prisma");
    expect(s).toMatch(/terminal_since\s+DateTime\?\s+@map\("terminal_since"\)/);
    expect(s).toMatch(/@@index\(\[terminal_since\], map: "listings_terminal_since_idx"\)/);
  });
  it("migration is additive (ADD COLUMN + CREATE INDEX), no destructive ops", () => {
    const sql = read("prisma/migrations/20260625013000_add_terminal_since/migration.sql");
    expect(sql).toMatch(/ADD COLUMN "terminal_since" TIMESTAMP/);
    expect(sql).toMatch(/CREATE INDEX "listings_terminal_since_idx"/);
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)\b/i);
    expect(sql).not.toMatch(/\bSET\s+NOT\s+NULL\b/i);
  });
});

describe("writer rule wired into every terminal-status writer", () => {
  it("sync.ts uses computeTerminalSincePatch on create + update", () => {
    const s = read("lib/idx/sync.ts");
    expect(s).toMatch(/computeTerminalSincePatch/);
    expect(s).toMatch(/\.\.\.terminalSinceCreate/);
    expect(s).toMatch(/\.\.\.terminalSinceUpdate/);
  });
  it("Trestle writers pass the un-stripped raw.ExpirationDate as expirationDateFallback (#446)", () => {
    // ExpirationDate is in PRIVATE_FIELDS → stripped from mapped.raw_data; the original
    // raw record must be fed as the Expired fallback at every Trestle call site.
    for (const f of [
      "lib/idx/sync.ts",
      "app/api/cron/feed-reconcile/route.ts",
    ]) {
      expect(read(f)).toMatch(/expirationDateFallback:\s*raw\.ExpirationDate/);
    }
  });
  it("CRM status route uses computeTerminalSincePatch + passes typed expiration_date fallback (#446)", () => {
    const s = read("app/api/crm/listings/[id]/status/route.ts");
    expect(s).toMatch(/computeTerminalSincePatch/);
    expect(s).toMatch(/expirationDateFallback:\s*listing\.expiration_date/);
  });
  it("feed-reconcile sets terminal_since on create + ghost→Withdrawn", () => {
    const s = read("app/api/cron/feed-reconcile/route.ts");
    expect(s).toMatch(/computeTerminalSincePatch/);
    expect(s).toMatch(/terminal_since:\s*now/);
  });
  it("listing-expiration seeds terminal_since from the actual expiration_date (not cron run time)", () => {
    expect(read("app/api/cron/listing-expiration/route.ts")).toMatch(/terminal_since:\s*listing\.expiration_date/);
  });
  it("import-closed sets terminal_since from the stable date", () => {
    expect(read("scripts/import-closed-from-trestle.ts")).toMatch(/deriveTerminalSince/);
  });
  it("CRM DELETE (soft-delete → Withdrawn) sets terminal_since (#446)", () => {
    const s = read("app/api/crm/listings/[id]/route.ts");
    expect(s).toMatch(/computeTerminalSincePatch\(\{[\s\S]*?newStatus:\s*"Withdrawn"/);
  });
  it("idx/ensure-listing create wires computeTerminalSincePatch on arbitrary body.status (#446)", () => {
    const s = read("app/api/idx/ensure-listing/route.ts");
    expect(s).toMatch(/import\s*\{\s*computeTerminalSincePatch\s*\}\s*from\s*"@\/lib\/listings\/terminal-since"/);
    // create spreads the patch with previousStatus undefined + the normalized status
    expect(s).toMatch(/computeTerminalSincePatch\(\{[\s\S]*?previousStatus:\s*undefined[\s\S]*?newStatus:\s*canonicalStatus/);
  });
  it("reconcile-ghosts.js sets terminal_since: now on ghost→Withdrawn (matches the wired cron twin) (#446)", () => {
    const s = read("scripts/reconcile-ghosts.js");
    // the ghost transition update sets status Withdrawn AND terminal_since: now
    expect(s).toMatch(/status:\s*"Withdrawn",[\s\S]*?terminal_since:\s*now/);
  });
});

describe("backfill defaults to dry-run (no write without --execute)", () => {
  const s = read("scripts/backfill-terminal-since.ts");
  it("EXECUTE is gated behind the --execute flag (no write unless EXECUTE)", () => {
    expect(s).toMatch(/const EXECUTE\s*=\s*process\.argv\.includes\("--execute"\)/);
    expect(s).toMatch(/if\s*\(\s*EXECUTE\s*&&/); // the UPDATE is gated behind EXECUTE
    expect(s).toMatch(/DRY-RUN ONLY/);
  });
  it("only fills NULL terminal rows (never bumps; never touches live)", () => {
    expect(s).toMatch(/terminal_since IS NULL/);
    expect(s).toMatch(/terminalPredicate\("status"\)/); // SELECT terminal filter
  });
  it("execute UPDATE re-asserts the terminal-status predicate — cannot write to non-terminal rows (#446)", () => {
    expect(s).toMatch(/l\.terminal_since IS NULL AND \$\{terminalPredicate\("l\.status"\)\}/);
  });
  it("terminal predicate is case-insensitive + includes the single-L 'canceled' alias (#446)", () => {
    // mapper persists raw.StandardStatus verbatim, so a stored 'Canceled'/'closed' must still
    // be selected. Predicate wraps the column in lower() and lists the canonical set + alias.
    expect(s).toMatch(/const terminalPredicate\s*=\s*\(col: string\)\s*=>\s*`lower\(\$\{col\}\) IN \(/);
    expect(s).toMatch(/const TERMINAL_LOWER\s*=\s*\[/);
    for (const t of ["closed", "sold", "leased", "rented", "withdrawn", "expired", "cancelled", "canceled"]) {
      expect(s).toContain(`"${t}"`); // each terminal status (lower-case) present in TERMINAL_LOWER
    }
  });
  it("'Canceled' (single-L) is treated as terminal by the backfill predicate (#446)", () => {
    // lower('Canceled') === 'canceled', which is in TERMINAL_LOWER → matched by lower(col) IN (...)
    expect(s).toMatch(/lower\(\$\{col\}\) IN \(/);
    expect(s).toContain('"canceled"');
  });
  it("lower-case 'closed' is treated as terminal by the backfill predicate (#446)", () => {
    // a row stored as 'closed' is folded by lower() to 'closed', which is in TERMINAL_LOWER
    expect(s).toMatch(/lower\(\$\{col\}\) IN \(/);
    expect(s).toContain('"closed"');
  });
  it("SELECT and UPDATE guard share ONE predicate builder (cannot drift) (#446)", () => {
    // both call sites derive from the same terminalPredicate() → identical terminal set
    expect(s).toMatch(/terminalPredicate\("status"\)/);   // SELECT (and already_set count)
    expect(s).toMatch(/terminalPredicate\("l\.status"\)/); // --execute UPDATE guard
    expect(s).not.toMatch(/status IN \(\$\{TERMINAL/); // old case-sensitive canonical IN removed
  });
  it("seeds Expired rows from typed expiration_date via expirationDateFallback (#446)", () => {
    expect(s).toMatch(/expiration_date::text AS exp/); // selects the typed column
    expect(s).toMatch(/expirationDateFallback:\s*r\.exp/); // typed value as the helper's Expired fallback
    expect(s).not.toMatch(/r\.ed\s*\?\?\s*r\.exp/); // fragile coalesce removed (blank/invalid raw must fall through)
  });
  it("derives via the shared helper (parity with the live writer, not a SQL COALESCE)", () => {
    expect(s).toMatch(/deriveTerminalSince/);
    expect(s).toMatch(/from "\.\.\/lib\/listings\/terminal-since"/);
  });
  it("host-guarded to cold-waterfall", () => {
    expect(s).toMatch(/ep-cold-waterfall-adno3ao2/);
  });
});

describe("Gate 3 backfill — durable touched-id log invariant (Codex #451)", () => {
  const s = read("scripts/backfill-terminal-since.ts");
  it("writes the touched-id log durably (fsync) via appendDurable", () => {
    expect(s).toMatch(/function appendDurable\([\s\S]*?fsyncSync\(fd\)/);
  });
  it("writes the log BEFORE COMMIT (a committed batch can never be missing from the rollback set)", () => {
    const logIdx = s.indexOf("appendDurable(LOG_PATH");
    const commitIdx = s.indexOf('c.query("COMMIT")');
    expect(logIdx).toBeGreaterThan(-1);
    expect(commitIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeLessThan(commitIdx); // log durable on disk before the COMMIT
  });
  it("ROLLBACKs and ABORTS the run if the log write fails (no unlogged commit)", () => {
    expect(s).toMatch(/try\s*\{[\s\S]*?appendDurable\(LOG_PATH[\s\S]*?\}\s*catch[\s\S]*?ROLLBACK[\s\S]*?process\.exit\(1\)/);
  });
  it("inside the EXECUTE batch, no COMMIT precedes the log write", () => {
    const region = s.slice(s.indexOf("if (EXECUTE && updates.length > 0)"));
    expect(region.indexOf("appendDurable(LOG_PATH")).toBeLessThan(region.indexOf('c.query("COMMIT")'));
  });
  it("durable log write LOOPS until every byte is flushed, then fsyncs (no silent short-write) (#451)", () => {
    // writeSync can short-write without throwing → loop until offset reaches the buffer length.
    expect(s).toMatch(/Buffer\.from\(text,\s*"utf8"\)/);
    expect(s).toMatch(/while\s*\(\s*off\s*<\s*buf\.length\s*\)/);
    expect(s).toMatch(/off\s*\+=\s*writeSync\(fd,\s*buf,\s*off,\s*buf\.length\s*-\s*off\)|const n = writeSync\(fd, buf, off/);
    expect(s).toMatch(/no progress/); // throws if a write can't advance (cannot spin forever)
    expect(s).toMatch(/fsyncSync\(fd\)/);
  });
  it("Gate-3 plan doc publishes NO id-only rollback (value-guarded only) (#451)", () => {
    const plan = read("docs/superpowers/plans/2026-06-25-archive-clock-gate3-backfill-plan.md");
    expect(plan).not.toMatch(/terminal_since\s*=\s*NULL\s+WHERE\s+id\s+IN/i); // stale id-only removed
    expect(plan).toMatch(/l\.terminal_since\s*=\s*v\.ts/); // value-guarded form present
    expect(plan).toMatch(/'<new_terminal_since>'::timestamp/);
  });
  it("Gate-3 plan --execute snippet uses ::timestamp[] (not stale timestamptz[]), matching the script (#451 follow-up)", () => {
    const plan = read("docs/superpowers/plans/2026-06-25-archive-clock-gate3-backfill-plan.md");
    expect(plan).toMatch(/unnest\(\$2::timestamp\[\]\)/);     // matches the shipped script
    expect(plan).not.toMatch(/unnest\(\$tss::timestamptz\[\]\)/); // stale snippet removed
  });
  it("directory fsync hardening is guarded + cross-platform safe (Windows no-op, never throws) (#451 follow-up)", () => {
    expect(s).toMatch(/function fsyncDirIfSupported/);
    expect(s).toMatch(/process\.platform === "win32"/);  // explicit Windows skip
    expect(s).toMatch(/fsyncDirIfSupported\(LOG_DIR\)/);  // called at --execute startup
    expect(s).toMatch(/closeSync\(openSync\(LOG_PATH, "a"\)\)/); // log file pre-created before dir fsync
  });
  it("stores terminal_since as ::timestamp (TZ-independent UTC wall time), not ::timestamptz (#451)", () => {
    expect(s).toMatch(/unnest\(\$2::timestamp\[\]\)/);      // wall-time storage
    expect(s).not.toMatch(/unnest\(\$2::timestamptz\[\]\)/); // session-TZ-dependent storage removed
  });
  it("documents a VALUE-GUARDED rollback (preserves later live-writer updates), not id-only (#451)", () => {
    // value guard: clears only rows still holding the backfilled value, via ::timestamp
    expect(s).toMatch(/l\.terminal_since\s*=\s*v\.ts/);
    expect(s).toMatch(/'<new_terminal_since>'::timestamp/);
    // the unsafe id-only rollback hint is gone
    expect(s).not.toMatch(/terminal_since\s*=\s*NULL\s+WHERE\s+id\s+IN/i);
  });
});

describe("archive predicate repoint (PR-2, #415)", () => {
  it("flag-ON archive eligibility ages off terminal_since; flag-OFF stays legacy status_changed_at", () => {
    const s = read("app/api/cron/data-retention/route.ts");
    // flag-ON branch is the stable clock; flag-OFF default is unchanged legacy predicate
    expect(s).toMatch(/archiveBacklogEnabled\s*\n?\s*\?\s*\{\s*terminal_since:\s*\{\s*lt:\s*oneEightyDayCutoff\s*\}\s*\}/);
    expect(s).toMatch(/:\s*\{\s*status_changed_at:\s*\{\s*lt:\s*oneEightyDayCutoff\s*\}\s*\}/);
    // the contaminated modification_timestamp OR-branch is gone
    expect(s).not.toMatch(/status_changed_at:\s*null,\s*modification_timestamp/);
  });
  it("flag is still env-gated and NOT hardcoded to 'true' in code (merge drains nothing)", () => {
    expect(read("app/api/cron/data-retention/route.ts")).not.toMatch(/ARCHIVE_T180_BACKLOG_ENABLED\s*=\s*["']true["']/);
  });
  it("ops:health backlog monitor mirrors the repoint (flag-ON terminal_since, no modification_timestamp)", () => {
    const s = read("scripts/archive-backlog-predicate.js");
    expect(s).toMatch(/terminal_since:\s*\{\s*lt:\s*cutoff\s*\}/);
    expect(s).not.toMatch(/modification_timestamp/);
  });
  it("ops:health records the missing-terminal-clock gauge UNCONDITIONALLY but only WARNS when the flag is ON (Codex #448-A)", () => {
    const s = read("scripts/ops-health.js");
    // 1) the count/gauge is always recorded (informational), regardless of flag state →
    //    flag OFF + NULL terminal_since: count present, NO warning, ops:health stays exit 0.
    expect(s).toMatch(/report\.retention\.listings_terminal_missing_terminal_since\s*=\s*terminalMissingClock/);
    // 2) the WARNING push is gated behind ARCHIVE_T180_BACKLOG_ENABLED being ON →
    //    flag ON + NULL terminal_since: warning present (actionable backlog).
    expect(s).toMatch(/if\s*\(\s*archiveBacklogFlagEnabled\s*&&\s*terminalMissingClock\s*>\s*0\s*\)\s*\{[\s\S]*?level:\s*'warning'/);
    // 3) ordering — the gauge is recorded BEFORE (outside) the gated warning, so the count
    //    survives even when the flag is OFF and the warning is suppressed.
    const assignIdx = s.indexOf("report.retention.listings_terminal_missing_terminal_since");
    const warnIdx = s.indexOf("archiveBacklogFlagEnabled && terminalMissingClock");
    expect(assignIdx).toBeGreaterThan(-1);
    expect(warnIdx).toBeGreaterThan(assignIdx);
  });
});
