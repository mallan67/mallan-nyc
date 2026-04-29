// GET/POST /api/portal/external-listings
// Buyer-submitted non-IDX listings. These are intentionally separate from IDX Listing rows.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { isAuthError, logAuditEvent, requireWorkspace } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { recordPortalEvent } from "@/lib/portal/events";
import {
  normalizeExternalListingInput,
  serializeExternalListing,
  validateExternalListingInput,
} from "@/lib/external-listings/normalize";
import { buildPortalExternalListingWhere, externalListingAccessRole } from "@/lib/external-listings/access";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req, "buyer");
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access requires a client account" }, { status: 403 });
  }

  const listings = await prisma.externalListing.findMany({
    where: await buildPortalExternalListingWhere(auth.userId),
    include: {
      lead: { select: { id: true, first_name: true, last_name: true, email: true } },
    },
    orderBy: { updated_at: "desc" },
  });

  return NextResponse.json({
    external_listings: listings.map((listing) => ({
      ...serializeExternalListing(listing),
      access_role: externalListingAccessRole(listing, auth.userId),
      owner: {
        id: listing.lead.id.toString(),
        name: `${listing.lead.first_name} ${listing.lead.last_name}`.trim() || listing.lead.email,
        email: listing.lead.email,
      },
    })),
  });
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireWorkspace(req, "buyer");
  if (isAuthError(auth)) return auth;
  if (auth.userType !== "lead") {
    return NextResponse.json({ error: "Portal access requires a client account" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = normalizeExternalListingInput(body);
  const inputError = validateExternalListingInput(input);
  if (inputError) {
    return NextResponse.json({ error: inputError }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true, agent_id: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  try {
    const listing = await prisma.externalListing.upsert({
      where: input.normalized_url
        ? {
            lead_id_normalized_url: {
              lead_id: lead.id,
              normalized_url: input.normalized_url,
            },
          }
        : { id: BigInt(0) },
      update: {
        address: input.address,
        title: input.title,
        notes: input.notes,
        action_bucket: input.action_bucket,
        status: "submitted",
        agent_id: lead.agent_id,
        submitted_by_lead_id: auth.userId,
      },
      create: {
        lead_id: lead.id,
        submitted_by_lead_id: auth.userId,
        agent_id: lead.agent_id,
        ...input,
      },
    });

    await logAuditEvent(
      "external_listing_submitted",
      "lead",
      auth.userId.toString(),
      auth,
      {
        external_listing_id: listing.id.toString(),
        url: listing.normalized_url,
        address: listing.address,
        action_bucket: listing.action_bucket,
        agent_id: lead.agent_id?.toString() ?? null,
      },
      req.headers.get("x-forwarded-for") ?? undefined,
    );

    await recordPortalEvent({
      leadId: auth.userId,
      eventType: "external_listing_submitted",
      workspace: "buyer",
      metadata: {
        external_listing_id: listing.id.toString(),
        source_host: listing.source_host,
        action_bucket: listing.action_bucket,
      },
    });

    return NextResponse.json({ external_listing: serializeExternalListing(listing) }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025" && !input.normalized_url) {
      const listing = await prisma.externalListing.create({
        data: {
          lead_id: lead.id,
          submitted_by_lead_id: auth.userId,
          agent_id: lead.agent_id,
          ...input,
        },
      });
      return NextResponse.json({ external_listing: serializeExternalListing(listing) }, { status: 201 });
    }
    throw err;
  }
}
