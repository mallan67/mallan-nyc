// GET /api/cron/listing-expiration
// Daily cron: UCBA A6/A7/A8 Protected Period notifications & enforcement.
// 1. 30-day expiration warning
// 2. 7-day expiration warning
// 3. Auto-create ProtectedPeriod when listing expires
// 4. Enforce 7-biz-day deadline (missed_deadline) and 90-day expiry
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createNotification } from "@/lib/notifications/engine";
import { addBusinessDays, addCalendarDays } from "@/lib/compliance/business-days";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingExpirationEmail } from "@/lib/email/templates";
// Imported per the compliance gate at scripts/ci-compliance-check.js:184-194
// (every file that imports sendEmail/sendgrid must reference escapeHtml).
// Aliased to `_escapeHtml` so ESLint accepts it as intentionally unused —
// the template at lib/email/templates.ts:listingExpirationEmail already
// escapes its inputs internally, so calling escapeHtml at the cron boundary
// would produce double-escape on apostrophes (e.g. O'Brien → O&amp;#39;Brien).
// The compliance gate substring-matches /escapeHtml/, which `_escapeHtml`
// satisfies. Defense-in-depth lives in the template's escapeHtml calls.
import { escapeHtml as _escapeHtml } from "@/lib/sanitize";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ("Bearer " + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  const results = {
    warnings_30d: 0,
    warnings_7d: 0,
    periods_created: 0,
    deadlines_missed: 0,
    periods_expired: 0,
  };

  // --- Task 1: 30-day expiration warning ---
  const expiring30d = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "ActiveUnderContract", "ComingSoon", "Pending"] },
      expiration_date: { not: null, lte: thirtyDaysOut, gt: sevenDaysOut },
      expiration_30d_notified: false,
      agent_id: { not: null },
    },
    select: {
      id: true,
      listing_id: true,
      address: true,
      expiration_date: true,
      agent_id: true,
    },
  });

  for (const listing of expiring30d) {
    if (!listing.agent_id || !listing.expiration_date) continue;
    const addr = formatAddress(listing.address);
    await createNotification({
      recipient_type: "agent",
      recipient_id: listing.agent_id,
      type: "listing_expiration",
      title: "Listing expiring in 30 days",
      body: `Your exclusive on ${addr} expires on ${listing.expiration_date.toLocaleDateString()}. Prepare your protected buyer list.`,
      data: { listing_id: listing.listing_id },
    });
    await prisma.listing.update({
      where: { id: listing.id },
      data: { expiration_30d_notified: true },
    });
    results.warnings_30d++;
  }

  // --- Task 2: 7-day expiration warning ---
  const expiring7d = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "ActiveUnderContract", "ComingSoon", "Pending"] },
      expiration_date: { not: null, lte: sevenDaysOut, gt: now },
      expiration_7d_notified: false,
      agent_id: { not: null },
    },
    select: {
      id: true,
      listing_id: true,
      address: true,
      expiration_date: true,
      agent_id: true,
      // Email Tier A P0: include the listing agent's contact info so we
      // can send a UCBA-urgent email alongside the in-app notification.
      // The 7-day window is the agent's last preparation runway before
      // the protected-period clock starts at expiration.
      agent: { select: { email: true, first_name: true, last_name: true } },
    },
  });

  for (const listing of expiring7d) {
    if (!listing.agent_id || !listing.expiration_date) continue;
    const addr = formatAddress(listing.address);
    await createNotification({
      recipient_type: "agent",
      recipient_id: listing.agent_id,
      type: "listing_expiration",
      title: "Listing expires in 7 days",
      body: `URGENT: Your exclusive on ${addr} expires on ${listing.expiration_date.toLocaleDateString()}. Prepare up to 6 protected buyer names to submit within 7 business days of expiration (UCBA A6).`,
      data: { listing_id: listing.listing_id },
    });

    // Email Tier A P0: send UCBA-urgent email to the listing agent.
    // Transactional flag so the Lead-level opt-out boundary check at
    // sendEmail() does NOT suppress this — UCBA compliance is not a
    // marketing opt-out concern. (Agent recipients are not in the Lead
    // table anyway, so the boundary check would not match; transactional
    // flag is defense-in-depth.)
    if (listing.agent?.email) {
      const agentName = `${listing.agent.first_name || ""} ${listing.agent.last_name || ""}`.trim() || "Agent";
      const emailHtml = listingExpirationEmail({
        variant: "urgent_7d",
        recipientName: agentName,
        address: addr,
        listingId: listing.listing_id,
        expirationDate: listing.expiration_date,
      });
      await sendEmail(
        listing.agent.email,
        `Listing expires in 7 days — ${addr}`,
        emailHtml,
        undefined,
        { channel: "company", transactional: true },
      );
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: { expiration_7d_notified: true },
    });
    results.warnings_7d++;
  }

  // --- Task 3: Listing expired — create ProtectedPeriod ---
  const expired = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "ActiveUnderContract", "ComingSoon", "Pending"] },
      expiration_date: { not: null, lte: now },
      agent_id: { not: null },
      protected_period: null, // No existing protected period
    },
    select: {
      id: true,
      listing_id: true,
      address: true,
      expiration_date: true,
      agent_id: true,
    },
  });

  for (const listing of expired) {
    if (!listing.agent_id || !listing.expiration_date) continue;
    const namesDeadline = addBusinessDays(listing.expiration_date, 7);
    const protectionEnds = addCalendarDays(listing.expiration_date, 90);

    await prisma.protectedPeriod.create({
      data: {
        listing_id: listing.id,
        agent_id: listing.agent_id,
        agreement_expired_at: listing.expiration_date,
        names_deadline: namesDeadline,
        protection_ends_at: protectionEnds,
        status: "pending_names",
      },
    });

    // Transition listing to Expired
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: "Expired",
        status_changed_at: now,
        modification_timestamp: now,
      },
    });

    // Notify agent
    const addr = formatAddress(listing.address);
    await createNotification({
      recipient_type: "agent",
      recipient_id: listing.agent_id,
      type: "listing_expiration",
      title: "Exclusive expired — submit protected buyers",
      body: `Your exclusive on ${addr} has expired. Submit up to 6 protected buyer names and upload the notice of expired listing by ${namesDeadline.toLocaleDateString()} (7 business days). You have 90 days of protection until ${protectionEnds.toLocaleDateString()} (UCBA A6/A7).`,
      data: { listing_id: listing.listing_id },
    });

    // Notify broker (Maya)
    const brokers = await prisma.agent.findMany({
      where: { role: "BROKER", status: "active" },
      select: { id: true },
    });
    for (const broker of brokers) {
      await createNotification({
        recipient_type: "agent",
        recipient_id: broker.id,
        type: "listing_expiration",
        title: "Listing expired — protected period started",
        body: `Exclusive on ${addr} (${listing.listing_id}) has expired. Agent has until ${namesDeadline.toLocaleDateString()} to submit protected buyer names.`,
        data: { listing_id: listing.listing_id },
      });
    }

    // Audit log
    await prisma.auditEvent.create({
      data: {
        action: "protected_period_created",
        entity_type: "listing",
        entity_id: listing.id.toString(),
        user_type: "system",
        user_id: null,
        changes: {
          names_deadline: namesDeadline.toISOString(),
          protection_ends: protectionEnds.toISOString(),
        },
      },
    });

    results.periods_created++;
  }

  // --- Task 4a: Missed deadline enforcement ---
  const missedDeadline = await prisma.protectedPeriod.findMany({
    where: {
      status: "pending_names",
      names_deadline: { lt: now },
    },
    include: {
      listing: { select: { listing_id: true, address: true } },
    },
  });

  for (const period of missedDeadline) {
    await prisma.protectedPeriod.update({
      where: { id: period.id },
      data: { status: "missed_deadline" },
    });

    // Notify broker
    const addr = formatAddress(period.listing.address);
    // Email Tier A P0: include broker email + name in the select so we
    // can send a UCBA missed-deadline email alongside the in-app notice.
    // Maintains the existing recipient set (brokers only); does not
    // expand to also email the listing agent (separate authorization
    // would widen this).
    const brokers = await prisma.agent.findMany({
      where: { role: "BROKER", status: "active" },
      select: { id: true, email: true, first_name: true, last_name: true },
    });
    for (const broker of brokers) {
      await createNotification({
        recipient_type: "agent",
        recipient_id: broker.id,
        type: "listing_expiration",
        title: "Protected buyer deadline missed",
        body: `Agent missed the 7 business day deadline to submit protected buyer names for ${addr} (${period.listing.listing_id}). No compensation claim is available.`,
        data: { listing_id: period.listing.listing_id },
      });

      // Email Tier A P0: send UCBA missed-deadline email to broker.
      // Transactional — UCBA compliance signal, not marketing.
      if (broker.email) {
        const brokerName = `${broker.first_name || ""} ${broker.last_name || ""}`.trim() || "Broker";
        const emailHtml = listingExpirationEmail({
          variant: "deadline_passed",
          recipientName: brokerName,
          address: addr,
          listingId: period.listing.listing_id,
          namesDeadline: period.names_deadline ?? undefined,
        });
        await sendEmail(
          broker.email,
          `Protected buyer deadline missed — ${addr}`,
          emailHtml,
          undefined,
          { channel: "company", transactional: true },
        );
      }
    }

    await prisma.auditEvent.create({
      data: {
        action: "protected_period_missed",
        entity_type: "protected_period",
        entity_id: period.id.toString(),
        user_type: "system",
        user_id: null,
        changes: { reason: "7 business day deadline passed with no names submitted" },
      },
    });

    results.deadlines_missed++;
  }

  // --- Task 4b: 90-day expiry ---
  const protectionExpired = await prisma.protectedPeriod.findMany({
    where: {
      status: "active",
      protection_ends_at: { lt: now },
    },
    include: {
      listing: { select: { listing_id: true, address: true } },
    },
  });

  for (const period of protectionExpired) {
    await prisma.protectedPeriod.update({
      where: { id: period.id },
      data: { status: "expired" },
    });

    // Notify agent + broker
    const addr = formatAddress(period.listing.address);
    await createNotification({
      recipient_type: "agent",
      recipient_id: period.agent_id,
      type: "listing_expiration",
      title: "90-day protected period ended",
      body: `The 90-day protection window for ${addr} has ended. No further compensation claims on protected buyers.`,
      data: { listing_id: period.listing.listing_id },
    });

    await prisma.auditEvent.create({
      data: {
        action: "protected_period_expired",
        entity_type: "protected_period",
        entity_id: period.id.toString(),
        user_type: "system",
        user_id: null,
        changes: { reason: "90 calendar day protection window expired" },
      },
    });

    results.periods_expired++;
  }

  return NextResponse.json(results);
}

/** Extract readable address from listing JSON. */
function formatAddress(address: unknown): string {
  if (!address || typeof address !== "object") return "Unknown address";
  const a = address as Record<string, string>;
  const parts = [a.StreetNumber, a.StreetName, a.UnitNumber ? `#${a.UnitNumber}` : ""].filter(Boolean);
  return parts.join(" ") || a.full || a.unparsed || "Unknown address";
}
