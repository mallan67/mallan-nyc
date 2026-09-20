/// <reference types="jest" />
import fs from "node:fs";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deriveBranchPruneIssues } = require("@/scripts/branch-prune-health");

const ROOT = path.resolve(__dirname, "../..");

describe("retired direct-Neon branch-prune health policy", () => {
  test("compatibility helper cannot emit stale direct-Neon operational advice", () => {
    expect(deriveBranchPruneIssues({
      status: "skipped",
      ageHours: 100,
      missing: ["NEON_API_KEY", "NEON_PROJECT_ID"],
      thresholds: { branch_count_warning: 25, branch_count_critical: 4000 },
    })).toEqual([]);
  });

  test("ops:health no longer reads prune audit events or recommends retired credentials", () => {
    const source = fs.readFileSync(path.join(ROOT, "scripts", "ops-health.js"), "utf8");
    expect(source).not.toContain("deriveBranchPruneIssues");
    expect(source).not.toContain("where: { action: 'neon_branch_prune_cron' }");
    expect(source).not.toContain("── BRANCH PRUNE");
    expect(source).not.toContain("provision in Vercel Production env");
    expect(source).not.toContain("Fix the Vercel Production env var");
    expect(source).toContain("Direct-Neon branch pruning was retired/quarantined in PR #632");
  });
});
