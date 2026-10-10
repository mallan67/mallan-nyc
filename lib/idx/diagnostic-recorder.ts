/**
 * System diagnostic collector — dedupe + cap for high-volume IDX-sync
 * `audit_events` diagnostics (P3, 2026-06-24).
 *
 * BACKGROUND
 *   The best-effort per-record diagnostic added 2026-05-15
 *   (`recordSyncDiagnostic` in `lib/idx/sync.ts`) wrote one `audit_events`
 *   row per failed listing upsert with NO dedupe and NO cap. During the
 *   cross-project DB repoint window (2026-05-21 → 2026-06-13) the sync
 *   write path hit a read-only connection and every record failed with the
 *   SAME error (Postgres 25006), producing a 46,011-row / ~30 MB burst —
 *   1,938 listings × one error signature × ~92 runs. This module is the
 *   dedupe/cap fix for that burst.
 *
 * WHAT THIS DOES (opt-in, system-only)
 *   Only actions in `SYNC_DIAGNOSTIC_DEDUPE_ACTIONS` are routed here by
 *   `recordSyncDiagnostic`. Everything else (and every human / admin /
 *   broker / compliance / security / Cotality data-access / §2.05 / portal audit write,
 *   which never calls `recordSyncDiagnostic`) is FULL-RETAINED, unchanged.
 *
 *   Within a sync run, repeated failures are collapsed by
 *   (action, entity_id, error fingerprint) into an in-memory counter — no
 *   DB round-trip on the hot per-record path. At flush (end of the run) we
 *   write at most `DIAGNOSTIC_FULL_ROW_CAP` full rows (the highest-count
 *   keys, each carrying its `occurrences`) and fold the remainder into ONE
 *   `idx_sync_diagnostic_summary` row that preserves the root-cause signal
 *   (grouped fingerprints + sample listing ids + suppressed count).
 *
 * GUARANTEES
 *   - Best-effort: flush never throws (a write failure is console.error'd).
 *   - No schema change: writes the existing `audit_events` table only; the
 *     count lives in the existing `changes` JSON.
 *   - Buffering is synchronous + in-memory: the per-record catch stays
 *     non-blocking (no added DB round-trip in the hot loop).
 *
 * @module lib/idx/diagnostic-recorder
 */
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Opt-IN allowlist: the ONLY actions that get deduped/capped. Any action
 * not listed here is written through immediately by `recordSyncDiagnostic`
 * (fail-safe full retention). NEVER add a human / compliance / security /
 * §2.05 / Cotality data-access / portal action here — those must always be full-retained
 * and they do not flow through `recordSyncDiagnostic` in the first place.
 */
export const SYNC_DIAGNOSTIC_DEDUPE_ACTIONS: ReadonlySet<string> = new Set([
  "idx_sync_listing_upsert_failure",
  "idx_sync_syncstate_failure",
]);

/** Max full diagnostic rows written per run; overflow folds into the summary. */
export const DIAGNOSTIC_FULL_ROW_CAP = 50;

/** Caps inside the summary payload (keep it bounded). */
const MAX_SAMPLE_IDS_PER_FINGERPRINT = 10;
const MAX_TOP_FINGERPRINTS = 10;
const MAX_MESSAGE_FINGERPRINT_CHARS = 120;

/** Summary event action name. */
export const DIAGNOSTIC_SUMMARY_ACTION = "idx_sync_diagnostic_summary";

/** Minimal structural writer so this module is unit-testable with a fake. */
interface AuditEventInput {
  action: string;
  entity_type: string;
  entity_id: string;
  user_type: string;
  user_id: bigint | null;
  changes: unknown;
}
export interface DiagnosticAuditWriter {
  auditEvent: {
    create(args: { data: AuditEventInput }): Promise<unknown>;
    createMany(args: { data: AuditEventInput[] }): Promise<unknown>;
  };
}

interface BufferEntry {
  action: string;
  entity_type: string;
  entity_id: string;
  fingerprint: string;
  count: number;
  changes: Record<string, unknown>;
}

// ── Per-run scoped state (Codex #444: must NOT be shared across concurrent
// `syncListings` invocations in the same worker). Each run gets an isolated
// buffer via AsyncLocalStorage; `fallbackState` is used only when no run scope
// is active (e.g. unit tests / any unforeseen direct caller) — concurrent
// SCOPED runs never share it.
interface RunState {
  buffer: Map<string, BufferEntry>;
  totalRecorded: number;
}
const runStorage = new AsyncLocalStorage<RunState>();
const fallbackState: RunState = { buffer: new Map(), totalRecorded: 0 };

function currentState(): RunState {
  return runStorage.getStore() ?? fallbackState;
}

/**
 * Begin a per-run diagnostic scope for the remainder of the current async
 * execution. Used by `syncListings`: each invocation runs in its own async
 * context, so each gets an isolated buffer — fixes the module-global sharing
 * Codex flagged (#444).
 */
export function beginSyncDiagnosticRun(): void {
  runStorage.enterWith({ buffer: new Map(), totalRecorded: 0 });
}

/**
 * Run `fn` inside a fresh, isolated diagnostic scope. Footgun-free wrapper
 * (uses AsyncLocalStorage.run) — used in tests and available to any caller
 * that prefers explicit scoping over `beginSyncDiagnosticRun` + flush.
 */
export function withSyncDiagnosticRun<T>(fn: () => Promise<T>): Promise<T> {
  return runStorage.run({ buffer: new Map(), totalRecorded: 0 }, fn);
}

