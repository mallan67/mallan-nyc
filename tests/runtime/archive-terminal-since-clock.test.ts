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
  it("CRM status route uses computeTerminalSincePatch", () => {
    expect(read("app/api/crm/listings/[id]/status/route.ts")).toMatch(/computeTerminalSincePatch/);
  });
  it("feed-reconcile sets terminal_since on create + ghost→Withdrawn", () => {
    const s = read("app/api/cron/feed-reconcile/route.ts");
    expect(s).toMatch(/computeTerminalSincePatch/);
    expect(s).toMatch(/terminal_since:\s*now/);
  });
  it("listing-expiration sets terminal_since on Expired", () => {
    expect(read("app/api/cron/listing-expiration/route.ts")).toMatch(/terminal_since:\s*now/);
  });
  it("import-closed sets terminal_since from the stable date", () => {
    expect(read("scripts/import-closed-from-trestle.ts")).toMatch(/deriveTerminalSince/);
  });
});

describe("backfill defaults to dry-run (no write without --execute)", () => {
  const s = read("scripts/backfill-terminal-since.ts");
  it("EXECUTE is gated behind the --execute flag", () => {
    expect(s).toMatch(/const EXECUTE\s*=\s*process\.argv\.includes\("--execute"\)/);
    expect(s).toMatch(/if\s*\(\s*!EXECUTE\s*\)/); // dry-run early return
    expect(s).toMatch(/DRY-RUN ONLY/);
  });
  it("only fills NULL terminal rows (never bumps; never touches live)", () => {
    expect(s).toMatch(/terminal_since IS NULL/);
    expect(s).toMatch(/status IN /);
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
