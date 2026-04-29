// GET/POST /api/crm/clients/[id]/external-listings
// Agent/broker view and intake for non-IDX listings tied to a client.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, logAuditEvent, requireAgentOrBroker } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import {
  normalizeExternalListingInput,
  serializeExternalListing,
  validateExternalListingInput,
} from "@/lib/external-listings/normalize";
import { summarizeExternalListingActivity } from "@/lib/external-listings/rollup";

type RouteParams = { params: Promise<{ id: string }> };

async function loadAuthorizedLead(req: NextRequest, id: string) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return { auth, response: auth };

  const leadId = safeBigInt(id);
  if (!leadId) {
    return {
      auth,
      response: NextResponse.json({ error: "Invalid client id" }, { status: 400 }),
    };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      agent_id: true,
      first_name: true,
      last_name: true,
      email: true,
    },
  });

  if (!lead) {
    return {
      auth,
      response: NextResponse.json({ error: "Client not found" }, { status: 404 }),
    };
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return {
      auth,
      response: NextResponse.json({ error: "Access denied" }, { status: 403 }),
    };
  }

  return { auth, lead, response: null };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const access = await loadAuthorizedLead(req, id);
  if (access.response) return access.response;
  const { lead } = access;

  const externalListings = await prisma.externalListing.findMany({
    where: { lead_id: lead.id },
    include: {
      submitted_by: {
        select: { id: true, first_name: true, last_name: true, email: true },
      },
      comments: {
        select: {
          id: true,
          external_listing_id: true,
          lead_id: true,
          agent_id: true,
          request_type: true,
          created_at: true,
        },
        orderBy: { created_at: "asc" },
      },
    },
    orderBy: { updated_at: "desc" },
  });

  const activitySummary = summarizeExternalListingActivity(externalListings);

  return NextResponse.json({
    client: {
      id: lead.id.toString(),
      name: `${lead.first_name} ${lead.last_name}`.trim(),
      email: lead.email,
    },
    activity_summary: activitySummary,
    external_listings: externalListings.map((listing) => ({
      ...serializeExternalListing(listing),
      comment_count: listing.comments.length,
      latest_comment_at: listing.comments.at(-1)?.created_at.toISOString() ?? null,
      latest_request_type: [...listing.comments].reverse().find((comment) =>
        comment.request_type === "request_info" || comment.request_type === "showing_request"
      )?.request_type ?? null,
      submitted_by: listing.submitted_by
        ? {
            id: listing.submitted_by.id.toString(),
            name: `${listing.submitted_by.first_name} ${listing.submitted_by.last_name}`.trim(),
            email: listing.submitted_by.email,
          }
        : null,
    })),
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const { id } = await params;
  const access = await loadAuthorizedLead(req, id);
  if (access.response) return access.response;
  const { auth, lead } = access;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const normalized = normalizeExternalListingInput(body);
  const inputError = validateExternalListingInput(normalized);
  if (inputError) {
    return NextResponse.json({ error: inputError }, { status: 400 });
  }

  const agentId = lead.agent_id ?? auth.userId;
  const status = typeof body.status === "string" ? normalized.status : "reviewing";
  const data = {
    lead_id: lead.id,
    submitted_by_lead_id: null,
    agent_id: agentId,
    ...normalized,
    status,
  };

  const listing = normalized.normalized_url
    ? await prisma.externalListing.upsert({
        where: {
          lead_id_normalized_url: {
            lead_id: lead.id,
            normalized_url: normalized.normalized_url,
          },
        },
        update: {
          url: normalized.url,
          source_host: normalized.source_host,
          address: normalized.address,
          title: normalized.title,
          notes: normalized.notes,
          status,
          action_bucket: normalized.action_bucket,
          family_visible: normalized.family_visible,
          agent_id: agentId,
        },
        create: data,
      })
    : await prisma.externalListing.create({ data });

  await logAuditEvent(
    "external_listing_added_by_agent",
    "lead",
    lead.id.toString(),
    auth,
    {
      external_listing_id: listing.id.toString(),
      url: listing.normalized_url,
      address: listing.address,
      action_bucket: listing.action_bucket,
      status: listing.status,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({ external_listing: serializeExternalListing(listing) }, { status: 201 });
}
