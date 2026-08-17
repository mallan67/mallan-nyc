// GET /api/cron/dom-reset
// Daily cron job: reset DOM for listings in Withdrawn/Cancelled >= 30 days.
// Protected by CRON_SECRET header (Vercel Cron or manual trigger).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { DOM_RESET_DAYS } from "@/lib/compliance/dom-tracker";
import { safeRevalidateTags, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DOM_RESET_DAYS);

  // Find listings in Withdrawn/Cancelled with status_changed_at older than cutoff
  // that still have days_on_market > 0 (not yet reset)
  const eligible = await prisma.listing.findMany({
    where: {
      status: { in: ["Withdrawn", "Cancelled"] },
      status_changed_at: { lt: cutoff },
      days_on_market: { gt: 0 },
    },
    select: {
      id: true,
      listing_id: true,
      days_on_market: true,
      status: true,
    },
  });

  if (eligible.length === 0) {
    return NextResponse.json({ reset: 0, message: "No listings eligible for DOM reset" });
  }

  // Reset DOM for each eligible listing + log audit event
  const resetIds = eligible.map((l) => l.id);

  await prisma.listing.updateMany({
    where: { id: { in: resetIds } },
    data: {
      days_on_market: 0,
      first_active_date: null,
    },
  });

  // Log audit events
  const auditData = eligible.map((l) => ({
    action: "dom_reset",
    entity_type: "listing",
    entity_id: l.id.toString(),
    user_type: "system",
    user_id: null,
    changes: {
      previous_dom: l.days_on_market,
      reason: `${DOM_RESET_DAYS}+ days in ${l.status}`,
    },
  }));

  await prisma.auditEvent.createMany({ data: auditData });

  // MISSING INVALIDATION, fixed 2026-08-16. `days_on_market` and
  // `first_active_date` are both selected by the cached `api-market-active`
  // read (app/api/market/route.ts), so resetting them without expiring the
  // search tag left the market surface serving pre-reset numbers until the
  // 600s TTL lapsed.
  //
  // Only the coarse search tag is emitted, deliberately. This job resets DOM on
  // Withdrawn/Cancelled listings, which are terminal and therefore already
  // excluded from the per-building and per-manifest-shard payloads by the
  // display gates — naming those tags would expire entries that cannot contain
  // these rows. `safeRevalidateTags` never throws, so a cache failure cannot
  // fail the cron after the reset has already been written.
  if (resetIds.length > 0) {
    safeRevalidateTags([SEARCH_CACHE_TAG]);
  }

  return NextResponse.json({
    reset: eligible.length,
    listings: eligible.map((l) => l.listing_id),
  });
}
