// /api/crm/listings/[id]/media-order — PATCH: persist photo ordering
import {
  withCrmMediaConvergence,
  expectAffected,
  isCrmMediaPreconditionError,
} from "@/lib/media/crm-media-mutation";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { importJsonMediaToRows, isCrmMediaKey, crmListingTouchData } from "@/lib/media/crm-media";
import {
  listingCapabilities,
  CAPABILITY_DENIED,
  CAPABILITY_LISTING_SELECT,
} from "@/lib/auth/listing-capabilities";

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
    select: { id: true, media: true, ...CAPABILITY_LISTING_SELECT },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Namespace-scoped: managing EXISTING Mallan-owned media is allowed wherever
  // genuine `crm:` rows live, including historical uploads on RLS rows. The
  // SOURCE protection is per-ITEM via isCrmMediaKey() below, and the cursor
  // protection is crmListingTouchData() at the end of this handler.
  if (!listingCapabilities(auth, listing).mayManageLocalMedia) {
    return NextResponse.json(CAPABILITY_DENIED.ACCESS, { status: 403 });
  }

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  // Ensure legacy JSON is in rows so the keys we reorder exist (idempotent).
  // `last_synced_from_trestle` is REQUIRED: without it the importer fails closed
  // and would refuse genuine local media (see lib/media/media-provenance.ts).

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

  // Codex #383: if EVERY submitted key is feed-owned, nothing was persisted —
  // that must be a non-OK response, because the CRM callers toast "saved" on
  // any 2xx. A silent-success no-op is exactly the failure mode this repo's
  // silent-failure ledger rows exist to prevent.
  if (crmOrdered.length === 0) {
    return NextResponse.json(
      {
        error:
          "No order saved: all submitted keys are Trestle feed photos, whose order is feed-owned (synced from Cotality). Only CRM-uploaded media can be reordered.",
        skipped_trestle_keys: skippedTrestleKeys,
        rows_updated: 0,
      },
      { status: 422 }
    );
  }

  // Order feeds hero fallback, so a reorder can change the canonical hero and
  // therefore the derived Listing summary. Both commit together.
  // Order feeds hero fallback, so a reorder can change the canonical hero and
  // therefore the derived Listing summary. Both commit together.
  //
  // Zero-effect reorders are a FAILURE, not a success. Syntactically valid crm:
  // keys that no longer match active rows (deleted elsewhere, or belonging to
  // another listing) would otherwise leave every updateMany at count 0 while the
  // route recomputed the summary and answered 200 with rows_updated: 0.
  let updatedCount = 0;
  try {
    updatedCount = await withCrmMediaConvergence(listing.listing_id, async (tx) => {
    // Legacy CRM JSON import joins THIS transaction. Run separately it would
    // commit rows that survive a later rollback of the mutation and summary.
    await importJsonMediaToRows(tx, {
      listing_id: listing.listing_id,
      media: listing.media,
      last_synced_from_trestle: listing.last_synced_from_trestle,
    });
      let affected = 0;
      for (const { key, index } of crmOrdered) {
        const r = await tx.listingMedia.updateMany({
          where: { media_key: key, listing_id: listing.listing_id, status: "active" },
          data: { order: index },
        });
        // Each submitted key must resolve to exactly one active row on THIS
        // listing. Partial application would persist an order the caller never
        // asked for.
        expectAffected(r.count, 1, `reorder ${key}`);
        affected += r.count;
      }
      return affected;
    });
  } catch (err) {
    if (isCrmMediaPreconditionError(err)) {
      return NextResponse.json(
        {
          error: "One or more media keys do not resolve to an active row on this listing",
          detail: (err as { detail?: unknown }).detail,
        },
        { status: 409 },
      );
    }
    throw err;
  }

  // P1C4: never bump MT on Trestle-synced rows (idx-sync cursor reads it);
  // CRM-only exclusives keep the touch. See crmListingTouchData.
  const touch = crmListingTouchData(listing.last_synced_from_trestle);
  if (touch) {
    await prisma.listing.update({ where: { listing_id: id }, data: touch });
  }

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
