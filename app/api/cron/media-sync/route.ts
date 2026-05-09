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

    await prisma.auditEvent.create({
      data: {
        action: "media_sync_cron",
        entity_type: "listing_media",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: {
          status: result.status,
          rows_checked: result.rows_checked,
          rows_updated: result.rows_updated,
          rows_failed: result.rows_failed,
          listings_processed: result.listings_processed,
          listings_skipped: result.listings_skipped,
          duration_ms: result.duration_ms,
          ...(result.error ? { error: result.error } : {}),
        },
      },
    });

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
