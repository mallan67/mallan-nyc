// /api/crm/listings/[id]/media/[mediaId]
//   DELETE → soft-delete a CRM media item by media_key (status='deleted').
//   PATCH  → set-as-main: preferred_photo_yn=true on this item, false on siblings.
//
// CRM-owned media only: both verbs require a `crm:` media_key, so Trestle/Cotality
// synced rows can never be modified through this CRM endpoint (guardrail #10).
// Cotality/IDX Plus remains the source of truth for the media shape.

import { withCrmMediaConvergence } from "@/lib/media/crm-media-mutation";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import {
  isCrmMediaKey,
  importJsonMediaToRows,
  crmListingTouchData,
  CRM_MEDIA_KEY_PREFIX,
} from "@/lib/media/crm-media";
import {
  listingCapabilities,
  CAPABILITY_DENIED,
  CAPABILITY_LISTING_SELECT,
} from "@/lib/auth/listing-capabilities";
import type { SessionUser } from "@/lib/auth/session";

async function resolveOwnedListing(
  id: string,
  auth: SessionUser,
) {
  const numericId = parseInt(id);
  let listing = null;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({
      where: { id: BigInt(numericId) },
      select: { id: true, media: true, ...CAPABILITY_LISTING_SELECT },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
      select: { id: true, media: true, ...CAPABILITY_LISTING_SELECT },
    });
  }
  // Explicit `kind` discriminant. Without it TypeScript infers
  // `{ error: NextResponse; listing?: undefined } | { error?: undefined; listing: L }`,
  // and `"error" in resolved` does NOT discriminate that union (the key is
  // present-but-optional on both members), so `resolved.error` stayed
  // `NextResponse | undefined` and every caller's return type leaked an
  // `undefined`. A literal discriminant narrows cleanly.
  if (!listing) {
    return { kind: "denied" as const, error: NextResponse.json({ error: "Listing not found" }, { status: 404 }) };
  }
  // Namespace-scoped: both verbs already require a `crm:` media_key, so the
  // per-ITEM source protection is in place. This gate is the actor check —
  // broker or the listing's associated agent — and stays permissive across
  // source classes so genuine historical `crm:` media on an RLS row remains
  // deletable and re-heroable.
  if (!listingCapabilities(auth, listing).mayManageLocalMedia) {
    return { kind: "denied" as const, error: NextResponse.json(CAPABILITY_DENIED.ACCESS, { status: 403 }) };
  }
  return { kind: "resolved" as const, listing };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id, mediaId } = await params;
  const mediaKey = decodeURIComponent(mediaId);
  if (!isCrmMediaKey(mediaKey)) {
    return NextResponse.json(
      { error: "Only CRM media can be modified here" },
      { status: 400 },
    );
  }

  const resolved = await resolveOwnedListing(id, auth);
  if (resolved.kind === "denied") return resolved.error;
  const { listing } = resolved;

  await importJsonMediaToRows(prisma, {
    listing_id: listing.listing_id,
    media: listing.media,
    last_synced_from_trestle: listing.last_synced_from_trestle,
  });

  // Soft-delete (audit trail preserved), scoped to this listing.
  // Soft-delete and the derived Listing summary commit TOGETHER. Appending the
  // summary write after an already-committed tombstone is what left 8 listings
  // reporting a stale photo_count: the media row changed, the summary did not.
  const res = await withCrmMediaConvergence(listing.listing_id, async (tx) => {
    const updated = await tx.listingMedia.updateMany({
      where: { media_key: mediaKey, listing_id: listing.listing_id, status: "active" },
      data: { status: "deleted" },
    });
    if (updated.count === 0) return updated; // nothing written; summary unchanged
    return updated;
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  // P1C4: never bump MT on Trestle-synced rows (idx-sync cursor reads it);
  // CRM-only exclusives keep the touch. See crmListingTouchData.
  const touch = crmListingTouchData(listing.last_synced_from_trestle);
  if (touch) {
    await prisma.listing.update({ where: { id: listing.id }, data: touch });
  }

  await logAuditEvent(
    "delete",
    "listing",
    listing.id.toString(),
    auth,
    { action: "media_soft_deleted", media_key: mediaKey },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({ listing_id: listing.listing_id, media_key: mediaKey, deleted: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id, mediaId } = await params;
  const mediaKey = decodeURIComponent(mediaId);
  if (!isCrmMediaKey(mediaKey)) {
    return NextResponse.json(
      { error: "Only CRM media can be modified here" },
      { status: 400 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // empty body is allowed for a bare set-as-main
  }
  const wantsMain =
    body.preferred_photo_yn === true || body.action === "set-main" || body.set_as_main === true;
  if (!wantsMain) {
    return NextResponse.json(
      { error: "Unsupported PATCH. Send { preferred_photo_yn: true } to set as main photo." },
      { status: 400 },
    );
  }

  const resolved = await resolveOwnedListing(id, auth);
  if (resolved.kind === "denied") return resolved.error;
  const { listing } = resolved;

  await importJsonMediaToRows(prisma, {
    listing_id: listing.listing_id,
    media: listing.media,
    last_synced_from_trestle: listing.last_synced_from_trestle,
  });

  // The target must be an existing active Photo on this listing (floor plans /
  // videos can never be the hero).
  const target = await prisma.listingMedia.findFirst({
    where: { media_key: mediaKey, listing_id: listing.listing_id, status: "active" },
    select: { media_type: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }
  if (target.media_type !== "Photo") {
    return NextResponse.json(
      { error: "Only a photo can be the main image" },
      { status: 400 },
    );
  }

  // Exactly one CRM-preferred photo: clear `crm:` siblings only, then set this
  // one.
  //
  // The clear is deliberately NAMESPACE-SCOPED. It previously cleared every
  // active sibling including Trestle feed rows, but `preferred_photo_yn` on a
  // feed row is source-owned: media-sync rewrites it from `PreferredPhotoYN` on
  // every complete set (media-sync.ts:1263/1293) and scores a difference as a
  // MATERIAL change (media-sync.ts:975). So the wide clear mutated source
  // metadata, was reverted on the next sync — silently undoing this very
  // set-main — and rewrote every feed row each sync (write amplification).
  //
  // The agent's choice is now honored by HERO PRECEDENCE instead: a `crm:`
  // preferred row outranks a feed-preferred row in `selectHeroPhoto`, with no
  // write to any feed row at all.
  // Callback form (not the array form) so the derived summary participates in
  // the SAME transaction as the preferred-photo flips: the hero is part of the
  // summary, so a committed flip with a failed summary write is a split state.
  await withCrmMediaConvergence(listing.listing_id, async (tx) => {
    await tx.listingMedia.updateMany({
      where: {
        listing_id: listing.listing_id,
        status: "active",
        preferred_photo_yn: true,
        media_key: { startsWith: CRM_MEDIA_KEY_PREFIX },
      },
      data: { preferred_photo_yn: false },
    });
    await tx.listingMedia.updateMany({
      where: { media_key: mediaKey, listing_id: listing.listing_id, status: "active" },
      data: { preferred_photo_yn: true },
    });
  });

  // P1C4: never bump MT on Trestle-synced rows (idx-sync cursor reads it);
  // CRM-only exclusives keep the touch. See crmListingTouchData.
  const touch = crmListingTouchData(listing.last_synced_from_trestle);
  if (touch) {
    await prisma.listing.update({ where: { id: listing.id }, data: touch });
  }

  await logAuditEvent(
    "update",
    "listing",
    listing.id.toString(),
    auth,
    { action: "media_set_as_main", media_key: mediaKey },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({ listing_id: listing.listing_id, media_key: mediaKey, preferred_photo_yn: true });
}
