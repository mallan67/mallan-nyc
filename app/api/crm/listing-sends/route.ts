// /api/crm/listing-sends — POST: orchestrate listing sends to clients
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
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

  // Verify listing exists
  const listing = await prisma.listing.findUnique({
    where: { listing_id },
    select: { id: true, listing_id: true },
  });
  if (!listing) {
    return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });
  }

  const now = new Date();
  const changes: Record<string, unknown> = {
    listing_id,
    client_ids,
    sent_via: sent_via ?? "crm",
    source: context?.source ?? null,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  };

  // Create audit events in a transaction
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

    // Audit event per client
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
    }

    return { send_id: listingEvent.id.toString(), created_at: now };
  });

  return NextResponse.json({
    ok: true,
    send_id: result.send_id,
    listing_id,
    client_ids,
    created_at: result.created_at.toISOString(),
  }, { status: 201 });
}
