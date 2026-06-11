// /api/crm/listings/[id]/media-order — PATCH: persist photo ordering
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { importJsonMediaToRows, isCrmMediaKey } from "@/lib/media/crm-media";

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
    select: { id: true, listing_id: true, agent_id: true, media: true },
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

  // Ensure legacy JSON is in rows so the keys we reorder exist (idempotent).
  await importJsonMediaToRows(prisma, { listing_id: listing.listing_id, media: listing.media });

  // Persist per-item order onto the Cotality-shaped rows the public resolver
  // actually reads (replaces the old raw_data.media_order, which the resolver
  // ignored). Scoped to THIS listing so a stray key can't reorder another
  // listing's media.
  // P1C2: CRM ordering applies ONLY to the `crm:` namespace. Trestle feed rows'
  // `order` is owned by media-sync (rewritten from the feed on every complete
  // set), so writing it here just ping-pongs and silently reverts the agent's
  // edit. Skipped feed keys are REPORTED, never silently dropped.
  const crmOrdered: Array<{ key: string; index: number }> = [];
  const skippedTrestleKeys: string[] = [];
  ordered_media_ids.forEach((mediaKey, index) => {
    if (isCrmMediaKey(mediaKey)) crmOrdered.push({ key: mediaKey, index });
    else skippedTrestleKeys.push(mediaKey);
  });

  const updates = crmOrdered.map(({ key, index }) =>
    prisma.listingMedia.updateMany({
      where: { media_key: key, listing_id: listing.listing_id, status: "active" },
      data: { order: index },
    })
  );
  const results = updates.length > 0 ? await prisma.$transaction(updates) : [];
  const updatedCount = results.reduce((n, r) => n + r.count, 0);

  await prisma.listing.update({
    where: { listing_id: id },
    data: { modification_timestamp: new Date() },
  });

  await logAuditEvent(
    "update",
    "listing",
    id,
    auth,
    {
      field: "media_order",
      media_count: ordered_media_ids.length,
      rows_updated: updatedCount,
      trestle_keys_skipped: skippedTrestleKeys.length,
    },
    ipAddress
  );

  return NextResponse.json({
    listing_id: id,
    media_order: ordered_media_ids,
    rows_updated: updatedCount,
    skipped_trestle_keys: skippedTrestleKeys,
  });
}
