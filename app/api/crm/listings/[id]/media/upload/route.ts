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
import type { Prisma } from "@prisma/client";

interface MediaItem {
  url: string;
  thumbUrl?: string;
  heroUrl?: string;
  caption?: string;
  order: number;
  type: string;
  uploadedAt: string;
  /** SHA-256 of the original upload buffer, used for server-side dedup. */
  contentHash?: string;
}

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

  // Ownership check: agent can only upload to own listings, broker to any
  if (auth.role.toUpperCase() !== "BROKER" && listing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
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

  // Compute content hash for server-side dedup. If the listing already has
  // a media entry with this exact hash, return 409 so the client marks it
  // uploaded without creating a duplicate R2 object or media row.
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const existingMediaCheck = (listing.media as unknown as MediaItem[]) ?? [];
  const dup = existingMediaCheck.find((m) => m.contentHash === contentHash);
  if (dup) {
    return NextResponse.json(
      { photo: dup, duplicate: true },
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

  // Store in listing media JSON
  const existingMedia = (listing.media as unknown as MediaItem[]) ?? [];
  const nextOrder = orderParam != null
    ? parseInt(orderParam.toString())
    : existingMedia.length;

  const newMedia: MediaItem = {
    url: urls.card || urls.hero || "",
    thumbUrl: urls.thumb,
    heroUrl: urls.hero,
    caption,
    order: nextOrder,
    type: "photo",
    uploadedAt: new Date().toISOString(),
    contentHash,
  };

  // Append the new media, then collapse any pre-existing duplicates by
  // contentHash (legacy media uploaded before hash-based dedup may have
  // shipped the same file 2-3x). Items without a hash are passed through
  // unchanged (legacy media stays visible until the next upload).
  const appended = [...existingMedia, newMedia];
  const seenHashes = new Set<string>();
  const updatedMedia: MediaItem[] = [];
  for (const m of appended) {
    if (m.contentHash) {
      if (seenHashes.has(m.contentHash)) continue;
      seenHashes.add(m.contentHash);
    }
    updatedMedia.push(m);
  }

  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      media: updatedMedia as unknown as Prisma.InputJsonValue,
      modification_timestamp: new Date(),
    },
  });

  await logAuditEvent(
    "media_upload",
    "listing",
    listing.id.toString(),
    auth,
    {
      action: "photo_uploaded",
      variants: Object.keys(urls),
      order: nextOrder,
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    listing_id: listing.listing_id,
    photo: {
      url: newMedia.url,
      thumbUrl: newMedia.thumbUrl,
      heroUrl: newMedia.heroUrl,
      order: newMedia.order,
    },
    total_photos: updatedMedia.length,
  });
}
