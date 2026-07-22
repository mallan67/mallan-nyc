/// <reference types="jest" />
/**
 * Codex #466 — the health probe must not certify a data-loss condition as healthy.
 *
 * dbGrowthCell previously returned 🟢 for ANY successful canonical DB read, so an empty/restored/
 * misconfigured branch (0 listings) would be reported as healthy — the exact condition the probe
 * exists to catch. These pure helpers gate on a sane floor + archived sanity, and the freshness
 * helper is extracted too so both are unit-testable without running the probe's shell/DB side effects.
 */
import { dbGrowthCell, cotalityFreshnessCell, LISTINGS_FLOOR } from '../../scripts/health/health-status';

describe('dbGrowthCell — DB growth/archive health gate (Codex #466)', () => {
  it('healthy count above floor → 🟢 with evidence', () => {
    const c = dbGrowthCell(110597, 2032);
    expect(c.status).toBe('🟢');
    expect(c.evidence).toContain('110,597');
    expect(c.evidence).toContain('2,032');
  });

  it('0 listings (empty/restored branch) → 🔴, NOT 🟢 (does not certify data loss as healthy)', () => {
    const c = dbGrowthCell(0, 0);
    expect(c.status).toBe('🔴');
    expect(c.evidence).toMatch(/below floor/i);
  });

  it('count below the floor → 🔴', () => {
    expect(dbGrowthCell(500, 10).status).toBe('🔴');
    expect(dbGrowthCell(LISTINGS_FLOOR - 1, 0).status).toBe('🔴');
  });

  it('count exactly at the floor → 🟢', () => {
    expect(dbGrowthCell(LISTINGS_FLOOR, 0).status).toBe('🟢');
  });

  it('archived greater than total (impossible / anomalous) → 🟡', () => {
    expect(dbGrowthCell(110000, 999999).status).toBe('🟡');
  });

  it('negative / non-finite total → ⚪ (invalid read, not green)', () => {
    expect(dbGrowthCell(-1, 0).status).toBe('⚪');
    expect(dbGrowthCell(Number.NaN, 0).status).toBe('⚪');
  });
});

describe('cotalityFreshnessCell — ingestion freshness', () => {
  it('<=30m → 🟢', () => expect(cotalityFreshnessCell(9).status).toBe('🟢'));
  it('31–120m → 🟡', () => expect(cotalityFreshnessCell(60).status).toBe('🟡'));
  it('>120m → 🔴', () => expect(cotalityFreshnessCell(200).status).toBe('🔴'));
  it('null (no timestamp) → ⚪', () => expect(cotalityFreshnessCell(null).status).toBe('⚪'));
});

// ── Codex post-merge review: freshness must come from the run-attempt clock ──
import * as fs2 from "node:fs";
import * as path2 from "node:path";
describe("probe.ts — Cotality ingestion freshness source (attempt-time, suppression-safe)", () => {
  const probeSrc = fs2.readFileSync(path2.resolve(__dirname, "../../scripts/health/probe.ts"), "utf8");
  it("reads SyncState (Property) last_run_at — the run-attempt clock that advances on quiet-but-healthy syncs", () => {
    expect(probeSrc).toMatch(/syncState/);
    expect(probeSrc).toMatch(/last_run_at/);
  });
  it("does NOT derive freshness from MAX(last_synced_from_trestle) — Phase 3 suppression stops bumping it on unchanged listings", () => {
    expect(probeSrc).not.toMatch(/_max:s*{s*last_synced_from_trestle/);
  });
});

// ── Maya correction: attempt-recency must never certify a FAILING sync as healthy ──
import { cotalityOutcomeCell } from "../../scripts/health/health-status";
describe("cotalityOutcomeCell — last-run OUTCOME is a separate cell from attempt freshness", () => {
  it("ok + zero errors → 🟢", () => {
    expect(cotalityOutcomeCell("ok", 0).status).toBe("🟢");
  });
  it("status error → 🔴 even when the attempt is recent", () => {
    expect(cotalityOutcomeCell("error", 0).status).toBe("🔴");
  });
  it("partial or row errors → 🟡", () => {
    expect(cotalityOutcomeCell("partial", 0).status).toBe("🟡");
    expect(cotalityOutcomeCell("ok", 3).status).toBe("🟡");
  });
  it("unknown/null → ⚪ (never green by default)", () => {
    expect(cotalityOutcomeCell(null, null).status).toBe("⚪");
  });
  it("ok with UNRECORDED rows_with_errors (NULL) → 🟡, never green on a fabricated zero (Codex #552)", () => {
    const cell = cotalityOutcomeCell("ok", null);
    expect(cell.status).toBe("🟡");
    expect(cell.evidence).toContain("unrecorded");
    expect(cell.evidence).not.toContain("rows_with_errors=0");
  });
});
describe("probe.ts — emits BOTH attempt-freshness and last-run-outcome cells", () => {
  const probeSrc = fs2.readFileSync(path2.resolve(__dirname, "../../scripts/health/probe.ts"), "utf8");
  it("adds a Cotality last-run outcome cell fed by last_run_status + rows_with_errors", () => {
    expect(probeSrc).toMatch(/Cotality last-run outcome/);
    expect(probeSrc).toMatch(/last_run_status/);
    expect(probeSrc).toMatch(/rows_with_errors/);
  });
  it("labels the freshness cell as ATTEMPT freshness (it proves the cron fired, not that ingestion succeeded)", () => {
    expect(probeSrc).toMatch(/Cotality sync attempt freshness/);
  });
});
