// lib/idx/media-sync-member.ts
// The media-sync WORK, extracted from the public route so it can be invoked
// IN-PROCESS by the One Cycle orchestrator (no nested claim) OR by the public
// GET wrapper (which ALWAYS claims first). No HTTP header / query / bearer
// combination reaches this function without a claim — only a direct import can.
import { hasCredentials } from "@/lib/idx/auth";
import { runMediaSync } from "@/lib/idx/media-sync";
import {
  createCotalityCollector,
  runWithCotalityTelemetry,
  snapshotCollector,
} from "@/lib/idx/cotality-telemetry";
import prisma from "@/lib/prisma";
import type { MemberRunResult } from "@/lib/idx/idx-sync-member";

/**
 * Run the media-sync member. Correlates durable Cotality telemetry with the
 * machine run via `oneCycleRunId`; persists telemetry on success AND error.
 * Never claims — the caller owns the machine execution.
 */
export async function runMediaSyncMember({
  oneCycleRunId,
}: {
  oneCycleRunId: string | null;
}): Promise<MemberRunResult> {
  // Trestle credential pre-check — soft fail (503) so the cron can be dialled
  // out gracefully if creds rotate.
  if (!hasCredentials()) {
    return { status: 503, body: { error: "Trestle credentials not configured" } };
  }

  // Run-scoped, isolated collector — concurrent Cotality calls in other async
  // contexts cannot alter these counters.
  const cotalityCollector = createCotalityCollector("media-sync", oneCycleRunId);

  try {
    const result = await runWithCotalityTelemetry(cotalityCollector, () => runMediaSync());

    // Audit changes payload — explicit field list (NOT a spread of `result`)
    // so internal fields can never accidentally leak.
    await prisma.auditEvent.create({
      data: {
        action: "media_sync_cron",
        entity_type: "listing_media",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: {
          status: result.status,
          exit_reason: result.exit_reason,
          rows_checked: result.rows_checked,
          rows_updated: result.rows_updated,
          rows_inserted: result.rows_inserted,
          rows_updated_changed: result.rows_updated_changed,
          rows_skipped_unchanged: result.rows_skipped_unchanged,
          rows_skipped_invalid: result.rows_skipped_invalid,
          delete_signals_received: result.delete_signals_received,
          tombstoned_explicit: result.tombstoned_explicit,
          tombstoned_vanished: result.tombstoned_vanished,
          rows_tombstoned: result.rows_tombstoned,
          existing_rows_compared: result.existing_rows_compared,
          mismatch_status: result.mismatch_status,
          mismatch_listing_id: result.mismatch_listing_id,
          mismatch_resource_record_key: result.mismatch_resource_record_key,
          mismatch_resource_record_id: result.mismatch_resource_record_id,
          mismatch_media_url_exact: result.mismatch_media_url_exact,
          mismatch_media_url_identity: result.mismatch_media_url_identity,
          mismatch_media_url_identity_equivalent: result.mismatch_media_url_identity_equivalent,
          mismatch_media_type: result.mismatch_media_type,
          mismatch_media_category: result.mismatch_media_category,
          mismatch_media_classification: result.mismatch_media_classification,
          mismatch_order: result.mismatch_order,
          mismatch_preferred_photo: result.mismatch_preferred_photo,
          mismatch_media_modification_ts: result.mismatch_media_modification_ts,
          mismatch_modification_ts: result.mismatch_modification_ts,
          rows_with_one_mismatch: result.rows_with_one_mismatch,
          rows_with_multiple_mismatches: result.rows_with_multiple_mismatches,
          rows_failed: result.rows_failed,
          listings_processed: result.listings_processed,
          listings_skipped: result.listings_skipped,
          summary_rows_checked: result.summary_writes.rows_checked,
          summary_rows_materially_changed: result.summary_writes.rows_materially_changed,
          summary_rows_suppressed_unchanged: result.summary_writes.rows_suppressed_unchanged,
          summary_rows_inserted: result.summary_writes.rows_inserted,
          summary_rows_updated: result.summary_writes.rows_updated,
          summary_rows_failed: result.summary_writes.rows_failed,
          pages_revalidated: result.pages_revalidated,
          revalidation_failures: result.revalidation_failures,
          backlog_inflow_since_last_run: result.backlog_inflow_since_last_run,
          rows_selected: result.rows_selected,
          rows_attempted: result.rows_attempted,
          rows_drained: result.rows_drained,
          failures: result.failures,
          overlap_prevented: result.overlap_prevented,
          time_budget_exhausted: result.time_budget_exhausted,
          query_path_classification: result.query_path_classification,
          run_duration_ms: result.run_duration_ms,
          r2_backlog_batch_selected: result.r2_backlog_batch_selected,
          r2_parked_recovery_selected: result.r2_parked_recovery_selected,
          r2_parked_recovery_attempted: result.r2_parked_recovery_attempted,
          r2_failure_budget_exhausted: result.r2_failure_budget_exhausted,
          mirror_allowed: result.mirror_allowed,
          mirror_rejected_policy: result.mirror_rejected_policy,
          mirror_rejected_policy_parked: result.mirror_rejected_policy_parked,
          r2_mirrored: result.r2_mirrored,
          r2_uploaded: result.r2_uploaded,
          r2_reused: result.r2_reused,
          r2_failed: result.r2_failed,
          r2_skipped: result.r2_skipped,
          backlog_remaining: result.backlog_remaining,
          duration_ms: result.duration_ms,
          // Durable Cotality usage telemetry, correlated with the machine run.
          outcome: "success",
          one_cycle_run_id: oneCycleRunId,
          cotality: snapshotCollector(cotalityCollector) as unknown as Record<string, number>,
          ...(result.error ? { error: result.error } : {}),
        },
      },
    });

    // P1C5: ghosts are otherwise invisible in runtime logs.
    if (result.ghost_listings_skipped > 0) {
      console.log(
        `[media-sync] ghost listings skipped: ${result.ghost_listings_skipped} (${result.ghost_listing_ids.join(", ")})`,
      );
    }

    return { status: 200, body: { success: true, ...result } };
  } catch (err) {
    // Defensive — any unexpected throw escapes runMediaSync()'s internal error
    // handling. Bearer tokens / signed URLs are never echoed; only err.message.
    const msg = err instanceof Error ? err.message : "Unknown error";
    await prisma.auditEvent
      .create({
        data: {
          action: "media_sync_cron_error",
          entity_type: "listing_media",
          entity_id: "bulk",
          user_type: "system",
          user_id: null,
          // Telemetry persists on FAILURE too.
          changes: {
            error: msg,
            outcome: "error",
            one_cycle_run_id: oneCycleRunId,
            cotality: snapshotCollector(cotalityCollector) as unknown as Record<string, number>,
          },
        },
      })
      .catch(() => {
        // audit failure must not mask the real error
      });
    return { status: 500, body: { error: `Sync failed: ${msg}` } };
  }
}
