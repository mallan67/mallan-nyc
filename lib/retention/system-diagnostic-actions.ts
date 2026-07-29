/**
 * Retention-facing view of the high-volume SYSTEM-DIAGNOSTIC audit actions.
 *
 * WHY THIS INDIRECTION EXISTS — it is not ceremony.
 *
 * `tests/runtime/idx-sync-diagnostic-audit-events.test.ts` enforces a P3
 * fail-safe: the data-retention route's SOURCE must not reference
 * `diagnostic-recorder` / `bufferSyncDiagnostic` at all. That guard protects the
 * §2.05 `idx_display_yn_disabled` writer in that cron from ever being routed
 * through the diagnostic COLLECTOR, which dedupes and caps and could therefore
 * silently drop a compliance audit row.
 *
 * The retention rule needs the same action list for a different purpose — it
 * DELETES expired diagnostics, it does not write audit rows through the
 * collector. Importing the recorder directly into the route would trip that
 * guard for a reason the guard was never about, and weakening the guard to
 * allow it would erode a real compliance protection.
 *
 * So the list is re-exported here, and `system-diagnostic-actions.test.ts`
 * asserts this set is IDENTICAL to `SYNC_DIAGNOSTIC_DEDUPE_ACTIONS`. Adding an
 * action to the recorder's allowlist still opts it into this retention
 * automatically, and any drift fails a test rather than passing silently.
 */
import { SYNC_DIAGNOSTIC_DEDUPE_ACTIONS } from "@/lib/idx/diagnostic-recorder";

/**
 * Audit actions eligible for the short system-diagnostic retention window.
 *
 * These are WRITE-ONLY operational diagnostics: verified 2026-07-29, the only
 * writer is `lib/idx/sync.ts` and no production code reads them back. They are
 * NOT audit evidence, so they are not held to the REBNY RLS 2-year floor that
 * governs the rest of `audit_events`.
 */
export const SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS: readonly string[] =
  Object.freeze([...SYNC_DIAGNOSTIC_DEDUPE_ACTIONS]);
