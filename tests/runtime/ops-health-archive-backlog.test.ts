/// <reference types="jest" />
/**
 * ops-health archive-backlog monitoring must MIRROR the merged #405 archiver predicate
 * (Codex P2 on PR #405, app/api/cron/data-retention/route.ts:181).
 *
 * Defect being guarded: before this fix, scripts/ops-health.js counted the T+180 archive
 * backlog with a hardcoded NARROW predicate (status_changed_at < cutoff) regardless of the
 * ARCHIVE_T180_BACKLOG_ENABLED flag. With the flag ON, the cron archives a broader set
 * (NULL status_changed_at via modification_timestamp), so monitoring would report
 * archive_backlog=0 while the cron drains the new backlog — hiding whether the 500/run cap
 * keeps up.
 *
 * RED on main: the old inline ops-health where had no flag branch, so the flag-ON assertion
 * (an OR with a modification_timestamp branch) could not be produced. GREEN after the fix.
 *
 * This test imports the pure predicate module (no DB, no env, no archive run) and also reads
 * the archiver source to prove the terminal-status sets are identical (same population).
 */

import { readFileSync } from "fs";
import { join } from "path";

// CommonJS monitoring module (no types file) — require + typed cast keeps tsc clean.
const {
  buildArchiveBacklogWhere,
  ARCHIVE_TERMINAL_STATUSES,
} = require("../../scripts/archive-backlog-predicate") as {
  buildArchiveBacklogWhere: (opts: { flagEnabled: boolean; now: Date }) => Record<string, unknown>;
  ARCHIVE_TERMINAL_STATUSES: string[];
};

const NOW = new Date("2026-06-17T00:00:00.000Z");
const CUTOFF = new Date(NOW.getTime() - 180 * 24 * 60 * 60 * 1000);

describe("ops-health archive backlog predicate mirrors the #405 archiver", () => {
  it("flag OFF (default): narrow predicate — terminal + status_changed_at<cutoff + not archived, NO OR", () => {
    const where = buildArchiveBacklogWhere({ flagEnabled: false, now: NOW });
    expect(where.OR).toBeUndefined();
    expect(where.status).toEqual({ in: ARCHIVE_TERMINAL_STATUSES });
    expect(where.sync_status).toEqual({ not: "archived" });
    expect(where.status_changed_at).toEqual({ lt: CUTOFF });
  });

  it("flag ON: widens to include NULL status_changed_at via modification_timestamp", () => {
    const where = buildArchiveBacklogWhere({ flagEnabled: true, now: NOW });
    expect(where.status).toEqual({ in: ARCHIVE_TERMINAL_STATUSES });
    expect(where.sync_status).toEqual({ not: "archived" });
    const or = where.OR as Array<Record<string, unknown>>;
    expect(Array.isArray(or)).toBe(true);
    expect(or).toHaveLength(2);
    // Branch 1: real, old status_changed_at.
    expect(or[0]).toEqual({ status_changed_at: { lt: CUTOFF } });
    // Branch 2: NULL status_changed_at AND old modification_timestamp (the widened branch).
    const nullBranch = or.find((b) => b.status_changed_at === null);
    expect(nullBranch).toBeDefined();
    expect((nullBranch!.modification_timestamp as Record<string, unknown>).lt).toEqual(CUTOFF);
    // When the OR is used, status_changed_at must NOT also sit at top level (would double-filter).
    expect(where.status_changed_at).toBeUndefined();
  });

  it("anti-updated_at: the predicate NEVER references updated_at in either flag state", () => {
    expect(JSON.stringify(buildArchiveBacklogWhere({ flagEnabled: false, now: NOW }))).not.toContain(
      "updated_at",
    );
    expect(JSON.stringify(buildArchiveBacklogWhere({ flagEnabled: true, now: NOW }))).not.toContain(
      "updated_at",
    );
  });

  it("reconciliation: monitoring terminal-status set === the archiver's route TERMINAL_STATUSES (same population)", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../app/api/cron/data-retention/route.ts"),
      "utf8",
    );
    const m = routeSrc.match(/const\s+TERMINAL_STATUSES\s*=\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const routeStatuses = (m![1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ""));
    expect(routeStatuses.length).toBeGreaterThan(0);
    // Identical set AND order — monitoring counts exactly the cron's terminal population.
    expect(ARCHIVE_TERMINAL_STATUSES).toEqual(routeStatuses);
  });

  it("cap alignment: count population mirrors the cron in BOTH flag states (so the 500/run warn is accurate)", () => {
    for (const flagEnabled of [false, true]) {
      const where = buildArchiveBacklogWhere({ flagEnabled, now: NOW });
      // Same terminal set + same archived exclusion in both states.
      expect(where.status).toEqual({ in: ARCHIVE_TERMINAL_STATUSES });
      expect(where.sync_status).toEqual({ not: "archived" });
      // Date eligibility matches the flag the cron is using.
      if (flagEnabled) {
        expect((where.OR as unknown[]).length).toBe(2);
      } else {
        expect(where.status_changed_at).toEqual({ lt: CUTOFF });
      }
    }
  });
});
