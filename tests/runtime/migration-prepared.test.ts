/**
 * Unified system — Phase 1, Task 5: PREPARED (unapplied) migration guard.
 *
 * Asserts the migration is additive-nullable + CONCURRENTLY (safe per NEON.md),
 * the schema carries the 3 new nullable columns, and the build command does NOT
 * apply migrations. Application itself is an activation-gated Maya step.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("PREPARED unified media-identity migration", () => {
  const migration = read("prisma/migrations/20260721180000_unified_media_identity/migration.sql");
  const schema = read("prisma/schema.prisma");
  const pkg = JSON.parse(read("package.json"));
  const vercel = JSON.parse(read("vercel.json"));

  it("schema.prisma has the 3 new nullable columns", () => {
    for (const col of ['source_revision           BigInt?', 'r2_object_key             String?', 'pending_removal_run       String?']) {
      expect(schema).toContain(col);
    }
  });

  it("migration is additive-nullable only (no destructive DDL)", () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "source_revision" BIGINT;');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "r2_object_key" TEXT;');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "pending_removal_run" TEXT;');
    // Inspect only executable DDL lines (strip `-- …` comments) — the doc
    // comment mentions these phrases to say they are ABSENT.
    const ddl = migration.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(ddl).not.toMatch(/ADD COLUMN[^;]*NOT NULL[^;]*DEFAULT/i);
    expect(ddl).not.toMatch(/\bDROP COLUMN\b/i);
    expect(ddl).not.toMatch(/ALTER COLUMN [^ ]+ TYPE/i);
    expect(ddl).not.toMatch(/CREATE INDEX(?! CONCURRENTLY)/i); // never a non-concurrent index
  });

  it("the backlog index is created CONCURRENTLY with the exact predicate", () => {
    expect(migration).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS \"listing_media_r2_backlog_idx\"");
    expect(migration).toContain('("created_at", "id")');
    expect(migration).toContain("WHERE \"status\" = 'active'");
    expect(migration).toContain('"r2_key" IS NULL OR "media_url_cached" IS NULL');
  });

  it("the build command does NOT apply migrations (NEON.md Trap #1)", () => {
    const build = String(pkg.scripts?.build ?? "") + " " + String(vercel.buildCommand ?? "");
    expect(build).not.toMatch(/migrate deploy/);
    expect(build).not.toMatch(/db push/);
  });
});
