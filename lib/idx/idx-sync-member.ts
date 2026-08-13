// lib/idx/idx-sync-member.ts
// The IDX-sync WORK, extracted from the public route so it can be invoked TWO
// ways with NO forgeable HTTP path to the unclaimed execution:
//   - IN-PROCESS by the One Cycle orchestrator (which already owns the machine
//     claim) — no nested claim;
//   - by the public GET wrapper, which ALWAYS takes claimMachine() first.
// There is no header / query / bearer combination that reaches this function
// over HTTP without a claim — only a direct in-process import can.
import { syncListings, getPropertyKeysetCursor } from "@/lib/idx/sync";
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
export const SCHEDULED_MAX_RECORDS = 500;

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
    return {
      status: 200,
      outcome: "skipped",
      body: { skipped: true, reason: "IDX disabled or credentials missing" },
    };
  }

  const cotalityCollector = createCotalityCollector("idx-sync", oneCycleRunId);

  try {
    // Keyset resume position: (ModificationTimestamp, ListingKey). The
    // tie-breaker is required because MT is not unique in the feed — production
    // carries a 797-row cluster at one MT while this run caps at 500 records,
    // which a scalar cursor can neither traverse nor skip safely. See
    // getPropertyKeysetCursor for why the stored watermark is not trusted as a
    // position on the legacy path.
    const cursor = forceFull
      ? { since: null, listingKey: null }
      : await getPropertyKeysetCursor();
    const since = cursor.since;

    const result = await runWithCotalityTelemetry(cotalityCollector, () =>
      syncListings({
        since: since || undefined,
        sinceListingKey: cursor.listingKey,
        maxRecords: SCHEDULED_MAX_RECORDS,
        fullSync: forceFull || !since,
      }),
    );

    const semanticOutcome: MemberOutcome = result.errors > 0 ? "partial" : "ok";
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
          incremental: !!since,
          since: since?.toISOString() ?? null,
          outcome: auditOutcome,
          one_cycle_run_id: oneCycleRunId,
          cotality: snapshotCollector(cotalityCollector),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      status: 200,
      outcome: semanticOutcome,
      body: {
        success: true,
        ...result,
        // One Cycle's summary allowlist carries `listings_*` keys. This alias
        // lets the external preflight detect a full 500-row batch and force an
        // immediate follow-up instead of falsely declaring the source drained.
        listings_fetched: result.total_fetched,
        listings_batch_limit: SCHEDULED_MAX_RECORDS,
        cotality: snapshotCollector(cotalityCollector),
      },
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
          changes: {
            error: msg,
            outcome: "error",
            one_cycle_run_id: oneCycleRunId,
            cotality: snapshotCollector(cotalityCollector),
          } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});

    return { status: 500, outcome: "error", body: { error: `Sync failed: ${msg}` } };
  }
}
