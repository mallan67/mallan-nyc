// GET /api/cron/idx-sync
// Automated IDX sync cron — runs every 4 hours.
// Fetches incremental updates from Trestle and upserts to local DB.
// Protected by CRON_SECRET header (Vercel Cron).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncListings, getLastSyncTimestamp } from "@/lib/idx/sync";
import { hasCredentials } from "@/lib/idx/auth";
import prisma from "@/lib/prisma";

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

  // Concurrency guard — prevent overlapping sync runs
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

  try {
    const since = await getLastSyncTimestamp();

    const result = await syncListings({
      since: since || undefined,
      maxRecords: 12000,
      fullSync: !since, // Full sync if no previous sync
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
