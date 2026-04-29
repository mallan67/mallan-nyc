// GET /api/crm/clients/[id]/buyer-priorities
// Read-only daily priorities for buyer activity. Derived from existing portal,
// showing, financial-intent, and external-listing records; no persisted queue.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAuthError, requireAgentOrBroker } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { summarizeFinancialIntent } from "@/lib/buyer-intent/financial-intent";
import { summarizeBuyerDailyPriorities } from "@/lib/buyer-priorities/summary";

type RouteParams = { params: Promise<{ id: string }> };

function decimalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayListingAddress(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["full", "UnparsedAddress", "unparsed_address", "street", "address"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

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
      roles: true,
      first_name: true,
      last_name: true,
      email: true,
      pre_approved_amount: true,
      preferences: {
        select: {
          max_price: true,
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const [externalListings, intentEvents, showings] = await Promise.all([
    prisma.externalListing.findMany({
      where: { lead_id: lead.id },
      select: {
        id: true,
        lead_id: true,
        title: true,
        address: true,
        source_host: true,
        action_bucket: true,
        family_visible: true,
        updated_at: true,
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
      take: 100,
    }),
    prisma.intentEvent.findMany({
      where: { lead_id: lead.id },
      orderBy: { recorded_at: "desc" },
      take: 250,
    }),
    prisma.showing.findMany({
      where: {
        lead_id: lead.id,
        status: { in: ["requested", "confirmed"] },
      },
      select: {
        id: true,
        status: true,
        date: true,
        created_at: true,
        listing: {
          select: {
            address: true,
            listing_id: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
  ]);

  const statedBudgetMax =
    decimalNumber(lead.preferences?.max_price) ??
    decimalNumber(lead.pre_approved_amount);
  const financialIntent = summarizeFinancialIntent(intentEvents, statedBudgetMax);
  const priorities = summarizeBuyerDailyPriorities({
    externalListings,
    financialIntent,
    showings: showings.map((showing) => ({
      ...showing,
      listing: {
        listing_id: showing.listing.listing_id,
        address: displayListingAddress(showing.listing.address),
      },
    })),
  });

  return NextResponse.json({
    client: {
      id: lead.id.toString(),
      name: `${lead.first_name} ${lead.last_name}`.trim() || lead.email,
      email: lead.email,
      roles: lead.roles,
    },
    generated_at: new Date().toISOString(),
    priorities,
  });
}
