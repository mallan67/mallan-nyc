// GET /api/cron/idx-sync
// Automated IDX sync cron — runs every 4 hours.
// Fetches incremental updates from Trestle and upserts to local DB.
// Protected by CRON_SECRET header (Vercel Cron).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncListings, getLastSyncTimestamp } from "@/lib/idx/sync";
import { hasCredentials } from "@/lib/idx/auth";
import prisma from "@/lib/prisma";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
    return NextResponse.json({
      skipped: true,
      reason: "IDX disabled or credentials missing",
    });
  }

  const forceFull = req.nextUrl.searchParams.get('full') === 'true';

  // Concurrency guard — prevent overlapping sync runs (skip for manual full sync)
  if (!forceFull) {
    const recentSync = await prisma.auditEvent.findFirst({
      where: {
        action: "idx_sync_cron",
        created_at: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // Within last 10 min
      },
      orderBy: { created_at: "desc" },
    });
    if (recentSync) {
      return NextResponse.json({ skipped: true, reason: "Sync already ran within last 10 minutes" });
    }
  }

  try {
    const since = forceFull ? null : await getLastSyncTimestamp();

    // 2026-05-15 (PR-S.5): hard-cap scheduled cron batch at 500 records.
    //
    // Why: this route's `maxDuration` is 120 s (set both in `vercel.json`
    // and on `export const maxDuration` above). `syncListings` does:
    //   1. Paginated Trestle fetch (filter = ModificationTimestamp gt since),
    //   2. Per-record sequential DB findUnique + DOM compute + upsert
    //      (~80 ms per record on a warm Neon pooled connection),
    //   3. Post-loop batch media fetch (15 listings per batch, ~700 ms each)
    //      + per-listing updateMany to write media JSON back to DB.
    // The previous cap of 12,000 records is mathematically incompatible
    // with the 120 s window: even just the per-record loop alone is
    // 12,000 × 80 ms = 16 min, before accounting for Trestle pagination
    // or media batch follow-up. Production cron has been timing out
    // (504) for several hours — `ops:health` showed the sync watermark
    // 2.6 h stale at the time of this patch.
    //
    // 500 records / run at ~80 ms each = 40 s in the loop + ~25 s media
    // batches = ~65 s, comfortably under 120 s. The cron fires every 10
    // minutes, so a backlog of any realistic size drains in a handful
    // of runs (e.g. 2.6 h backlog ≈ 800 records ≈ 2 runs).
    //
    // Manual `?full=true` triggers also use this cap. To drain a very
    // large backlog manually, invoke the cron repeatedly; do NOT raise
    // the cap inline — escalate via a follow-up PR if needed (the
    // proposal in PR-S.5's design is Option 3: bulk findMany + chunked
    // $transaction upserts, which closes the per-record DB roundtrip
    // cost so a higher cap becomes safe).
    const SCHEDULED_MAX_RECORDS = 500;

    const result = await syncListings({
      since: since || undefined,
      maxRecords: SCHEDULED_MAX_RECORDS,
      fullSync: forceFull || !since, // Full sync if forced or no previous sync
    });

    // Log audit
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
        },
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[IDX Sync Cron] Error:", msg);

    await prisma.auditEvent.create({
      data: {
        action: "idx_sync_cron_error",
        entity_type: "listing",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: { error: msg },
      },
    }).catch(() => {}); // Don't let audit failure mask the real error

    return NextResponse.json(
      { error: `Sync failed: ${msg}` },
      { status: 500 }
    );
  }
}
