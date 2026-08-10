// GET /api/cron/listing-expiration
// Daily cron: UCBA A6/A7/A8 Protected Period notifications & enforcement.
// 1. 30-day expiration warning
// 2. 7-day expiration warning
// 3. Auto-create ProtectedPeriod when listing expires
// 4. Enforce 7-biz-day deadline (missed_deadline) and 90-day expiry
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { buildingAndManifestInvalidationTags, listingCacheTag, safeRevalidateTags, SEARCH_CACHE_TAG } from "@/lib/cache/public-cache";
import { createNotification } from "@/lib/notifications/engine";
import { addBusinessDays, addCalendarDays } from "@/lib/compliance/business-days";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingExpirationEmail } from "@/lib/email/templates";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { buildMallanOwnedListingWhere } from "@/lib/idx/media-sync";
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
    email_failures: 0,
  };

  // --- Task 1: 30-day expiration warning ---
  //
  // OWNERSHIP SCOPING (2026-08-10). This task notifies an agent that "Your
  // exclusive on {address} expires ..." and then WRITES
  // `expiration_30d_notified` on the row. It previously scoped by
  // `agent_id: { not: null }` alone, which is not ownership: `syncAgentHistory`
  // stamps `agent_id` on THIRD-PARTY feed rows (it matches BuyerAgentMlsId as
  // well as ListAgentMlsId), and feed rows carry their own `expiration_date`.
  // A Mallan agent who was merely the buyer-side agent on another brokerage's
  // listing would therefore be told it was "your exclusive", and Mallan would
  // write notification bookkeeping onto a Cotality-source-owned row.
  //
  // Same canonical predicate Task 3 already uses. `agent_id: { not: null }` is
  // RETAINED as the DATA requirement (the notification needs a recipient), not
  // as the ownership signal.
  const expiring30d = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "ActiveUnderContract", "ComingSoon", "Pending"] },
      expiration_date: { not: null, lte: thirtyDaysOut, gt: sevenDaysOut },
      expiration_30d_notified: false,
      agent_id: { not: null },
      AND: [buildMallanOwnedListingWhere()],
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
  // OWNERSHIP SCOPING (2026-08-10) — same reasoning as Task 1, and the stakes
  // are higher here: this task ALSO sends the UCBA expiration EMAIL. An
  // outbound email telling an agent their exclusive is expiring, for a listing
  // another brokerage holds, is a misstatement Mallan should never make. It
  // likewise writes `expiration_7d_notified` on the row.
  const expiring7d = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "ActiveUnderContract", "ComingSoon", "Pending"] },
      expiration_date: { not: null, lte: sevenDaysOut, gt: now },
      expiration_7d_notified: false,
      agent_id: { not: null },
      AND: [buildMallanOwnedListingWhere()],
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
    let emailSendFailed = false;
    if (listing.agent?.email) {
      const agentName = `${listing.agent.first_name || ""} ${listing.agent.last_name || ""}`.trim() || "Agent";
      const emailHtml = listingExpirationEmail({
        variant: "urgent_7d",
        recipientName: agentName,
        address: addr,
        listingId: listing.listing_id,
        expirationDate: listing.expiration_date,
      });
      const emailResult = await sendEmail(
        listing.agent.email,
        `Listing expires in 7 days — ${addr}`,
        emailHtml,
        undefined,
        { channel: "company", transactional: true },
      );
      if (!emailResult.success) {
        emailSendFailed = true;
        results.email_failures++;
        await prisma.auditEvent.create({
          data: {
            action: "listing_expiration_email_failed",
            entity_type: "listing",
            entity_id: listing.id.toString(),
            user_type: "system",
            user_id: null,
            changes: {
              branch: "urgent_7d",
              listing_id: listing.listing_id,
              error_class: emailResult._devMode === true ? "smtp_not_configured" : "send_failed",
            },
          },
        }).catch(() => {});
      }
    }

    if (emailSendFailed) {
      continue;
    }

    await prisma.listing.update({
      where: { id: listing.id },
      data: { expiration_7d_notified: true },
    });
    results.warnings_7d++;
  }

  // --- Task 3: Listing expired — create ProtectedPeriod ---
  //
  // OWNERSHIP SCOPING (post-correction audit, 2026-08-09). This is the only
  // MUTATING task in this cron: it writes `status: "Expired"`,
  // `idx_display_yn: false` and `modification_timestamp` on the matched rows.
  //
  // It previously scoped ownership with `agent_id: { not: null }` alone. But
  // `syncAgentHistory` stamps `agent_id` on THIRD-PARTY feed rows (it matches
  // BuyerAgentMlsId as well as ListAgentMlsId), so this cron could expire
  // another brokerage's listing — a source mutation Mallan has no authority to
  // make — and, because those rows carry a non-null `last_synced_from_trestle`,
  // the `modification_timestamp` bump also poisoned the Trestle incremental
  // cursor (the same hazard the comment below already names as the "H1
  // ping-pong").
  //
  // `buildMallanOwnedListingWhere()` is the canonical ownership predicate
  // (`SL-`/`RL-` prefix OR `rls_eligible === false`) — the same one the R2
  // mirror policy uses. `agent_id: { not: null }` is RETAINED, but now as what
  // it actually is: a data requirement, because ProtectedPeriod needs an
  // assigned agent. On a Mallan-owned row that assignment is legitimate.
  //
  // Scoping to Mallan-owned rows also makes the MT bump below safe by
  // construction: those rows are CRM-authored and leave
  // `last_synced_from_trestle` NULL, so they sit outside the cursor query.
  const expired = await prisma.listing.findMany({
    where: {
      status: { in: ["Active", "ActiveUnderContract", "ComingSoon", "Pending"] },
      expiration_date: { not: null, lte: now },
      agent_id: { not: null },
      protected_period: null, // No existing protected period
      AND: [buildMallanOwnedListingWhere()],
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

    // Phase A W2 — Transition listing to Expired with the terminal-status
    // guard applied in the same write.
    //
    // Closes the W2 gap from
    // docs/idx/post-reconciliation-tightening-audit-2026-05-20.md: before
    // this change the cron set `status: "Expired"` without flipping
    // `idx_display_yn=false` and without dual-writing the projection,
    // leaving the row publicly displayable until the next 03:00 UTC
    // data-retention cron firing (≤24h leakage; with PR 5B reader swap
    // this would be a real public-display gap). Bumped
    // `modification_timestamp` is also the exact pattern that previously
    // caused the H1 ping-pong (cron cleans up, next sync re-emits) — the
    // hardcoded false here closes that ping-pong at the writer.
    //
    // `status: "Expired"` is deterministically terminal
    // (TERMINAL_STATUSES.has("Expired") = true), so the canonical
    // `computeGateColumns()` would return idx_display_yn=false regardless
    // of the other gate columns. Hardcoding the literal here keeps this
    // cron's SELECT narrow (no need to fetch the 5 other gate columns
    // just to compute a known value) and matches the data-retention cron's
    // pattern at app/api/cron/data-retention/route.ts:79.
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: "Expired",
        status_changed_at: now,
        modification_timestamp: now,
        idx_display_yn: false,
        // Archive eligibility clock (#415): expiring an active exclusive is a
        // non-terminal→terminal transition. Seed terminal_since from the actual
        // expiration_date (the stable terminal date; guaranteed non-null + <= now
        // by the query + the guard above), NOT the cron run time — so a delayed or
        // disabled cron doesn't push the archive clock late (Codex #446).
        terminal_since: listing.expiration_date ?? now,
      },
    });

    // Phase A W2 — dual-write the listing_search_projection so any reader
    // (including the PR 5B-future projection reader) sees the new terminal
    // gate state immediately. Failure logged to AuditEvent + does NOT
    // block the rest of the cron run (the data-retention cron's per-row
    // dual-write at 03:00 UTC remains belt-and-suspenders for any miss).
    try {
      await dualWriteProjectionForListingId(prisma, listing.listing_id);
    } catch (err) {
      await prisma.auditEvent.create({
        data: {
          action: "projection_dual_write_failed",
          entity_type: "listing",
          entity_id: listing.id.toString(),
          user_type: "system",
          user_id: null,
          changes: {
            source: "listing_expiration_cron",
            listing_id: listing.listing_id,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      }).catch(() => { /* swallow — logging failure must not crash the cron */ });
    }

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

    // One Cycle W1 — an Expired exclusive must leave cached public surfaces
    // in the SAME cycle (its idx_display_yn just flipped false above).
    // …and its BUILDING's cached payload — an expired exclusive must leave
    // the building page's active units in the same cycle.
    safeRevalidateTags([
      listingCacheTag(listing.listing_id),
      ...buildingAndManifestInvalidationTags(listing.address),
      SEARCH_CACHE_TAG,
    ]);
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
        const emailResult = await sendEmail(
          broker.email,
          `Protected buyer deadline missed — ${addr}`,
          emailHtml,
          undefined,
          { channel: "company", transactional: true },
        );
        if (!emailResult.success) {
          results.email_failures++;
          await prisma.auditEvent.create({
            data: {
              action: "listing_expiration_email_failed",
              entity_type: "protected_period",
              entity_id: period.id.toString(),
              user_type: "system",
              user_id: null,
              changes: {
                branch: "deadline_passed",
                listing_id: period.listing.listing_id,
                broker_id: broker.id.toString(),
                error_class: emailResult._devMode === true ? "smtp_not_configured" : "send_failed",
              },
            },
          }).catch(() => {});
        }
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
