// GET /api/cron/media-backfill
// Lightweight cron — runs every 8 minutes to backfill photos for listings
// that have empty media arrays (failed batch-fetches during sync).
// Protected by CRON_SECRET header (Vercel Cron).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { backfillEmptyMedia } from "@/lib/idx/sync";
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
    const result = await backfillEmptyMedia({ limit: 100 });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Media Backfill Cron] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