/**
 * Stable, short, non-cryptographic fingerprint of an error's diagnostic
 * shape: error_name + prisma/PG code + a message prefix. The 25006
 * connector error folds to one fingerprint across many listings; a
 * genuinely different error (different name/code/message) stays distinct.
 */
export function fingerprintError(changes: Record<string, unknown>): string {
  const name = String(changes.error_name ?? "");
  const code = String(changes.prisma_code ?? "");
  const msg = String(changes.error_message ?? "").slice(0, MAX_MESSAGE_FINGERPRINT_CHARS);
  // djb2 → base36; collision-resistant enough for grouping diagnostics.
  let h = 5381;
  const s = `${name}|${code}|${msg}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Buffer one diagnostic occurrence. Synchronous + in-memory — safe to call
 * from the hot per-record catch without adding a DB round-trip. Repeats of
 * the same (action, entity_id, fingerprint) within the run increment a
 * counter instead of creating a new row.
 */
export function bufferSyncDiagnostic(
  action: string,
  entity_type: string,
  entity_id: string,
  changes: Record<string, unknown>,
): void {
  const state = currentState();
  const fingerprint = fingerprintError(changes);
  const key = `${action}|${entity_id}|${fingerprint}`;
  state.totalRecorded++;
  const existing = state.buffer.get(key);
  if (existing) {
    existing.count++;
    return;
  }
  state.buffer.set(key, { action, entity_type, entity_id, fingerprint, count: 1, changes });
}

/** Test/diagnostic helpers (operate on the current run scope, or fallback). */
export function getBufferedKeyCount(): number {
  return currentState().buffer.size;
}
export function getBufferedTotal(): number {
  return currentState().totalRecorded;
}
export function resetSyncDiagnostics(): void {
  const state = currentState();
  state.buffer.clear();
  state.totalRecorded = 0;
}

export interface FlushResult {
  fullRowsWritten: number;
  suppressedCount: number;
  summaryWritten: boolean;
}

/**
 * Flush the run's buffered diagnostics: write up to DIAGNOSTIC_FULL_ROW_CAP
 * full rows (highest-count keys first), fold the rest into one summary row,
 * then reset the buffer. Best-effort — never throws.
 */
export async function flushSyncDiagnostics(
  client: DiagnosticAuditWriter,
  meta: { run_bucket?: string; since?: string | null; full_sync?: boolean; type?: string } = {},
): Promise<FlushResult> {
  const state = currentState();
  if (state.buffer.size === 0) {
    return { fullRowsWritten: 0, suppressedCount: 0, summaryWritten: false };
  }
  const entries = [...state.buffer.values()].sort((a, b) => b.count - a.count);
  const distinctKeys = state.buffer.size;
  const totalEvents = state.totalRecorded;
  const full = entries.slice(0, DIAGNOSTIC_FULL_ROW_CAP);
  const overflow = entries.slice(DIAGNOSTIC_FULL_ROW_CAP);
  // Rows we did NOT write that a 1-row-per-event writer would have.
  const suppressedCount = totalEvents - full.length;
  const hadDuplicates = full.some((e) => e.count > 1);
  const runBucket = meta.run_bucket ?? null;
  let summaryWritten = false;

  try {
    if (full.length > 0) {
      await client.auditEvent.createMany({
        data: full.map((e) => ({
          action: e.action,
          entity_type: e.entity_type,
          entity_id: e.entity_id,
          user_type: "system",
          user_id: null,
          changes: { ...e.changes, occurrences: e.count, run_bucket: runBucket },
        })),
      });
    }

    if (overflow.length > 0 || hadDuplicates) {
      // Group ALL entries by fingerprint so the summary preserves the
      // root-cause signal even for the keys that didn't get a full row.
      const byFingerprint = new Map<
        string,
        { fingerprint: string; error_name: unknown; prisma_code: unknown; count: number; sample_listing_ids: string[] }
      >();
      for (const e of entries) {
        const g =
          byFingerprint.get(e.fingerprint) ??
          {
            fingerprint: e.fingerprint,
            error_name: e.changes.error_name ?? null,
            prisma_code: e.changes.prisma_code ?? null,
            count: 0,
            sample_listing_ids: [],
          };
        g.count += e.count;
        if (g.sample_listing_ids.length < MAX_SAMPLE_IDS_PER_FINGERPRINT) {
          g.sample_listing_ids.push(e.entity_id);
        }
        byFingerprint.set(e.fingerprint, g);
      }
      const topFingerprints = [...byFingerprint.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_TOP_FINGERPRINTS);

      await client.auditEvent.create({
        data: {
          action: DIAGNOSTIC_SUMMARY_ACTION,
          entity_type: "system",
          entity_id: String(runBucket ?? "bulk"),
          user_type: "system",
          user_id: null,
          changes: {
            suppressed_count: suppressedCount,
            total_events: totalEvents,
            distinct_keys: distinctKeys,
            distinct_fingerprints: byFingerprint.size,
            full_rows_written: full.length,
            top_fingerprints: topFingerprints,
            run_bucket: runBucket,
            since: meta.since ?? null,
            full_sync: meta.full_sync ?? null,
            type: meta.type ?? null,
          },
        },
      });
      summaryWritten = true;
    }

    return { fullRowsWritten: full.length, suppressedCount, summaryWritten };
  } catch (err) {
    // Best-effort only — a diagnostic flush failure must never crash sync.
    console.error("[IDX Sync] Failed to flush diagnostic events:", err);
    return { fullRowsWritten: 0, suppressedCount, summaryWritten: false };
  } finally {
    resetSyncDiagnostics();
  }
}
