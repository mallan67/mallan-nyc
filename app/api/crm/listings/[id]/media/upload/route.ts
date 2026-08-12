// POST /api/crm/listings/[id]/media/upload
// File upload for listing photos: agent uploads image → Sharp optimization → R2 → Prisma.
// Auth: agent/broker session required. Agent can only upload to own listings; broker to any.
//
// SECURITY:
// - Image validation (type + size) before processing
// - EXIF/GPS metadata stripped by Sharp
// - WebP conversion (3 variants: hero 1600px, card 800px, thumb 400px)
// - Auth-gated: session cookie required, role + ownership enforced
// - Audit logged
//
// Content-Type: multipart/form-data
// Body: file (image), caption? (string), order? (number)

import { withCrmMediaConvergence } from "@/lib/media/crm-media-mutation";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { validateImage, optimizeImage } from "@/lib/images/optimize";
import { uploadToR2 } from "@/lib/images/r2";
import {
  crmMediaKey,
  crmMediaType,
  crmMediaCategory,
  crmMediaClassification,
  crmListingTouchData,
  importJsonMediaToRows,
} from "@/lib/media/crm-media";
import { listingCapabilities, CAPABILITY_DENIED } from "@/lib/auth/listing-capabilities";

function hasR2Config(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Resolve listing
  const numericId = parseInt(id);
  let listing;
  if (!isNaN(numericId)) {
    listing = await prisma.listing.findUnique({
      where: { id: BigInt(numericId) },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
    });
  }
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // NEW Mallan media belongs on the LOCAL canonical listing. On the RLS
  // return-copy it would attach to a publicly suppressed row (invisible); on a
  // third-party listing it would republish another brokerage's listing with
  // Mallan-authored content.
  const caps = listingCapabilities(auth, listing);
  if (!caps.mayUploadNewLocalMedia) {
    return NextResponse.json(
      caps.mayViewHistory ? CAPABILITY_DENIED.SOURCE_OWNED : CAPABILITY_DENIED.ACCESS,
      { status: 403 },
    );
  }

  // Check R2 configuration
  if (!hasR2Config()) {
    return NextResponse.json(
      { error: "Media storage not configured" },
      { status: 503 }
    );
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "No file provided. Expected 'file' field in multipart form." },
      { status: 400 }
    );
  }

  const caption = formData.get("caption")?.toString() || "";
  const orderParam = formData.get("order");

  // Validate image
  const mimeType = file.type || "application/octet-stream";
  const validation = validateImage(file.size, mimeType);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Cotality-shaped storage: CRM media lives in the `listing_media` table in the
  // `crm:` key namespace. The media_key is derived from the content hash, so a
  // re-upload of the same image yields the same key → the @unique constraint
  // gives content-dedup. (Cotality/IDX Plus is the source of truth for the shape.)
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const mediaKey = crmMediaKey(listing.listing_id, contentHash);

  // Lazily import any legacy `listing.media` JSON for this listing into rows so
  // the rows set is COMPLETE before we add the new one (the public resolver
  // prefers rows when any exist — partial rows would hide the JSON photos).

  // Dedup: if this exact image is already an active row on this listing, 409.
  const existingRow = await prisma.listingMedia.findUnique({
    where: { media_key: mediaKey },
    select: { media_url_cached: true, media_url_original: true, order: true, status: true },
  });
  if (existingRow && existingRow.status === "active") {
    return NextResponse.json(
      {
        photo: {
          media_key: mediaKey,
          url: existingRow.media_url_cached || existingRow.media_url_original,
          order: existingRow.order,
        },
        duplicate: true,
      },
      { status: 409 },
    );
  }

  // Optimize: strip EXIF/GPS, convert to WebP, generate 3 variants
  let variants;
  try {
    variants = await optimizeImage(buffer, "listings");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Media Upload] Sharp optimization failed:", msg);
    return NextResponse.json(
      { error: "Image processing failed. Please try a different image." },
      { status: 422 }
    );
  }

  // Upload variants to R2
  // Sanitize listing ID for R2 key — prevent path traversal
  const rawListingId = listing.listing_id || listing.id.toString();
  const listingId = rawListingId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const timestamp = Date.now();
  const urls: Record<string, string> = {};

  try {
    for (const variant of variants) {
      const key = `listings/${listingId}/${timestamp}-${variant.variant}.webp`;
      const url = await uploadToR2(key, variant.buffer, variant.contentType);
      urls[variant.variant] = url;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Media Upload] R2 upload failed:", msg);
    return NextResponse.json(
      { error: "Failed to store image. Please try again." },
      { status: 502 }
    );
  }

  // Classify (Cotality MediaType) — explicit form 'type' wins, else caption.
  const rawType = formData.get("type")?.toString() || "";
  const mediaType = crmMediaType(rawType, caption);
  const mediaCategory = crmMediaCategory(mediaType);

  // Order: explicit param, else append after the current max order for the listing.
  let order: number;
  if (orderParam != null && orderParam.toString().trim() !== "") {
    order = parseInt(orderParam.toString()) || 0;
  } else {
    const maxRow = await prisma.listingMedia.findFirst({
      where: { listing_id: listing.listing_id, status: "active" },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    order = maxRow ? maxRow.order + 1 : 0;
  }

  // Hero default: if this is the first Photo on the listing (no preferred photo
  // yet), mark it preferred so there is always a hero. The agent can change it
  // via set-as-main. Floor plans / videos are never preferred.
  let preferred = false;
  if (mediaType === "Photo") {
    const existingPreferred = await prisma.listingMedia.count({
      where: { listing_id: listing.listing_id, status: "active", preferred_photo_yn: true },
    });
    preferred = existingPreferred === 0;
  }

  const heroVariantKey = `listings/${listingId}/${timestamp}-hero.webp`;
  const cachedUrl = urls.card || urls.hero || "";

  const writeSelect = {
    media_key: true,
    media_url_cached: true,
    media_url_original: true,
    order: true,
    preferred_photo_yn: true,
    media_type: true,
  } as const;

  // Re-upload of a previously soft-deleted same image (same file + listing →
  // same deterministic media_key). The active duplicate was already 409'd
  // above, so a truthy existingRow here is non-active. RESTORE it to active with
  // the fresh R2 variants — a create() would hit the media_key @unique
  // constraint (P2002) and 500. (Codex media P0 finding #3.)
  const created = await withCrmMediaConvergence(listing.listing_id, async (tx) => {
    // Legacy CRM JSON import joins THIS transaction. Run separately it would
    // commit rows that survive a later rollback of the mutation and summary.
    await importJsonMediaToRows(tx, {
      listing_id: listing.listing_id,
      media: listing.media,
      last_synced_from_trestle: listing.last_synced_from_trestle,
    });
    const row = existingRow
    ? await tx.listingMedia.update({
        where: { media_key: mediaKey },
        data: {
          media_url_original: urls.hero || cachedUrl,
          media_url_cached: cachedUrl,
          media_type: mediaType,
          media_category: mediaCategory,
          media_classification: crmMediaClassification(mediaType),
          order,
          preferred_photo_yn: preferred,
          media_modification_ts: new Date(),
          r2_key: heroVariantKey,
          status: "active",
          // Clear stale R2 retry/cooldown state from the row's prior life.
          r2_attempts: null,
          r2_last_attempt_at: null,
        },
        select: writeSelect,
      })
    : await tx.listingMedia.create({
        data: {
          listing_id: listing.listing_id,
          media_key: mediaKey,
          resource_record_key: listing.listing_id,
          media_url_original: urls.hero || cachedUrl,
          media_url_cached: cachedUrl,
          media_type: mediaType,
          media_category: mediaCategory,
          media_classification: crmMediaClassification(mediaType),
          order,
          preferred_photo_yn: preferred,
          media_modification_ts: new Date(),
          r2_key: heroVariantKey,
          status: "active",
        },
        select: writeSelect,
      });
    return row;
  });
  const restored = !!existingRow;

  // P1C4: never bump MT on Trestle-synced rows (idx-sync cursor reads it);
  // CRM-only exclusives keep the touch (legacy JSON left intact either way).
  // The old "ISR sees the change" rationale was inert — detail pages are
  // time-based ISR (revalidate=300), not MT-triggered.
  const touch = crmListingTouchData(listing.last_synced_from_trestle);
  if (touch) {
    await prisma.listing.update({ where: { id: listing.id }, data: touch });
  }

  await logAuditEvent(
    "media_upload",
    "listing",
    listing.id.toString(),
    auth,
    {
      action: restored ? "photo_restored" : "photo_uploaded",
      media_key: mediaKey,
      media_type: mediaType,
      variants: Object.keys(urls),
      order,
      restored,
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  const totalPhotos = await prisma.listingMedia.count({
    where: { listing_id: listing.listing_id, status: "active", media_type: "Photo" },
  });

  return NextResponse.json({
    listing_id: listing.listing_id,
    photo: {
      media_key: created.media_key,
      url: created.media_url_cached,
      heroUrl: created.media_url_original,
      order: created.order,
      media_type: created.media_type,
      preferred_photo_yn: created.preferred_photo_yn,
    },
    total_photos: totalPhotos,
    restored,
  });
}
