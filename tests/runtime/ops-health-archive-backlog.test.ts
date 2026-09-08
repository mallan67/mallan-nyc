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
  // The population: a terminal provider status OR a row recorded off the feed (its provider status is preserved
  // on-market; the presence fact sync_status=off_feed is what left the marketed set — Maya 2026-09-08).
  const POPULATION = [{ status: { in: ARCHIVE_TERMINAL_STATUSES } }, { sync_status: "off_feed" }];

  it("flag OFF (default): narrow predicate — (terminal OR off_feed) + status_changed_at<cutoff + not archived", () => {
    const where = buildArchiveBacklogWhere({ flagEnabled: false, now: NOW });
    expect(where.OR).toEqual(POPULATION);
    expect(where.status).toBeUndefined();
    expect(where.sync_status).toEqual({ not: "archived" });
    expect(where.status_changed_at).toEqual({ lt: CUTOFF });
  });

  it("flag ON (PR-2): ages off the stable terminal_since clock — single terminal_since<cutoff date branch", () => {
    const where = buildArchiveBacklogWhere({ flagEnabled: true, now: NOW });
    expect(where.OR).toEqual(POPULATION);
    expect(where.sync_status).toEqual({ not: "archived" });
    // Stable clock: single date branch, no date coalesce.
    expect(where.terminal_since).toEqual({ lt: CUTOFF });
    // contaminated clocks must not appear in the eligibility branch
    expect(where.status_changed_at).toBeUndefined();
    expect(where.modification_timestamp).toBeUndefined();
  });

  it("anti-updated_at / anti-modification_timestamp: neither appears in either flag state", () => {
    for (const flagEnabled of [false, true]) {
      const json = JSON.stringify(buildArchiveBacklogWhere({ flagEnabled, now: NOW }));
      expect(json).not.toContain("updated_at");
      if (flagEnabled) expect(json).not.toContain("modification_timestamp");
    }
  });

  it("reconciliation: monitoring terminal-status set === the archiver's route TERMINAL_STATUSES (same population)", () => {
    const routeSrc = readFileSync(
      join(__dirname, "../../app/api/cron/data-retention/route.ts"),
      "utf8",
    );
    // The route no longer carries its own literal list: it spreads the mapper export, which is THE
    // terminal set in lib/listings/mallan-status.ts (one definition; the monitor's CommonJS copy mirrors it).
    expect(routeSrc).toMatch(/const\s+TERMINAL_STATUSES\s*=\s*\[\.\.\.MAPPER_TERMINAL_STATUSES\]/);
    const { MALLAN_TERMINAL_STATUSES } = require("../../lib/listings/mallan-status") as { MALLAN_TERMINAL_STATUSES: ReadonlySet<string> };
    // Identical set AND order — monitoring counts exactly the cron's terminal population.
    expect(ARCHIVE_TERMINAL_STATUSES).toEqual([...MALLAN_TERMINAL_STATUSES]);
    // The presence-fact spelling is the one constant (lib/listings/canonical-lifecycle.ts).
    const { OFF_FEED_SYNC_STATUS } = require("../../lib/listings/canonical-lifecycle") as { OFF_FEED_SYNC_STATUS: string };
    const js = require("../../scripts/archive-backlog-predicate.js") as { OFF_FEED_SYNC_STATUS: string };
    expect(js.OFF_FEED_SYNC_STATUS).toBe(OFF_FEED_SYNC_STATUS);
    expect(OFF_FEED_SYNC_STATUS).toBe("off_feed");
  });

  it("cap alignment: count population mirrors the cron in BOTH flag states (so the 500/run warn is accurate)", () => {
    for (const flagEnabled of [false, true]) {
      const where = buildArchiveBacklogWhere({ flagEnabled, now: NOW });
      // Same population (terminal OR off_feed) + same archived exclusion in both states.
      expect(where.OR).toEqual(POPULATION);
      expect(where.sync_status).toEqual({ not: "archived" });
      // Date eligibility matches the flag the cron is using.
      if (flagEnabled) {
        expect(where.terminal_since).toEqual({ lt: CUTOFF });
      } else {
        expect(where.status_changed_at).toEqual({ lt: CUTOFF });
      }
    }
  });
});
