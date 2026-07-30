// lib/idx/idx-sync-member.ts
// The IDX-sync WORK, extracted from the public route so it can be invoked TWO
// ways with NO forgeable HTTP path to the unclaimed execution:
//   - IN-PROCESS by the One Cycle orchestrator (which already owns the machine
//     claim) — no nested claim;
//   - by the public GET wrapper, which ALWAYS takes claimMachine() first.
// There is no header / query / bearer combination that reaches this function
// over HTTP without a claim — only a direct in-process import can.
import { syncListings, readPropertyCursorState } from "@/lib/idx/sync";
import { bootstrapCursorState, type PropertyCursorState } from "@/lib/idx/property-cursor";
import { hasCredentials } from "@/lib/idx/auth";
import {
  createCotalityCollector,
  runWithCotalityTelemetry,
  snapshotCollector,
} from "@/lib/idx/cotality-telemetry";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Explicit SEMANTIC result of a member run — the machine's source of truth.
 * Machine completeness/success and the completion ledger are derived from THIS,
 * never from the HTTP status alone (a 200 can be a skip or a partial):
 *   - ok       — the member did its full work and every required unit succeeded
 *   - partial  — the member started and settled, but some units failed
 *                (e.g. media rows_failed > 0 or r2_failed > 0)
 *   - skipped  — a precondition prevented the work (IDX disabled / no creds);
 *                the member did NOT do its work → never counts as success
 *   - error    — the run failed / threw
 */
export type MemberOutcome = 'ok' | 'partial' | 'skipped' | 'error';

export interface MemberRunResult {
  status: number;
  /** The explicit semantic outcome — machine truth derives from this, not status. */
  outcome: MemberOutcome;
  body: Record<string, unknown>;
}

// Scheduled/manual cron batch cap (PR-S.5). The route maxDuration is 120s and
// syncListings does per-record sequential DB work (~80ms) + a media batch
// follow-up; 500 records ≈ 65s. Manual ?full=true uses the same cap — invoke
// repeatedly to drain a large backlog; do NOT raise the cap inline.
const SCHEDULED_MAX_RECORDS = 500;

/**
 * Run the IDX-sync member. Correlates its durable Cotality telemetry with the
 * machine run via `oneCycleRunId`. Persists telemetry on success AND error.
 * Never claims — the caller owns the machine execution.
 */
export async function runIdxSyncMember({
  oneCycleRunId,
  forceFull,
}: {
  oneCycleRunId: string | null;
  forceFull: boolean;
}): Promise<MemberRunResult> {
  if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
    // PRECONDITION FAILURE — no sync work ran. This is NOT success: it must stop
    // the chain before media and force machine complete=false / success=false.
    // The HTTP body stays backward-compatible (200 skipped); the explicit
    // `outcome: "skipped"` is what the orchestrator + completion ledger use.
    return {
      status: 200,
      outcome: "skipped",
      body: { skipped: true, reason: "IDX disabled or credentials missing" },
    };
  }

  // Run-scoped, isolated collector — concurrent Cotality calls in other async
  // contexts cannot alter these counters.
  const cotalityCollector = createCotalityCollector("idx-sync", oneCycleRunId);

  try {
    // Phase 1A: the scheduled cursor is versioned two-stream keyset state, not a
    // scalar timestamp. Absent/legacy/malformed state BOOTSTRAPS the two fixed
    // streams — it must NOT fall through to the old active-listing full sync,
    // which would re-ingest the whole feed. Explicit forceFull stays isolated:
    // it runs the legacy full sync and never advances or overwrites the cursors.
    // OPS-024 follow-up: a STORAGE failure is not "no cursor yet". Abort before
    // any Cotality request — zero listing/projection/media/cursor/watermark
    // writes — rather than bootstrap over possibly-live state.
    let cursorState: PropertyCursorState | null = null;
    if (!forceFull) {
      const read = await readPropertyCursorState();
      if (!read.ok) {
        console.warn("[IDX Sync Member] cursor state unreadable — skipping run, preserving cursor");
        return {
          status: 200,
          outcome: "partial",
          body: { skipped: true, reason: read.reason },
        };
      }
      cursorState = read.state ?? bootstrapCursorState();
    }

    const result = await runWithCotalityTelemetry(cotalityCollector, () =>
      syncListings({
        ...(cursorState ? { cursorState } : {}),
        maxRecords: SCHEDULED_MAX_RECORDS,
        fullSync: forceFull, // ONLY an explicit request, never "no state yet"
      }),
    );

    // SEMANTIC outcome — machine truth, NOT HTTP status. syncListings catches
    // per-record listing/projection failures and resolves with `errors > 0`
    // (the watermark is capped/frozen so those rows are re-fetched next run)
    // instead of throwing. A nonzero error count is a PARTIAL pass and must not
    // be reported as full success — otherwise the machine would report success
    // while the listing pass was incomplete. A partial IDX also HOLDS media
    // (Maya, 2026-07-25): the orchestrator's existing non-ok chain-stop already
    // budget-skips media, so the cycle is complete=false / success=false.
    // Phase 1A: `errors` alone is no longer the whole truth. syncListings now
    // reports run_status "partial" for an INCOMPLETE legacy-media batch with
    // errors === 0 — stored media preserved, watermark capped for retry. That is
    // exactly the case the comment above describes, so it must hold media too.
    // Fall back to the errors heuristic for any older result lacking run_status.
    const semanticOutcome: MemberOutcome =
      result.run_status !== undefined
        ? (result.run_status === "ok" ? "ok" : "partial")
        : (result.errors > 0 ? "partial" : "ok");
    const auditOutcome = semanticOutcome === "ok" ? "success" : semanticOutcome;

    await prisma.auditEvent.create({
      data: {
        action: "idx_sync_cron",
        entity_type: "listing",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: {
          ...result,
          incremental: !forceFull,
          // The scheduled cursor is versioned keyset state, not a scalar clock.
          since: null,
          property_cursor_basis: cursorState?.basis ?? null,
          outcome: auditOutcome,
          one_cycle_run_id: oneCycleRunId,
          cotality: snapshotCollector(cotalityCollector),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      status: 200,
      outcome: semanticOutcome,
      body: { success: true, ...result, cotality: snapshotCollector(cotalityCollector) },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[IDX Sync Member] Error:", msg);

    await prisma.auditEvent
      .create({
        data: {
          action: "idx_sync_cron_error",
          entity_type: "listing",
          entity_id: "bulk",
          user_type: "system",
          user_id: null,
          // Telemetry persists on FAILURE too — a 429 / retry / token refresh /
          // timeout / thrown request stays visible in the durable error audit.
          changes: {
            error: msg,
            outcome: "error",
            one_cycle_run_id: oneCycleRunId,
            cotality: snapshotCollector(cotalityCollector),
          } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => {}); // Don't let audit failure mask the real error

    return { status: 500, outcome: "error", body: { error: `Sync failed: ${msg}` } };
  }
}
