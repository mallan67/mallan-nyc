// GET /api/cron/data-retention
// Weekly cron job: enforce data retention policies per NY SHIELD Act + REBNY.
// - Purge expired sessions (24h TTL)
// - Archive audit logs older than 2 years
// - Flag closed listings for removal (REBNY: 24h after status change)
// Protected by CRON_SECRET header.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

  // 2. Archive audit logs older than 2 years (mark as archived, don't delete)
  const auditCutoff = new Date();
  auditCutoff.setFullYear(auditCutoff.getFullYear() - 2);
  // Count old audit events for reporting (Prisma doesn't support soft-delete natively,
  // so we log the count for manual review rather than auto-deleting compliance records)
  const oldAuditCount = await prisma.auditEvent.count({
    where: { created_at: { lt: auditCutoff } },
  });
  results.audit_events_older_than_2yr = oldAuditCount;

  // 3. Flag closed listings not yet marked (REBNY: remove display within 24h)
  const closedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleClosedListings = await prisma.listing.findMany({
    where: {
      status: { in: ["Closed", "Sold", "Leased", "Rented"] },
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
          reason: "Closed listing >24h — REBNY RLS Sec. 2.05 compliance",
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

  return NextResponse.json({ ok: true, ...results });
}
