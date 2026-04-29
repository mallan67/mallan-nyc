// GET /api/crm/clients/[id]/external-listings
// Agent/broker view of buyer-submitted non-IDX listings.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, requireAgentOrBroker } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeExternalListing } from "@/lib/external-listings/normalize";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
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
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const externalListings = await prisma.externalListing.findMany({
    where: { lead_id: lead.id },
    include: {
      submitted_by: {
        select: { id: true, first_name: true, last_name: true, email: true },
      },
    },
    orderBy: { updated_at: "desc" },
  });

  return NextResponse.json({
    client: {
      id: lead.id.toString(),
      name: `${lead.first_name} ${lead.last_name}`.trim(),
      email: lead.email,
    },
    external_listings: externalListings.map((listing) => ({
      ...serializeExternalListing(listing),
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
