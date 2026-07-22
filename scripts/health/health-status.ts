/**
 * Pure status helpers for the Project Health probe (scripts/health/probe.ts).
 *
 * Extracted so the decision logic is unit-testable WITHOUT running the probe's shell/DB side effects.
 * No I/O, no imports — just data → status. See tests/runtime/health-probe-status.test.ts.
 */
export type HealthStatus = "🟢" | "🟡" | "🔴" | "⚪";

/**
 * Sane floor for the live `listings` table. The canonical DB currently holds ~110k rows; a read that
 * returns far fewer means an empty / restored / misconfigured branch — the exact data-loss condition
 * the probe must catch, NOT certify as healthy. Bump if the real baseline grows well past this.
 */
export const LISTINGS_FLOOR = 100_000;

/**
 * DB growth / archive health. A successful query is NOT sufficient for 🟢 — the counts must clear a
 * sane floor and be internally consistent, else an empty/restored branch would be reported healthy.
 */
export function dbGrowthCell(
  total: number,
  archived: number,
  floor: number = LISTINGS_FLOOR,
): { status: HealthStatus; evidence: string } {
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(archived) || archived < 0) {
    return { status: "⚪", evidence: `invalid DB read (total=${total}, archived=${archived})` };
  }
  if (total < floor) {
    return {
      status: "🔴",
      evidence: `${total.toLocaleString()} listings — BELOW floor ${floor.toLocaleString()} (possible empty/restored/misconfigured branch)`,
    };
  }
  if (archived > total) {
    return {
      status: "🟡",
      evidence: `${total.toLocaleString()} listings; anomalous archived ${archived.toLocaleString()} > total`,
    };
  }
  return {
    status: "🟢",
    evidence: `${total.toLocaleString()} listings; ${archived.toLocaleString()} archived (sync_status='archived')`,
  };
}

/** Cotality ingestion freshness from sync_state.last_run_at age in minutes (run-attempt clock; cadence 10m). */
export function cotalityFreshnessCell(ageMin: number | null): { status: HealthStatus; evidence: string } {
  if (ageMin === null || !Number.isFinite(ageMin)) {
    return { status: "⚪", evidence: "no sync_state Property run recorded" };
  }
  const status: HealthStatus = ageMin <= 30 ? "🟢" : ageMin <= 120 ? "🟡" : "🔴";
  return { status, evidence: `sync_state last_run_at ${ageMin}m ago (cadence 10m)` };
}
