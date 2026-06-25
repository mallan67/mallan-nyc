/// <reference types="jest" />
/**
 * Archive Eligibility Clock PR-1 (#415) — clock plumbing wiring.
 *
 * Pins: schema column + index; the shared helper is wired into every terminal-status
 * writer (sync create+update, agent-history, CRM status route, feed-reconcile create +
 * ghost-withdraw, listing-expiration, import-closed); the migration is additive; the
 * backfill defaults to dry-run; and PR-1 does NOT repoint the archive predicate or
 * enable the backlog flag.
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
      "app/api/crm/listings/reset-sync/route.ts",
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
  it("reset-sync uses computeTerminalSincePatch on create + update (#446)", () => {
    const s = read("app/api/crm/listings/reset-sync/route.ts");
    expect(s).toMatch(/computeTerminalSincePatch/);
    expect(s).toMatch(/\.\.\.terminalSinceCreate/);
    expect(s).toMatch(/\.\.\.terminalSinceUpdate/);
  });
  it("CRM DELETE (soft-delete → Withdrawn) sets terminal_since (#446)", () => {
    const s = read("app/api/crm/listings/[id]/route.ts");
    expect(s).toMatch(/computeTerminalSincePatch\(\{[\s\S]*?newStatus:\s*"Withdrawn"/);
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

describe("PR-1 scope guard — clock plumbing ONLY", () => {
  it("does NOT repoint the data-retention archive predicate to terminal_since (that is PR-2)", () => {
    expect(read("app/api/cron/data-retention/route.ts")).not.toMatch(/terminal_since/);
  });
  it("does NOT enable ARCHIVE_T180_BACKLOG_ENABLED anywhere new", () => {
    // the flag check exists in data-retention (PR #404); PR-1 must not set it to 'true' in code.
    expect(read("app/api/cron/data-retention/route.ts")).not.toMatch(/ARCHIVE_T180_BACKLOG_ENABLED\s*=\s*["']true["']/);
  });
});
