// /api/crm/listing-sends — POST: orchestrate listing sends to clients + email delivery
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingSendEmail } from "@/lib/email/templates";
import type { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { listing_id, client_ids, sent_via, context } = body as {
    listing_id?: string;
    client_ids?: string[];
    sent_via?: string;
    context?: { source?: string };
  };

  if (!listing_id || !Array.isArray(client_ids) || client_ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "listing_id and client_ids[] are required" },
      { status: 400 }
    );
  }

  if (client_ids.length > 50) {
    return NextResponse.json(
      { ok: false, error: "Maximum 50 clients per send" },
      { status: 400 }
    );
  }

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
      return NextResponse.json({
        ok: true,
        send_id: existing.id.toString(),
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
      media: true,
    },
  });
  if (!listing) {
    return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });
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
  const personalNote = (body.note as string) || undefined;

  // Build listing card data for email template
  const price = listing.list_price
    ? `$${Number(listing.list_price).toLocaleString()}`
    : "Price upon request";
  // Extract first photo URL from media JSON array
  const mediaArr = Array.isArray(listing.media) ? listing.media : [];
  const firstPhoto = mediaArr.length > 0
    ? String((mediaArr[0] as { url?: string; MediaURL?: string })?.url || (mediaArr[0] as { url?: string; MediaURL?: string })?.MediaURL || "")
    : undefined;

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

  return NextResponse.json({
    ok: true,
    send_id: result.send_id,
    listing_id,
    client_ids,
    created_at: result.created_at.toISOString(),
    email: {
      sent: emailResults.filter((r) => r.success).length,
      failed: failed.length,
      errors: failed.length > 0 ? failed : undefined,
    },
  }, { status: 201 });
}
