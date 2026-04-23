// GET /api/cron/data-retention
// Daily cron job: enforce data retention policies per NY SHIELD Act + REBNY.
// - Purge expired sessions (24h TTL)
// - Purge audit logs older than 2 years
// - T+24h: Flag terminal listings for IDX removal (REBNY RLS §2.05)
// - T+30d: Null media array on terminals (R2 holds images, JSON pointer safe to drop)
// - T+180d: Archive terminal listings — copy summary to listings_archive,
//            strip heavy JSON, mark sync_status='archived'. Keeps row for FK integrity.
// Protected by CRON_SECRET header.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const maxDuration = 60;

// Batch caps to keep a single cron run under the 60s budget
const T30_BATCH_CAP = 1000;
const T180_BATCH_CAP = 500;

const TERMINAL_STATUSES = ["Closed", "Sold", "Leased", "Rented", "Withdrawn", "Expired", "Cancelled"] as const;

type JsonObject = Record<string, unknown>;
function asObject(v: unknown): JsonObject {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {};
}
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

  // 2. Purge audit logs older than 2 years (REBNY RLS retention floor = 2 years)
  // Prior behavior only COUNTED — fixed to actually delete per the 2-year compliance boundary.
  // Trestle/IDX access logs (`trestle_access`, `trestle_data_access`) have a 12-month floor
  // but are safe to retain for 2 years under the broader audit policy.
  const auditCutoff = new Date();
  auditCutoff.setFullYear(auditCutoff.getFullYear() - 2);
  const purgedAudit = await prisma.auditEvent.deleteMany({
    where: { created_at: { lt: auditCutoff } },
  });
  results.audit_events_purged_over_2yr = purgedAudit.count;

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

  // 3b. T+30d: Null media array on terminal listings past 30 days.
  // R2 holds the actual image bytes; the listings.media JSON is just a pointer array.
  // Public search already excludes terminal statuses, so nulling media has no user impact.
  // Skips listings already archived (sync_status='archived') — Step 3c handles those.
  const thirtyDayCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const terminalOver30d = await prisma.listing.findMany({
    where: {
      status: { in: [...TERMINAL_STATUSES] },
      status_changed_at: { lt: thirtyDayCutoff },
      sync_status: { not: "archived" },
      // Only touch listings that still have media — cheap filter
      NOT: { media: { equals: [] } },
    },
    select: { id: true },
    take: T30_BATCH_CAP,
  });

  if (terminalOver30d.length > 0) {
    await prisma.listing.updateMany({
      where: { id: { in: terminalOver30d.map((l) => l.id) } },
      data: { media: [] as unknown as Prisma.InputJsonValue },
    });
  }
  results.t30d_media_nulled = terminalOver30d.length;

  // 3c. T+180d: Archive terminal listings.
  // Copy summary fields into listings_archive, then strip heavy JSON from the
  // source listing and mark sync_status='archived'. We do NOT delete the row —
  // several FKs (PriceHistory, MarketingActivity, Showing, etc.) reference it
  // and preserving referential integrity matters more than the row overhead.
  // The archive table satisfies NY DOS 6-year recordkeeping requirements.
  const oneEightyDayCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const toArchive = await prisma.listing.findMany({
    where: {
      status: { in: [...TERMINAL_STATUSES] },
      status_changed_at: { lt: oneEightyDayCutoff },
      sync_status: { not: "archived" },
    },
    select: {
      id: true,
      listing_id: true,
      mls_id: true,
      status: true,
      listing_type: true,
      property_type: true,
      property_sub_type: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      bathrooms_half: true,
      living_area: true,
      borough: true,
      neighborhood: true,
      city: true,
      postal_code: true,
      days_on_market: true,
      address: true,
      agent_info: true,
      raw_data: true,
      created_at: true,
    },
    take: T180_BATCH_CAP,
  });

  let archivedCount = 0;
  for (const l of toArchive) {
    try {
      const addr = asObject(l.address);
      const agent = asObject(l.agent_info);
      const raw = asObject(l.raw_data);

      // Assemble denormalized address_line (e.g. "123 Main St, Apt 4B")
      const streetNumber = str(addr.StreetNumber);
      const streetName = str(addr.StreetName);
      const unit = str(addr.UnitNumber);
      const addressLine = [
        [streetNumber, streetName].filter(Boolean).join(" "),
        unit ? `Apt ${unit}` : null,
      ].filter(Boolean).join(", ") || null;

      // Listing key: prefer mls_id (= ListingKey per Trestle guidance), fallback to listing_id
      const listingKey = l.mls_id || l.listing_id;

      await prisma.$transaction([
        prisma.listingsArchive.upsert({
          where: { listing_key: listingKey },
          create: {
            listing_key: listingKey,
            listing_id: l.listing_id,
            mls_id: l.mls_id,
            status: l.status,
            listing_type: l.listing_type,
            property_type: l.property_type,
            property_sub_type: l.property_sub_type,
            close_price: num(raw.ClosePrice) !== null ? (num(raw.ClosePrice) as unknown as Prisma.Decimal) : null,
            close_date: raw.CloseDate ? new Date(String(raw.CloseDate)) : null,
            list_price: l.list_price,
            original_list_price: num(raw.OriginalListPrice) !== null ? (num(raw.OriginalListPrice) as unknown as Prisma.Decimal) : null,
            bedrooms_total: l.bedrooms_total,
            bathrooms_full: l.bathrooms_full,
            bathrooms_half: l.bathrooms_half,
            living_area: l.living_area,
            borough: l.borough,
            neighborhood: l.neighborhood,
            city: l.city,
            postal_code: l.postal_code,
            address_line: addressLine,
            list_agent_full_name: str(agent.ListAgentFullName) || str(raw.ListAgentFullName),
            list_office_name: str(agent.ListOfficeName) || str(raw.ListOfficeName),
            days_on_market: l.days_on_market,
            original_created_at: l.created_at,
          },
          update: {}, // idempotent — if already archived (re-run), do nothing
        }),
        prisma.listing.update({
          where: { id: l.id },
          data: {
            sync_status: "archived",
            raw_data: Prisma.JsonNull,
            media: [] as unknown as Prisma.InputJsonValue,
            compliance: {} as unknown as Prisma.InputJsonValue,
          },
        }),
      ]);
      archivedCount++;
    } catch (err) {
      console.error(`[Data Retention] Archive failed for listing ${l.listing_id}:`, err);
      await prisma.syncError.create({
        data: {
          resource: "listings_archive_move",
          listing_id: l.listing_id,
          listing_key: l.mls_id,
          error_code: "archive",
          error_msg: (err instanceof Error ? err.message : String(err)).slice(0, 2000),
        },
      }).catch(() => {});
    }
  }
  results.t180d_listings_archived = archivedCount;

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
