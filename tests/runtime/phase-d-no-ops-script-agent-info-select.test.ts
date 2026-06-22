/// <reference types="jest" />
/**
 * Phase D code-prep STEP 2 (board #415) -- no TRACKED operator script uses an explicit
 * agent_info:true Prisma select, and the retired backfill-crm script is hard-disabled.
 *
 * Enumeration: "git ls-files scripts" (TRACKED files only -- Codex #427 P3). This naturally
 * excludes gitignored scratch (scripts/__*) AND files inside a scripts/__* subtree, which the
 * earlier recursive walk() wrongly descended into (its basename filter only matched a file's
 * OWN name, not a parent dir). The isScratch helper additionally drops any path with a
 * __-prefixed segment, so even a tracked __ subtree (e.g. scripts/__tests__) can never sneak in.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { execSync, spawnSync } from "child_process";

/** True if ANY path segment starts with "__" (scratch / operator subtree). */
const isScratch = (f: string): boolean => f.split(/[\\/]/).some((seg) => seg.startsWith("__"));

/** Tracked .ts/.mjs scripts, excluding tests and __ scratch subtrees. */
const trackedScripts: string[] = execSync("git ls-files scripts", { cwd: process.cwd(), encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((f) => (f.endsWith(".ts") || f.endsWith(".mjs")) && !/\.test\./.test(f))
  .filter((f) => !isScratch(f));

describe("Phase D code-prep step 2 -- no operator-script agent_info:true select", () => {
  it("no tracked script (.ts/.mjs, excl. tests + __ scratch) selects agent_info:true", () => {
    const offenders = trackedScripts.filter((f) =>
      /agent_info:\s*true/.test(readFileSync(join(process.cwd(), f), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("excludes __ scratch subtrees from the scan (Codex #427 P3 regression)", () => {
    expect(isScratch("scripts/__scratch/old.mjs")).toBe(true);
    expect(isScratch("scripts/__pr147-soak-verify/x.mjs")).toBe(true);
    expect(isScratch("scripts/__neon-cost-2026-06-12.mjs")).toBe(true);
    expect(isScratch("scripts/ops/set-exclusive-listing-agent.mjs")).toBe(false);
    expect(trackedScripts.some(isScratch)).toBe(false);
    expect(trackedScripts.some((f) => f.endsWith("ops/set-exclusive-listing-agent.mjs"))).toBe(true);
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

describe("Phase D -- retired backfill-crm script is HARD-DISABLED (Codex #427)", () => {
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
    expect(src).not.toContain("process.argv");
    expect(src).not.toMatch(/PrismaClient/);
    expect(src).not.toContain("agent_info: true");
    expect(src).toMatch(/process\.exit\(2\);\s*$/);
  });
});
