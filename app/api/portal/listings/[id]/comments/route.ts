// GET/POST /api/portal/listings/[id]/comments
// Threaded comments on listings. Portal clients + family members.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePortalRole, requireAuth, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { isListingDisplayable } from "@/lib/search/listing-access-decision";
import { recordPortalEvent } from "@/lib/portal/events";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET — Fetch all comments on a listing for this client's group
 * (client + family members who share access).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requirePortalRole(req, "buyer", "renter", "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const listingId = safeBigInt(id);
  if (!listingId) {
    return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });
  if (!listing || !isListingDisplayable(listing)) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Get this client's family group (self + family members)
  const familyLinks = await prisma.familyMember.findMany({
    where: {
      OR: [
        { lead_id: auth.userId },
        { member_lead_id: auth.userId },
      ],
    },
    select: { lead_id: true, member_lead_id: true },
  });

  const groupIds = new Set<bigint>([auth.userId]);
  for (const link of familyLinks) {
    groupIds.add(link.lead_id);
    groupIds.add(link.member_lead_id);
  }

  const comments = await prisma.comment.findMany({
    where: {
      listing_id: listingId,
      lead_id: { in: [...groupIds] },
    },
    include: {
      lead: {
        select: { id: true, first_name: true, last_name: true },
      },
    },
    orderBy: { created_at: "asc" },
  });

  const serialized = comments.map((c) => ({
    id: c.id.toString(),
    listing_id: c.listing_id.toString(),
    parent_id: c.parent_id?.toString() ?? null,
    body: c.body,
    author: {
      id: c.lead.id.toString(),
      name: `${c.lead.first_name} ${c.lead.last_name}`,
      isMe: c.lead_id === auth.userId,
    },
    created_at: c.created_at,
  }));

  return NextResponse.json({ comments: serialized });
}

/**
 * POST — Add a comment or reply on a listing.
 * Body: { body: string, parent_id?: string }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;

  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requirePortalRole(req, "buyer", "renter", "seller", "landlord");
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const listingId = safeBigInt(id);
  if (!listingId) {
    return NextResponse.json({ error: "Invalid listing ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const commentBody = (body.body as string)?.trim();
  if (!commentBody || commentBody.length === 0) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  if (commentBody.length > 2000) {
    return NextResponse.json({ error: "Comment must be under 2000 characters" }, { status: 400 });
  }

  // Verify listing exists
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });
  if (!listing || !isListingDisplayable(listing)) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const parentId = body.parent_id ? safeBigInt(body.parent_id as string) : null;

  const comment = await prisma.comment.create({
    data: {
      listing_id: listingId,
      lead_id: auth.userId,
      parent_id: parentId,
      body: commentBody,
    },
  });

  await logAuditEvent(
    "create",
    "comment",
    comment.id.toString(),
    auth,
    { listing_id: id, parent_id: parentId?.toString() ?? null },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  if (auth.userType === "lead") {
    await recordPortalEvent({
      leadId: auth.userId,
      eventType: "comment_add",
      listingId: listing.listing_id,
      metadata: { comment_id: comment.id.toString(), parent_id: parentId?.toString() ?? null },
    });
  }

  return NextResponse.json(
    {
      id: comment.id.toString(),
      listing_id: comment.listing_id.toString(),
      body: comment.body,
      created_at: comment.created_at,
    },
    { status: 201 }
  );
}
