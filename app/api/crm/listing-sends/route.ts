// /api/crm/listing-sends — POST: orchestrate listing sends to clients + email delivery
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingSendEmail } from "@/lib/email/templates";
import { escapeHtml } from "@/lib/sanitize";
import type { Prisma } from "@prisma/client";
import { generateTrackingToken } from "@/lib/tracking/listing-token";
import { assertLeadIdsAccess } from "@/lib/crm/access";
import { scanRecordForFairHousing } from "@/lib/compliance/rls-enforcement";
import { composeDbPublicMedia } from "@/lib/media/db-media-composition";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { listing_id, client_ids, sent_via, context } = body as {
    listing_id?: string;
    client_ids?: string[];
    sent_via?: string;
    context?: { source?: string };
  };

  if (!listing_id || !Array.isArray(client_ids) || client_ids.length === 0) {
    return NextResponse.json({ error: "listing_id and client_ids[] are required" },
      { status: 400 }
    );
  }

  if (client_ids.length > 50) {
    return NextResponse.json({ error: "Maximum 50 clients per send" },
      { status: 400 }
    );
  }
  const access = await assertLeadIdsAccess(auth, client_ids);
  if (access.response) return access.response;

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  // Idempotency check: look for same key in audit_events within last 5 minutes
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await prisma.auditEvent.findFirst({
      where: {
        action: "listing_sent",
        entity_type: "listing",
        entity_id: listing_id,
        user_id: auth.userId,
        created_at: { gte: fiveMinAgo },
        changes: {
          path: ["idempotency_key"],
          equals: idempotencyKey,
        },
      },
    });
    if (existing) {
      return NextResponse.json({ send_id: existing.id.toString(),
        listing_id,
        client_ids,
        created_at: existing.created_at.toISOString(),
        deduplicated: true,
      });
    }
  }

  // Verify listing exists — fetch enough for email card
  const listing = await prisma.listing.findUnique({
    where: { listing_id },
    select: {
      id: true,
      listing_id: true,
      address: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      living_area: true,
      status: true,
      listing_type: true,
      property_type: true,
      // Legacy `Listing.media` JSON — retained ONLY as the composer's fallback
      // input for listings not yet mirrored into `listing_media`. Never read
      // directly (see the email-card block below).
      media: true,
      // Canonical media rows. Same column shape /api/listings selects
      // (app/api/listings/route.ts:396-414): active-only, ordered by
      // (order, id) so the resolver receives a stable input. This WIDENS the
      // existing findUnique — no second round trip.
      listing_media: {
        where: { status: "active" },
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: {
          // media_key: MIXED-GALLERY COMPOSITION — an all-`crm:` set is a
          // SUPPLEMENT to the feed JSON, not the whole gallery
          // (lib/media/listing-media-resolver.ts:748-765).
          media_key: true,
          media_url_original: true,
          media_url_cached: true,
          media_type: true,
          media_category: true,
          media_classification: true,
          order: true,
          preferred_photo_yn: true,
          status: true,
        },
      },
      // ALL-STATUS existence signal. The select above is ACTIVE-only, so
      // `listing_media.length` would read an all-deleted Mallan listing as
      // "never imported" and RESURRECT photos the agent deleted, out of the
      // legacy JSON (lib/media/db-media-composition.ts:55-67).
      _count: { select: { listing_media: true } },
      // Mallan-ownership signal for that same authority test
      // (isMallanOwnedListing: SL-/RL- listing_id OR rls_eligible === false).
      rls_eligible: true,
      // REBNY distribution gate fields
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      owner_opt_out: true,
      participant_only: true,
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // REBNY compliance: server-side distribution gate check (defense-in-depth)
  // Listings with any gate flag set to restrict display must not be sent to clients.
  if (
    listing.idx_display_yn === false ||
    listing.internet_entire_listing_display_yn === false ||
    listing.owner_opt_out === true ||
    listing.participant_only === true
  ) {
    return NextResponse.json({ error: "This listing is not eligible for distribution per REBNY RLS rules." },
      { status: 400 }
    );
  }

  // PR-CRM.2 (2026-05-24) — Fair Housing scan on agent-composed free text.
  //
  // Per the CRM Backbone Audit (2026-05-24) §8 finding #1: this route was
  // sending agent-composed `note` (and any future cover_note/caption
  // field) to clients WITHOUT scanning for protected-class language.
  // Listing fields themselves are already scanned at listing-write time
  // via `assertRlsCompliantPayload`; this closes the send-time gap.
  // Federal FHA + NY State HRL + NYC Title 8 + NYC Fair Chance Housing
  // Act all apply to client outreach text, not just public ads.
  //
  // We scan three agent-composed text fields:
  //   - note         (currently consumed by listingSendEmail as personalNote)
  //   - cover_note   (CRM Lifecycle Intelligence OS doctrine §10; reserved)
  //   - caption      (same doctrine; reserved for future caller use)
  // If/when callers add other agent-composed fields, add them to fhRecord.
  //
  // On any violation: return HTTP 422 BEFORE any DB write or email send.
  // The response surfaces field + severity only — we do NOT echo the
  // matched term back to the caller (avoid teaching the scanner's
  // exact triggers and avoid mirroring prohibited language).
  const fhRecord: Record<string, string | null | undefined> = {};
  if (typeof body.note === "string") fhRecord.note = body.note;
  if (typeof body.cover_note === "string") fhRecord.cover_note = body.cover_note;
  if (typeof body.caption === "string") fhRecord.caption = body.caption;
  const fhViolations = scanRecordForFairHousing(fhRecord);
  if (fhViolations.length > 0) {
    return NextResponse.json({
      error: "This send was blocked by the Fair Housing scanner. Please revise the message and try again.",
      fair_housing_violations: fhViolations.map((v) => ({
        field: v.field,
        severity: v.severity,
      })),
    }, { status: 422 });
  }

  // Resolve agent name for email
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true, email: true },
  });
  const agentName = agent
    ? `${agent.first_name || ""} ${agent.last_name || ""}`.trim() || "Your Agent"
    : "Your Agent";

  const now = new Date();
  const changes: Record<string, unknown> = {
    listing_id,
    client_ids,
    sent_via: sent_via ?? "crm",
    source: context?.source ?? null,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  };

  // Create audit events + ClientListingAction records + auto-follow-up tasks in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Audit event for the listing itself
    const listingEvent = await tx.auditEvent.create({
      data: {
        action: "listing_sent",
        entity_type: "listing",
        entity_id: listing_id,
        user_type: auth.userType,
        user_id: auth.userId,
        changes: changes as Prisma.InputJsonValue,
        ip_address: ipAddress ?? null,
      },
    });

    // Per-client: audit event + ClientListingAction + follow-up task
    for (const clientId of client_ids) {
      await tx.auditEvent.create({
        data: {
          action: "listing_sent",
          entity_type: "lead",
          entity_id: clientId,
          user_type: auth.userType,
          user_id: auth.userId,
          changes: {
            listing_id,
            sent_via: sent_via ?? "crm",
            source: context?.source ?? null,
          } as Prisma.InputJsonValue,
          ip_address: ipAddress ?? null,
        },
      });

      // Create ClientListingAction so listing appears in client portal
      const clientIdBigInt = BigInt(clientId);
      await tx.clientListingAction.upsert({
        where: {
          lead_id_listing_id_action: {
            lead_id: clientIdBigInt,
            listing_id: listing.id,
            action: "sent",
          },
        },
        update: { created_at: now },
        create: {
          lead_id: clientIdBigInt,
          listing_id: listing.id,
          action: "sent",
        },
      });

      // Auto-create follow-up task: "Follow up on [listing] with [client]" due in 3 days
      const client = await tx.lead.findUnique({
        where: { id: clientIdBigInt },
        select: { first_name: true, last_name: true },
      });
      const clientName = client
        ? `${client.first_name || ""} ${client.last_name || ""}`.trim()
        : `Client #${clientId}`;
      await tx.followUpTask.create({
        data: {
          lead_id: clientIdBigInt,
          agent_id: auth.userId,
          title: `Follow up on ${listing_id} with ${clientName}`,
          description: `Listing ${listing_id} was sent via ${sent_via ?? "crm"}. Check if client has questions or wants to schedule a showing.`,
          due_date: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
          priority: "medium",
          task_type: "follow_up",
        },
      });
    }

    return { send_id: listingEvent.id.toString(), created_at: now };
  });

  // ── Email delivery (non-blocking — don't fail the API if email fails) ──
  const emailResults: { clientId: string; success: boolean; error?: string }[] = [];
  const personalNote = body.note ? escapeHtml(String(body.note)) : undefined;

  // Build listing card data for email template
  const price = listing.list_price
    ? `$${Number(listing.list_price).toLocaleString()}`
    : "Price upon request";
  // ── Email-card hero: canonical composition, never raw `media[0]` ──────────
  //
  // This previously read `listing.media[0].url || .MediaURL` straight off the
  // legacy JSON. Trestle interleaves Photos, FloorPlans and documents in
  // arbitrary provider order, and ~2,000 legacy first-position items are floor
  // plans/documents carrying an EMPTY MediaCategory
  // (lib/media/listing-media-resolver.ts:134-141) — so a client could receive an
  // email whose listing card was a floor plan, or a `/DOCUMENT-Pdf/` URL that an
  // `<img src>` cannot render at all. It also ignored `listing_media`, the
  // canonical rows, entirely.
  //
  // `composeDbPublicMedia` resolves relational rows first (legacy JSON only as
  // its own gated fallback), sorts photo-first, dedupes, and proxies each URL
  // exactly once. Picking `mediaType === 'Photo'` — rather than `media[0]` —
  // keeps the documented card rule (lib/media/listing-media-resolver.ts:434-448):
  // a card would rather show no image than a floor plan. `listingSendEmail`
  // renders no `<img>` at all when `photoUrl` is undefined
  // (lib/email/templates.ts:395-397), which is the correct degraded state.
  const composed = composeDbPublicMedia({
    listingId: listing.listing_id,
    rlsEligible: listing.rls_eligible,
    tableRows: listing.listing_media,
    legacyMedia: Array.isArray(listing.media) ? listing.media : [],
    // ALL-STATUS count, never `listing.listing_media.length` (active-only
    // select): an all-deleted Mallan listing must stay authoritatively empty.
    hadRelationalRows:
      typeof listing._count?.listing_media === "number"
        ? listing._count.listing_media > 0
        : undefined,
  });
  const firstPhoto = composed.media.find((m) => m.mediaType === "Photo")?.url;

  // Fetch all client emails in one query
  const clientBigIntIds = client_ids.map((id) => BigInt(id));
  const clients = await prisma.lead.findMany({
    where: { id: { in: clientBigIntIds } },
    select: { id: true, first_name: true, last_name: true, email: true },
  });

  for (const client of clients) {
    if (!client.email) {
      emailResults.push({ clientId: client.id.toString(), success: false, error: "No email" });
      continue;
    }
    const clientName = `${client.first_name || ""} ${client.last_name || ""}`.trim() || "there";
    const html = listingSendEmail(
      {
        address: String(typeof listing.address === "object" && listing.address !== null
          ? (listing.address as Record<string, unknown>).full || (listing.address as Record<string, unknown>).UnparsedAddress || listing.listing_id
          : listing.address || listing.listing_id || "Property"),
        price,
        beds: listing.bedrooms_total ?? undefined,
        baths: listing.bathrooms_full ?? undefined,
        sqft: listing.living_area ? Number(listing.living_area) : undefined,
        status: listing.status ?? undefined,
        photoUrl: firstPhoto || undefined,
        listingId: listing.listing_id,
        listingType: listing.listing_type ?? listing.property_type ?? undefined,
      },
      clientName,
      agentName,
      personalNote
    );

    // Send from agent's own email — personal relationship with client
    const emailResult = await sendEmail(
      client.email,
      `New listing for you: ${listing.address || listing.listing_id}`,
      html,
      { userId: auth.userId, userType: auth.userType } as import("@/lib/auth/session").SessionUser,
      {
        channel: "agent",
        from: agent ? { email: agent.email, name: agentName } : undefined,
        replyTo: agent?.email,
      }
    );
    emailResults.push({
      clientId: client.id.toString(),
      success: emailResult.success,
      error: emailResult.error,
    });
  }

  const failed = emailResults.filter((r) => !r.success);

  // Generate tracked URLs for each client
  const tracked_urls: Record<string, string> = {};
  try {
    for (const cid of client_ids) {
      const token = generateTrackingToken(BigInt(cid), listing_id);
      tracked_urls[cid] = `https://mallan.nyc/listing/${listing.listing_id}?t=${token}`;
    }
  } catch {
    // Token generation is optional — don't fail the send if TRACKING_SECRET is missing
  }

  return NextResponse.json({ send_id: result.send_id,
    listing_id,
    client_ids,
    created_at: result.created_at.toISOString(),
    tracked_urls,
    email: {
      sent: emailResults.filter((r) => r.success).length,
      failed: failed.length,
      errors: failed.length > 0 ? failed : undefined,
    },
  }, { status: 201 });
}
