// GET /api/cron/media-sync
// Vercel cron — runs every 15 minutes. Drives the listing_media R2 mirror
// pipeline: cursor → Trestle Property → Media → upsert → mirror → summary.
// Protected by CRON_SECRET (timing-safe).
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
  // 10 minutes. Mirrors the existing idx-sync pattern.
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
          // N1 per-outcome counters (rows_updated stays the legacy
          // inserted+updated_changed aggregate for continuity):
          rows_inserted: result.rows_inserted,
          rows_updated_changed: result.rows_updated_changed,
          rows_skipped_unchanged: result.rows_skipped_unchanged,
          rows_skipped_invalid: result.rows_skipped_invalid,
          rows_tombstoned: result.rows_tombstoned,
          rows_failed: result.rows_failed,
          listings_processed: result.listings_processed,
          listings_skipped: result.listings_skipped,
          r2_mirrored: result.r2_mirrored,
          r2_failed: result.r2_failed,
          r2_skipped: result.r2_skipped,
          backlog_remaining: result.backlog_remaining,
          duration_ms: result.duration_ms,
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
