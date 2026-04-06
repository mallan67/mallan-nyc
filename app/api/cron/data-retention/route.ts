// GET /api/cron/data-retention
// Weekly cron job: enforce data retention policies per NY SHIELD Act + REBNY.
// - Purge expired sessions (24h TTL)
// - Archive audit logs older than 2 years
// - Flag closed listings for removal (REBNY: 24h after status change)
// Protected by CRON_SECRET header.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results: Record<string, number> = {};

  // 1. Purge expired sessions (24h TTL)
  const sessionCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiredSessions = await prisma.session.deleteMany({
    where: { expires_at: { lt: sessionCutoff } },
  });
  results.expired_sessions_purged = expiredSessions.count;

  // 1b. Purge expired MFA sessions (5-min TTL, but clean up anything >1h old)
  const mfaCutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const expiredMfaSessions = await prisma.mfaSession.deleteMany({
    where: { expires_at: { lt: mfaCutoff } },
  });
  results.expired_mfa_sessions_purged = expiredMfaSessions.count;

  // 2. Archive audit logs older than 2 years (mark as archived, don't delete)
  const auditCutoff = new Date();
  auditCutoff.setFullYear(auditCutoff.getFullYear() - 2);
  // Count old audit events for reporting (Prisma doesn't support soft-delete natively,
  // so we log the count for manual review rather than auto-deleting compliance records)
  const oldAuditCount = await prisma.auditEvent.count({
    where: { created_at: { lt: auditCutoff } },
  });
  results.audit_events_older_than_2yr = oldAuditCount;

  // 3. Flag closed/terminal listings not yet marked (REBNY RLS Sec. 2.05: remove within 24h)
  // Note: filterDisplayableDbListings() already excludes non-active statuses in real-time,
  // so this is a belt-and-suspenders DB cleanup for any edge cases (direct DB queries, etc.)
  const closedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleClosedListings = await prisma.listing.findMany({
    where: {
      status: { in: ["Closed", "Sold", "Leased", "Rented", "Withdrawn", "Expired", "Cancelled"] },
      status_changed_at: { lt: closedCutoff },
      idx_display_yn: true, // still marked for IDX display
    },
    select: { id: true, listing_id: true, status: true, status_changed_at: true },
  });

  if (staleClosedListings.length > 0) {
    await prisma.listing.updateMany({
      where: { id: { in: staleClosedListings.map((l) => l.id) } },
      data: { idx_display_yn: false },
    });

    await prisma.auditEvent.createMany({
      data: staleClosedListings.map((l) => ({
        action: "idx_display_yn_disabled",
        entity_type: "listing",
        entity_id: l.id.toString(),
        user_type: "system",
        user_id: null,
        changes: {
          reason: "Terminal/closed listing >24h — REBNY RLS Sec. 2.05 compliance",
          status: l.status,
          status_changed_at: l.status_changed_at?.toISOString(),
        },
      })),
    });
  }
  results.closed_listings_removed_from_idx = staleClosedListings.length;

  // 4. Clean up expired portal invite tokens (72h TTL)
  const tokenCutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const expiredTokens = await prisma.lead.updateMany({
    where: {
      portal_token: { not: null },
      portal_token_expires_at: { lt: tokenCutoff },
    },
    data: {
      portal_token: null,
      portal_token_expires_at: null,
    },
  });
  results.expired_portal_tokens_cleared = expiredTokens.count;

  // 5. Clean up read notifications older than 90 days
  const notifCutoff = new Date();
  notifCutoff.setDate(notifCutoff.getDate() - 90);
  const oldNotifications = await prisma.notification.deleteMany({
    where: {
      read_at: { not: null },
      created_at: { lt: notifCutoff },
    },
  });
  results.read_notifications_purged = oldNotifications.count;

  // 6. Clean up stale geocode cache entries older than 1 year
  const geoCutoff = new Date();
  geoCutoff.setFullYear(geoCutoff.getFullYear() - 1);
  const oldGeoEntries = await prisma.geocodeCache.deleteMany({
    where: { created_at: { lt: geoCutoff } },
  });
  results.stale_geocode_cache_purged = oldGeoEntries.count;

  // Log the retention run
  await prisma.auditEvent.create({
    data: {
      action: "data_retention_run",
      entity_type: "system",
      entity_id: "cron",
      user_type: "system",
      user_id: null,
      changes: results,
    },
  });

  return NextResponse.json({ ...results });
}
