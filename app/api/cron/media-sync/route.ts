// GET /api/cron/media-sync
// Invoked by the One Cycle orchestrator every 10 minutes (no longer an
// independent Vercel cron entry; the route stays deployed for manual trigger).
// Drives the listing_media R2 mirror pipeline: cursor → Trestle Property →
// Media → upsert → mirror → summary. Protected by CRON_SECRET (timing-safe).
//
// Master refactor PR 3 Checkpoint 5 (memory/REFACTOR-2026-04-25.md).
// Reader path is UNCHANGED — public site still reads Listing.media JSON.
// PR 4 swaps the reader after this cron has populated listing_media in
// production for ≥48h.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hasCredentials } from "@/lib/idx/auth";
import { runMediaSync } from "@/lib/idx/media-sync";
import { resetCotalityTelemetry, snapshotCotalityTelemetry } from "@/lib/idx/cotality-telemetry";

export const maxDuration = 120;

const CONCURRENCY_GUARD_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  // 1. CRON_SECRET timing-safe Bearer auth (mirrors app/api/cron/idx-sync).
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    !authHeader ||
    authHeader.length !== ("Bearer " + cronSecret).length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Trestle credential pre-check — soft fail (503) so the cron can be
  // dialled out gracefully if creds rotate.
  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "Trestle credentials not configured" },
      { status: 503 },
    );
  }

  // 3. Concurrency guard — skip if a successful run logged within the last
  // 10 minutes. Mirrors the existing idx-sync pattern. Bypassed for the One
  // Cycle orchestrated path: the orchestrator is the single 10-minute
  // concurrency unit (sequential members; the drain also holds a pg advisory
  // lock), so this 10-minute lookback — which would FALSE-TRIGGER at a
  // 10-minute cadence — must not gate the orchestrated call. It stays active
  // for manual / standalone invocation.
  //
  // The bypass proof is the CRON_SECRET carried in `x-one-cycle-member`
  // (timing-safe compared), NOT the header's mere presence: auth above already
  // rejected anyone without the secret, and a bare `x-one-cycle-member: 1` does
  // not match, so the header alone can never bypass the guard.
  const memberToken = req.headers.get("x-one-cycle-member");
  const orchestrated =
    !!cronSecret &&
    !!memberToken &&
    memberToken.length === cronSecret.length &&
    timingSafeEqual(Buffer.from(memberToken), Buffer.from(cronSecret));
  if (!orchestrated) {
    const recent = await prisma.auditEvent.findFirst({
      where: {
        action: "media_sync_cron",
        created_at: { gte: new Date(Date.now() - CONCURRENCY_GUARD_MS) },
      },
      orderBy: { created_at: "desc" },
    });
    if (recent) {
      return NextResponse.json({
        skipped: true,
        reason: "media_sync_cron ran within last 10 minutes",
      });
    }
  }

  // Correlate durable Cotality telemetry with the One Cycle run (when orchestrated).
  const oneCycleRunId = req.headers.get("x-one-cycle-run-id");
  resetCotalityTelemetry();

  // 4. Run sync. Failure here writes the error audit event; the cursor is
  // NOT advanced inside `runMediaSync()` on the error path.
  try {
    const result = await runMediaSync();

    // Audit changes payload — explicit field list (NOT a spread of `result`)
    // so internal fields can never accidentally leak. Includes the Phase 3
    // observability fields added by the phased-orchestrator refactor (PR #97):
    //   - exit_reason       — was completed / budget_phase1 / budget_phase2 / source_error
    //   - r2_mirrored       — successful R2 mirrors in this firing
    //   - r2_failed         — R2 mirror failures (separate from source rows_failed)
    //   - r2_skipped        — rows skipped by mirror (e.g., no media_url_original)
    //   - backlog_remaining — listing_media rows still missing r2_key/cached
    // Required so external observers (the 48h PR-4 observation clock, ops
    // dashboards, retro analyses) can verify Phase 1/2/3 health from audit
    // alone without ad-hoc DB queries.
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
          // #530 detailed outcome ledger (JSON payload only — NO schema column).
          // Lets a retro prove suppression is REAL: distinguish a genuine drop in
          // rows_updated (rows_skipped_unchanged up) from lower feed volume,
          // invalid rows, delete signals, vanished rows, or failures. Authoritative
          // only on runs where rows_failed === 0 (see RunMediaSyncResult).
          rows_inserted: result.rows_inserted,
          rows_updated_changed: result.rows_updated_changed,
          rows_skipped_unchanged: result.rows_skipped_unchanged,
          rows_skipped_invalid: result.rows_skipped_invalid,
          delete_signals_received: result.delete_signals_received,
          tombstoned_explicit: result.tombstoned_explicit,
          tombstoned_vanished: result.tombstoned_vanished,
          rows_tombstoned: result.rows_tombstoned,
          // #541 comparator-attribution diagnostic (aggregate integer counts only —
          // NO URLs / listing IDs / media keys / source values). Explicit allowlist,
          // no result spread. Identifies which compared field(s) marked existing rows
          // "changed" (0/2,012 suppressed in production). Behavior-preserving.
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
          // Phase 3 surface C — summary-write suppression counters (flattened
          // aggregate integers only; no URLs/ids). Persisted so ops can verify
          // suppressed/updated/failed SUMMARY writes from the durable audit log
          // alone after deploy (Codex #549 review — allowlist omission).
          summary_rows_checked: result.summary_writes.rows_checked,
          summary_rows_materially_changed: result.summary_writes.rows_materially_changed,
          summary_rows_suppressed_unchanged: result.summary_writes.rows_suppressed_unchanged,
          summary_rows_inserted: result.summary_writes.rows_inserted,
          summary_rows_updated: result.summary_writes.rows_updated,
          summary_rows_failed: result.summary_writes.rows_failed,
          // One Cycle W1 — bounded aggregate cache-revalidation counters
          // (integers only; no URLs/ids — same allowlist class as above).
          pages_revalidated: result.pages_revalidated,
          revalidation_failures: result.revalidation_failures,
          // One Cycle W3 — adaptive-drain observability (bounded integers /
          // booleans / enum label only; same allowlist class).
          backlog_inflow_since_last_run: result.backlog_inflow_since_last_run,
          rows_selected: result.rows_selected,
          rows_attempted: result.rows_attempted,
          rows_drained: result.rows_drained,
          failures: result.failures,
          overlap_prevented: result.overlap_prevented,
          time_budget_exhausted: result.time_budget_exhausted,
          query_path_classification: result.query_path_classification,
          run_duration_ms: result.run_duration_ms,
          // Phase 4 — bounded drain / reserved recovery observability (aggregate
          // integers + one boolean; no URLs/ids). Persisted so ops can verify
          // the bounded backlog, recovery fairness, and budget behavior from
          // the durable audit log alone (same allowlist class as the Phase 3
          // summary counters above).
          r2_backlog_batch_selected: result.r2_backlog_batch_selected,
          r2_parked_recovery_selected: result.r2_parked_recovery_selected,
          r2_parked_recovery_attempted: result.r2_parked_recovery_attempted,
          r2_failure_budget_exhausted: result.r2_failure_budget_exhausted,
          // R2-1 mirror-admission counters (additive; legacy keys retained):
          //   mirror_allowed          — Phase-3 candidates admitted by the
          //                             mirror policy (= r2_uploaded + r2_reused
          //                             + r2_failed + r2_skipped)
          //   mirror_rejected_policy  — candidates rejected by the policy
          //                             (never fetched/uploaded)
          //   mirror_rejected_policy_parked — subset of the rejections that
          //                             were POLICY-PARKED (r2_attempts = 9,
          //                             one-time-per-row; permanently out of
          //                             the backlog SELECT — Blocker-1)
          //   r2_uploaded / r2_reused — split of the legacy r2_mirrored aggregate
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
          // Durable Cotality usage telemetry (media-resource requests/pages,
          // token, retries, 429s, latency), correlated with the One Cycle run.
          one_cycle_run_id: oneCycleRunId,
          cotality: snapshotCotalityTelemetry() as unknown as Record<string, number>,
          ...(result.error ? { error: result.error } : {}),
        },
      },
    });

    // P1C5 (queued from RC5): ghosts are otherwise invisible in runtime logs —
    // the JSON below is RETURNED to the cron invoker, never logged. One line
    // when >0 makes skipped ghosts greppable in Vercel runtime logs.
    if (result.ghost_listings_skipped > 0) {
      console.log(
        `[media-sync] ghost listings skipped: ${result.ghost_listings_skipped} (${result.ghost_listing_ids.join(", ")})`,
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    // Defensive — any unexpected throw escapes runMediaSync()'s internal
    // error handling. Log and return 500. Bearer tokens / signed URLs are
    // never echoed; only `err.message`.
    const msg = err instanceof Error ? err.message : "Unknown error";
    await prisma.auditEvent
      .create({
        data: {
          action: "media_sync_cron_error",
          entity_type: "listing_media",
          entity_id: "bulk",
          user_type: "system",
          user_id: null,
          changes: { error: msg },
        },
      })
      .catch(() => {
        // audit failure must not mask the real error
      });
    return NextResponse.json({ error: `Sync failed: ${msg}` }, { status: 500 });
  }
}
