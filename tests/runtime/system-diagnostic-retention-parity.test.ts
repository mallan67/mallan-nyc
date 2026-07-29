/**
 * Parity guard for the system-diagnostic retention allowlist.
 *
 * The data-retention cron cannot import `diagnostic-recorder` directly — a P3
 * fail-safe (`tests/runtime/idx-sync-diagnostic-audit-events.test.ts`) asserts
 * that route's source never references the collector, so the §2.05
 * `idx_display_yn_disabled` writer can never be routed through a deduping,
 * capping path that might drop a compliance audit row.
 *
 * `lib/retention/system-diagnostic-actions.ts` re-exports the list instead.
 * That indirection is only safe while the two stay identical — which is what
 * this test enforces. Add an action to the producer's allowlist and it is
 * automatically eligible for the short retention window; remove one and it
 * automatically reverts to the 2-year floor. Drift fails here rather than
 * silently over- or under-deleting in production.
 */

import { SYNC_DIAGNOSTIC_DEDUPE_ACTIONS } from "@/lib/idx/diagnostic-recorder";
import { SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS } from "@/lib/retention/system-diagnostic-actions";

describe("system-diagnostic retention allowlist parity", () => {
  it("contains EXACTLY the producer's deduped-diagnostic actions", () => {
    expect([...SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS].sort()).toEqual(
      [...SYNC_DIAGNOSTIC_DEDUPE_ACTIONS].sort(),
    );
  });

  it("is non-empty — an empty list would silently retain everything forever", () => {
    // Non-vacuity: without this, a future refactor emptying the producer set
    // would make the parity assertion above trivially true while the retention
    // rule quietly stopped deleting anything.
    expect(SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS.length).toBeGreaterThan(0);
  });

  it("never includes the per-run or compliance actions that keep the 2-year floor", () => {
    // These carry operational/compliance meaning and are read by ops tooling;
    // they must never be swept into the 30-day window by a careless edit.
    for (const mustKeep of [
      "idx_sync_cron",
      "media_sync_cron",
      "idx_display_yn_disabled",
      "email_unsubscribed",
      "data_retention_run",
    ]) {
      expect(SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS).not.toContain(mustKeep);
    }
  });

  it("is frozen, so a caller cannot mutate the retention scope at runtime", () => {
    expect(Object.isFrozen(SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS)).toBe(true);
  });
});
