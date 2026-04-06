// GET /api/cron/media-backfill
// Runs every 8 minutes. Two phases:
//   1. Backfill: fetch photos from Trestle for listings with empty media
//   2. R2 Migration: cache Trestle URLs to R2 for permanent, fast photo loads
// Protected by CRON_SECRET header (Vercel Cron).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { backfillEmptyMedia, migrateMediaToR2 } from "@/lib/idx/sync";
import { hasCredentials } from "@/lib/idx/auth";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasCredentials()) {
    return NextResponse.json({ error: "Trestle credentials not configured" }, { status: 503 });
  }

  try {
    // Phase 1: Fill empty media from Trestle
    const backfill = await backfillEmptyMedia({ limit: 100 });

    // Phase 2: Migrate Trestle URLs → R2 (permanent CDN, no proxy needed)
    // Runs after backfill so newly filled media also gets migrated.
    // Limit 50/run — at 8min intervals, migrates ~360 listings/hour.
    const r2 = await migrateMediaToR2({ limit: 50 });

    return NextResponse.json({
      success: true,
      backfill,
      r2Migration: r2,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Media Backfill Cron] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
