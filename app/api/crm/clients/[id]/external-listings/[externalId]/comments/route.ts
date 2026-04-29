// GET/POST /api/crm/clients/[id]/external-listings/[externalId]/comments
// Agent/broker comments for non-IDX external listings.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, logAuditEvent, requireAgentOrBroker } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import {
  normalizeExternalListingCommentBody,
  normalizeExternalListingRequestType,
  serializeExternalListingComment,
} from "@/lib/external-listings/normalize";
import { safeBigInt } from "@/lib/utils/safe-bigint";

type RouteParams = { params: Promise<{ id: string; externalId: string }> };

async function loadAuthorizedExternalListing(req: NextRequest, id: string, externalId: string) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return { auth, response: auth };

  const leadId = safeBigInt(id);
  const externalListingId = safeBigInt(externalId);
  if (!leadId || !externalListingId) {
    return { auth, response: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, agent_id: true },
  });
  if (!lead) {
    return { auth, response: NextResponse.json({ error: "Client not found" }, { status: 404 }) };
  }
  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return { auth, response: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  }

  const externalListing = await prisma.externalListing.findFirst({
    where: {
      id: externalListingId,
      lead_id: lead.id,
    },
  });
  if (!externalListing) {
    return { auth, response: NextResponse.json({ error: "External listing not found" }, { status: 404 }) };
  }

  return { auth, lead, externalListing, response: null };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id, externalId } = await params;
  const access = await loadAuthorizedExternalListing(req, id, externalId);
  if (access.response) return access.response;
  const { externalListing } = access;

  const comments = await prisma.externalListingComment.findMany({
    where: { external_listing_id: externalListing.id },
    include: {
      lead: { select: { id: true, first_name: true, last_name: true, email: true } },
      agent: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
    },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({
    comments: comments.map((comment) => serializeExternalListingComment(comment, { ownerLeadId: externalListing.lead_id })),
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const { id, externalId } = await params;
  const access = await loadAuthorizedExternalListing(req, id, externalId);
  if (access.response) return access.response;
  const { auth, lead, externalListing } = access;

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
      agent_id: auth.userId,
      body: commentBody,
      request_type: requestType,
    },
    include: {
      lead: { select: { id: true, first_name: true, last_name: true, email: true } },
      agent: { select: { id: true, first_name: true, last_name: true, email: true, role: true } },
    },
  });

  await logAuditEvent(
    "external_listing_comment_added_by_agent",
    "lead",
    lead.id.toString(),
    auth,
    {
      external_listing_id: externalListing.id.toString(),
      comment_id: comment.id.toString(),
      request_type: requestType,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json(
    { comment: serializeExternalListingComment(comment, { ownerLeadId: externalListing.lead_id }) },
    { status: 201 },
  );
}
