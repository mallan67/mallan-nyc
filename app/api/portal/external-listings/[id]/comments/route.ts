// GET/POST /api/portal/external-listings/[id]/comments
// Buyer-side comments and request-info notes for non-IDX external listings.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, logAuditEvent, requireWorkspace } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import {
  normalizeExternalListingCommentBody,
  normalizeExternalListingRequestType,
  serializeExternalListingComment,
} from "@/lib/external-listings/normalize";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { recordPortalEvent } from "@/lib/portal/events";

type RouteParams = { params: Promise<{ id: string }> };

async function loadOwnedExternalListing(req: NextRequest, id: string) {
  const auth = await requireWorkspace(req, "buyer");
  if (isAuthError(auth)) return { auth, response: auth };
  if (auth.userType !== "lead") {
    return {
      auth,
      response: NextResponse.json({ error: "Portal access requires a client account" }, { status: 403 }),
    };
  }

  const externalListingId = safeBigInt(id);
  if (!externalListingId) {
    return {
      auth,
      response: NextResponse.json({ error: "Invalid external listing id" }, { status: 400 }),
    };
  }

  const externalListing = await prisma.externalListing.findFirst({
    where: {
      id: externalListingId,
      lead_id: auth.userId,
    },
  });

  if (!externalListing) {
    return {
      auth,
      response: NextResponse.json({ error: "External listing not found" }, { status: 404 }),
    };
  }

  return { auth, externalListing, response: null };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const access = await loadOwnedExternalListing(req, id);
  if (access.response) return access.response;
  const { externalListing } = access;

  const comments = await prisma.externalListingComment.findMany({
    where: { external_listing_id: externalListing.id },
    include: {
      lead: { select: { id: true, first_name: true, last_name: true, email: true } },
      agent: { select: { id: true, first_name: true, last_name: true, email: true } },
    },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({ comments: comments.map(serializeExternalListingComment) });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const { id } = await params;
  const access = await loadOwnedExternalListing(req, id);
  if (access.response) return access.response;
  const { auth, externalListing } = access;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const commentBody = normalizeExternalListingCommentBody(body.body);
  if (!commentBody) {
    return NextResponse.json({ error: "Comment body is required and must be under 2000 characters" }, { status: 400 });
  }

  const requestType = normalizeExternalListingRequestType(body.request_type);
  const comment = await prisma.externalListingComment.create({
    data: {
      external_listing_id: externalListing.id,
      lead_id: auth.userId,
      body: commentBody,
      request_type: requestType,
    },
    include: {
      lead: { select: { id: true, first_name: true, last_name: true, email: true } },
      agent: { select: { id: true, first_name: true, last_name: true, email: true } },
    },
  });

  await logAuditEvent(
    "external_listing_comment_added",
    "lead",
    auth.userId.toString(),
    auth,
    {
      external_listing_id: externalListing.id.toString(),
      comment_id: comment.id.toString(),
      request_type: requestType,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  await recordPortalEvent({
    leadId: auth.userId,
    eventType: "external_listing_comment_added",
    workspace: "buyer",
    metadata: {
      external_listing_id: externalListing.id.toString(),
      comment_id: comment.id.toString(),
      request_type: requestType,
    },
  });

  return NextResponse.json({ comment: serializeExternalListingComment(comment) }, { status: 201 });
}
