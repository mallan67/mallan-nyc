// GET /api/cron/dom-reset
// Daily cron job: reset DOM for listings in Withdrawn/Cancelled >= 30 days.
// Protected by CRON_SECRET header (Vercel Cron or manual trigger).
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { DOM_RESET_DAYS, DOM_RESET_ELIGIBLE_STATUSES } from "@/lib/compliance/dom-tracker";

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

  // Find listings in a DOM-reset-eligible status with status_changed_at older
  // than cutoff that still have days_on_market > 0 (not yet reset).
  //
  // The status list is IMPORTED from lib/compliance/dom-tracker, which re-exports
  // the shared vocabulary. It was previously the literal
  // `["Withdrawn", "Cancelled"]`, which silently excluded every listing the
  // PROVIDER cancelled: `mapTrestleToPrisma` stores `raw.StandardStatus`
  // verbatim, so those rows carry the live Cotality spelling `Canceled`
  // (single L) and this exact-case `in` never matched them. This cron runs
  // daily (0 6 * * *), so the gap silently under-reset DOM every single day.
  // The predicate and `shouldResetDom` now read the SAME object — they cannot
  // disagree.
  const eligible = await prisma.listing.findMany({
    where: {
      status: { in: [...DOM_RESET_ELIGIBLE_STATUSES] },
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

  return NextResponse.json({
    reset: eligible.length,
    listings: eligible.map((l) => l.listing_id),
  });
}
