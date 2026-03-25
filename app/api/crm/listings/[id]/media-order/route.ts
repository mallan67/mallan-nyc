// /api/crm/listings/[id]/media-order — PATCH: persist photo ordering
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import type { Prisma } from "@prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ordered_media_ids } = body as { ordered_media_ids?: string[] };

  if (!Array.isArray(ordered_media_ids) || ordered_media_ids.length === 0) {
    return NextResponse.json({ error: "ordered_media_ids[] is required and must not be empty" },
      { status: 400 }
    );
  }

  // Find listing by listing_id (string ID like "SL-0001")
  const listing = await prisma.listing.findUnique({
    where: { listing_id: id },
    select: { id: true, listing_id: true, agent_id: true, raw_data: true },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Ownership check: agents can only edit their own listings, broker can edit any
  if (auth.role !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "You can only reorder media on your own listings" },
      { status: 403 }
    );
  }

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  // Store media_order in raw_data JSON field
  const existingRawData = (listing.raw_data as Record<string, unknown>) ?? {};
  const updatedRawData = {
    ...existingRawData,
    media_order: ordered_media_ids,
  };

  await prisma.listing.update({
    where: { listing_id: id },
    data: {
      raw_data: updatedRawData as Prisma.InputJsonValue,
    },
  });

  await logAuditEvent(
    "update",
    "listing",
    id,
    auth,
    { field: "media_order", media_count: ordered_media_ids.length },
    ipAddress
  );

  return NextResponse.json({ listing_id: id,
    media_order: ordered_media_ids,
  });
}
