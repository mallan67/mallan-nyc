/// <reference types="jest" />
/**
 * Phase D code-prep STEP 2 (board #415) — no TRACKED operator script uses an explicit
 * `agent_info: true` Prisma select.
 *
 * Step 1 (#426) removed the runtime `app/api` selects. This step removes them from the operator
 * scripts (audit / ops-repair / ops-set-exclusive / retired backfill-crm) so the schema field can
 * later be removed (step 3) without a select referencing a non-existent column. The repair/
 * set-exclusive resolvers are already typed-first and read `agent_info` only as an absent-safe
 * `{}` fallback; the audit now reads the typed MLS/name columns directly.
 *
 * Excludes `scripts/__*` (untracked operator scratch, gitignored) and test files.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { spawnSync } from "child_process";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("Phase D code-prep step 2 — no operator-script agent_info: true select", () => {
  it("no tracked script (.ts/.mjs, excl. scripts/__* + tests) selects `agent_info: true`", () => {
    const offenders = walk(join(process.cwd(), "scripts"))
      .filter((f) => (f.endsWith(".ts") || f.endsWith(".mjs")) && !/\.test\./.test(f))
      .filter((f) => !basename(f).startsWith("__"))
      .filter((f) => /agent_info:\s*true/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(process.cwd(), ""));
    expect(offenders).toEqual([]);
  });

  it("the listing-side-ids audit selects the typed MLS columns (reads typed, not agent_info)", () => {
    const audit = readFileSync(join(process.cwd(), "scripts", "audit-mallan-listing-side-ids.ts"), "utf8");
    for (const col of [
      "list_office_mls_id: true",
      "list_agent_mls_id: true",
      "co_list_office_mls_id: true",
      "co_list_agent_mls_id: true",
    ]) {
      expect(audit).toContain(col);
    }
    expect(audit).not.toContain("agent_info: true");
  });
});

describe("Phase D — retired backfill-crm script is HARD-DISABLED (Codex #427)", () => {
  const retired = join(process.cwd(), "scripts", "backfill-crm-exclusive-cotality-identity.mjs");

  it("fails closed (exit 2) even with ALLOW_RETIRED_AGENT_INFO_BACKFILL=1 AND --apply", () => {
    const res = spawnSync(process.execPath, [retired, "--apply"], {
      env: { ...process.env, ALLOW_RETIRED_AGENT_INFO_BACKFILL: "1" },
      encoding: "utf8",
      cwd: process.cwd(),
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/RETIRED.*HARD-DISABLED/s);
  });

  it("source has NO write path, NO re-enable flag, NO Prisma import, NO agent_info select", () => {
    const src = readFileSync(retired, "utf8");
    expect(src).not.toContain("prisma.listing.update");
    expect(src).not.toContain("ALLOW_RETIRED_AGENT_INFO_BACKFILL");
    expect(src).not.toContain("process.argv"); // no --apply (or any arg) is processed
    expect(src).not.toMatch(/PrismaClient/);
    expect(src).not.toContain("agent_info: true");
    // It exits unconditionally (no guard around the exit).
    expect(src).toMatch(/process\.exit\(2\);\s*$/);
  });
});
